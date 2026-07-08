// OneLake filings writer.
//
// OneLake (the storage layer of Microsoft Fabric) is ADLS Gen2-compatible, so this
// writes SEC filing documents into the Fabric lakehouse's Files area through the DFS
// REST API using the app's identity (managed identity in prod via DefaultAzureCredential,
// the developer's az login locally). Target: the "Deal Room" workspace lakehouse
// deal_room_starter, folder Files/Filings — the folder the fund's analysts browse in
// Fabric alongside the market-intelligence tables.
//
// Honest status (onelakeInfo): reports configured / connected / lastWrite / the explicit
// error, so the UI never implies a write succeeded that didn't. At runtime the app's
// managed identity must hold a workspace role that permits OneLake writes (Contributor /
// Member, or a OneLake Write data-access role); until that one-time grant lands, writes
// fail loudly with the real reason rather than silently doing nothing.

import { DefaultAzureCredential } from '@azure/identity';

const ACCOUNT_HOST = process.env.ONELAKE_HOST || 'onelake.dfs.fabric.microsoft.com';
const WORKSPACE = process.env.ONELAKE_WORKSPACE_ID || process.env.FABRIC_WORKSPACE_ID || '';
const LAKEHOUSE = process.env.ONELAKE_LAKEHOUSE_ID || '';
const FILINGS_PATH = (process.env.ONELAKE_FILINGS_PATH || 'Files/Filings').replace(/^\/|\/$/g, '');
const SCOPE = 'https://storage.azure.com/.default';
const APPEND_TIMEOUT_MS = 60_000;

let _cred = null;
let _token = null;
let _tokenExp = 0;
let _lastWrite = null;
let _lastError = null;

function credential() {
  if (!_cred) _cred = new DefaultAzureCredential();
  return _cred;
}

async function bearer() {
  const now = Date.now();
  if (_token && now < _tokenExp - 60_000) return _token;
  const t = await credential().getToken(SCOPE);
  _token = t.token;
  _tokenExp = t.expiresOnTimestamp || (now + 30 * 60_000);
  return _token;
}

export function onelakeConfigured() {
  return !!(WORKSPACE && LAKEHOUSE);
}

// A OneLake path is https://{host}/{workspace}/{lakehouse}/{path}. Sanitize each
// segment of the relative path but keep the folder separators.
const safeSeg = (s) => String(s || '').replace(/[^A-Za-z0-9._ &()-]/g, '_').trim();
function safeRel(p) {
  return String(p || '').split('/').map(safeSeg).filter(Boolean).join('/');
}
function urlFor(rel) {
  const path = `${FILINGS_PATH}/${safeRel(rel)}`.replace(/\/+/g, '/');
  return `https://${ACCOUNT_HOST}/${WORKSPACE}/${LAKEHOUSE}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function dfs(method, url, { params = {}, body, headers = {} } = {}) {
  const token = await bearer();
  const qs = new URLSearchParams(params).toString();
  const full = qs ? `${url}?${qs}` : url;
  const resp = await fetch(full, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body,
    signal: AbortSignal.timeout(APPEND_TIMEOUT_MS)
  });
  return resp;
}

// Write one file to OneLake at Files/Filings/<rel>. 3-step ADLS Gen2 flow:
// create (empty) → append (bytes) → flush. Throws on any non-success with the
// real HTTP status + body so the failure is explicit.
async function writeFile(rel, buffer, contentType) {
  const url = urlFor(rel);
  const create = await dfs('PUT', url, { params: { resource: 'file' }, headers: contentType ? { 'x-ms-content-type': contentType } : {} });
  if (![200, 201].includes(create.status)) {
    throw new Error(`create ${create.status}: ${(await create.text().catch(() => '')).slice(0, 200)}`);
  }
  const append = await dfs('PATCH', url, {
    params: { action: 'append', position: '0' },
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buffer.length) },
    body: buffer
  });
  if (![200, 202].includes(append.status)) {
    throw new Error(`append ${append.status}: ${(await append.text().catch(() => '')).slice(0, 200)}`);
  }
  const flush = await dfs('PATCH', url, { params: { action: 'flush', position: String(buffer.length) } });
  if (![200, 201].includes(flush.status)) {
    throw new Error(`flush ${flush.status}: ${(await flush.text().catch(() => '')).slice(0, 200)}`);
  }
  return { path: `${FILINGS_PATH}/${safeRel(rel)}`, size: buffer.length, contentType: contentType || null };
}

// Write a set of filing documents under a common folder (e.g. a company/accession).
// files: [{ name, buffer, contentType }]. Returns a manifest; records lastWrite /
// lastError for honest status. Throws (loudly) if OneLake is not configured or the
// identity cannot write — never silently succeeds.
export async function writeFilingSet(folder, files) {
  if (!onelakeConfigured()) throw new Error('OneLake not configured (ONELAKE_WORKSPACE_ID / ONELAKE_LAKEHOUSE_ID)');
  const saved = [];
  try {
    for (const f of files) {
      const rel = `${folder}/${f.name}`;
      const r = await writeFile(rel, f.buffer, f.contentType);
      saved.push({ name: f.name, ...r });
    }
    _lastWrite = { at: new Date().toISOString(), folder: `${FILINGS_PATH}/${safeRel(folder)}`, count: saved.length, bytes: saved.reduce((s, x) => s + x.size, 0) };
    _lastError = null;
    return { ok: true, workspace: WORKSPACE, lakehouse: LAKEHOUSE, folder: `${FILINGS_PATH}/${safeRel(folder)}`, files: saved };
  } catch (err) {
    _lastError = { at: new Date().toISOString(), message: String(err?.message || err).slice(0, 300) };
    throw err;
  }
}

// List existing files under Files/Filings (optionally a subfolder). Read-only probe,
// also used to reflect what is already archived. Returns [] on any error (read is
// non-critical; write is the loud path).
export async function listFilings(subfolder = '') {
  if (!onelakeConfigured()) return [];
  try {
    const dir = `${FILINGS_PATH}${subfolder ? `/${safeRel(subfolder)}` : ''}`;
    const resp = await dfs('GET', `https://${ACCOUNT_HOST}/${WORKSPACE}`, {
      params: { resource: 'filesystem', recursive: 'true', directory: `${LAKEHOUSE}/${dir}` }
    });
    if (!resp.ok) return [];
    const data = await resp.json().catch(() => ({ paths: [] }));
    return (data.paths || [])
      .filter((p) => !p.isDirectory)
      .map((p) => ({
        path: String(p.name).replace(`${LAKEHOUSE}/`, ''),
        size: Number(p.contentLength) || 0,
        lastModified: p.lastModified || null
      }));
  } catch {
    return [];
  }
}

// Honest connectivity probe + status for /api/config and the UI.
export async function onelakeInfo({ probe = false } = {}) {
  const info = {
    configured: onelakeConfigured(),
    host: ACCOUNT_HOST,
    workspace: WORKSPACE || null,
    lakehouse: LAKEHOUSE || null,
    filingsPath: FILINGS_PATH,
    fabricUrl: WORKSPACE && LAKEHOUSE
      ? `https://app.fabric.microsoft.com/groups/${WORKSPACE}/lakehouses/${LAKEHOUSE}?selectedPath=Files%2F${encodeURIComponent(FILINGS_PATH.split('/').pop())}`
      : null,
    connected: null,
    lastWrite: _lastWrite,
    lastError: _lastError
  };
  if (probe && onelakeConfigured()) {
    try {
      // A directory list is the reliable reachability+authorization probe (200 = ok,
      // 404 = folder absent but auth ok). HEAD on a directory is not consistently
      // supported by OneLake, so we use the filesystem GET the writer path relies on.
      const resp = await dfs('GET', `https://${ACCOUNT_HOST}/${WORKSPACE}`, {
        params: { resource: 'filesystem', recursive: 'false', directory: `${LAKEHOUSE}/${FILINGS_PATH}` }
      });
      info.connected = resp.status === 200 || resp.status === 404;
      if (!info.connected) {
        info.probeStatus = resp.status;
        info.probeError = (await resp.text().catch(() => '')).slice(0, 200);
      }
    } catch (err) {
      info.connected = false;
      info.probeError = String(err?.message || err).slice(0, 200);
    }
  }
  return info;
}

export function onelakeStatusSync() {
  return {
    configured: onelakeConfigured(),
    host: ACCOUNT_HOST,
    workspace: WORKSPACE || null,
    lakehouse: LAKEHOUSE || null,
    filingsPath: FILINGS_PATH,
    lastWrite: _lastWrite,
    lastError: _lastError
  };
}
