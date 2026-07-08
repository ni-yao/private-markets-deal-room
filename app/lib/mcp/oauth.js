// OAuth 2.1 client for MCP servers (authorization_code + PKCE + refresh_token).
//
// Node/ESM port of the reference flow used for provider MCP servers such as
// Morningstar. These providers expose an OAuth authorization server
// (discoverable at /.well-known/oauth-authorization-server) that only supports
// the interactive `authorization_code` grant plus `refresh_token` — there is NO
// password/client-credentials grant. So headless access requires:
//   1. a ONE-TIME interactive browser login (scripts/morningstar_login.mjs) to
//      capture a long-lived refresh_token (scope offline_access), stored on disk;
//   2. at runtime, exchanging that refresh_token for short-lived access tokens.
//
// Token store: app/data/oauth/<provider>.json  (gitignored — contains secrets).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectors as connRepo } from '../repo/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_DIR = path.resolve(HERE, '..', '..', 'data', 'oauth');
const ACCESS_TOKEN_SKEW_SECONDS = 60;

export class OAuthError extends Error {}
export class NotLoggedInError extends OAuthError {}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function origin(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

async function tryGetJson(url) {
  try {
    const resp = await fetch(url, { method: 'GET' });
    if (resp.status === 200) return await resp.json();
  } catch {
    /* ignore — discovery probes are best-effort */
  }
  return null;
}

async function resourceMetadataUri(mcpUrl) {
  try {
    const resp = await fetch(mcpUrl, { method: 'GET' });
    const challenge = resp.headers.get('www-authenticate') || '';
    // RFC 9728: LSEG uses resource_metadata_uri=, Moody's uses resource_metadata=.
    const m = challenge.match(/resource_metadata(?:_uri)?="([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function parseAuthServer(data) {
  return {
    issuer: data.issuer,
    authorizationEndpoint: data.authorization_endpoint,
    tokenEndpoint: data.token_endpoint,
    registrationEndpoint: data.registration_endpoint || null,
    scopesSupported: data.scopes_supported || ['offline_access', 'openid'],
    tokenAuthMethods: data.token_endpoint_auth_methods_supported || ['client_secret_post']
  };
}

// Discover OAuth authorization-server metadata for an MCP endpoint. Tries, in
// order: RFC 9728 resource-metadata from the 401 challenge, protected-resource
// well-known, then RFC 8414 authorization-server metadata (the Morningstar path).
export async function discover(mcpUrl) {
  const org = origin(mcpUrl);
  const base = mcpUrl.replace(/\/$/, '');

  const prmUrls = [
    await resourceMetadataUri(mcpUrl),
    `${base}/.well-known/oauth-protected-resource`,
    `${org}/.well-known/oauth-protected-resource`
  ];
  for (const url of prmUrls) {
    if (!url) continue;
    const data = await tryGetJson(url);
    for (const server of (data?.authorization_servers || [])) {
      const meta = await tryGetJson(`${server.replace(/\/$/, '')}/.well-known/oauth-authorization-server`);
      if (meta?.token_endpoint) return parseAuthServer(meta);
    }
  }

  for (const url of [
    `${org}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/oauth-authorization-server`
  ]) {
    const data = await tryGetJson(url);
    if (data?.token_endpoint) return parseAuthServer(data);
  }

  throw new OAuthError(`Could not discover OAuth metadata for ${mcpUrl}.`);
}

// Dynamically register a client (RFC 7591). Returns { clientId, clientSecret,
// authMethod }. Adapts to public clients (e.g. Moody's supports only 'none').
export async function registerClient(meta, redirectUri, clientName) {
  if (!meta.registrationEndpoint) throw new OAuthError('Provider does not support dynamic client registration.');
  const authMethod = (meta.tokenAuthMethods || []).includes('client_secret_post')
    ? 'client_secret_post'
    : (meta.tokenAuthMethods || [])[0] || 'client_secret_post';
  const resp = await fetch(meta.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
      scope: meta.scopesSupported.join(' ')
    })
  });
  if (!resp.ok) throw new OAuthError(`Client registration failed (${resp.status}): ${await resp.text()}`);
  const reg = await resp.json();
  return { clientId: reg.client_id, clientSecret: reg.client_secret || null, authMethod };
}

export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthorizationUrl(meta, clientId, redirectUri, scope, state, codeChallenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${meta.authorizationEndpoint}?${params.toString()}`;
}

export async function exchangeCode(meta, clientId, clientSecret, code, redirectUri, codeVerifier) {
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier
  });
  if (clientSecret) data.set('client_secret', clientSecret);
  const resp = await fetch(meta.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: data.toString()
  });
  if (resp.status >= 400) throw new OAuthError(`Token exchange failed (${resp.status}): ${await resp.text()}`);
  return await resp.json();
}

async function refresh(tokenEndpoint, clientId, clientSecret, refreshToken) {
  const data = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  if (clientSecret) data.set('client_secret', clientSecret);
  const resp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: data.toString()
  });
  if (resp.status >= 400) throw new OAuthError(`Token refresh failed (${resp.status}): ${await resp.text()}`);
  return await resp.json();
}

// ---- token store ----------------------------------------------------------
// Three durable layers, checked in order for reads:
//   1. on-disk file  data/oauth/<provider>.json  (local dev + login flow)
//   2. env bootstrap <PROVIDER>_TOKEN_JSON (raw or base64) — Container App secret
//   3. Cosmos `connectors` container — durable across container restarts, and the
//      write target for tokens captured by the in-app login + rotated refresh
//      tokens. primeTokenCache() re-materializes Cosmos records to disk at boot
//      so the sync fs-based reads (hasLogin/loadTokens) stay durable in prod.
function storePath(provider) {
  return path.join(TOKEN_DIR, `${provider}.json`);
}

function envTokenJson(provider) {
  const raw = process.env[`${provider.toUpperCase()}_TOKEN_JSON`];
  if (!raw) return null;
  // Accept either raw JSON or base64-encoded JSON (base64 avoids shell/secret
  // quoting issues when injected as a Container App secret).
  try { return JSON.parse(raw); } catch { /* try base64 next */ }
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { return null; }
}

export function hasLogin(provider) {
  return fs.existsSync(storePath(provider)) || !!envTokenJson(provider);
}

// Re-materialize any Cosmos-persisted connector tokens to local disk so the sync
// reads see them. Called once at startup (after the repo connects).
export async function primeTokenCache() {
  try {
    const docs = await connRepo.list();
    for (const doc of docs) {
      if (!doc?.id || !doc.record) continue;
      if (fs.existsSync(storePath(doc.id))) continue; // don't clobber a fresher local login
      try {
        fs.mkdirSync(TOKEN_DIR, { recursive: true });
        fs.writeFileSync(storePath(doc.id), JSON.stringify(doc.record, null, 2), 'utf8');
      } catch { /* read-only FS: getAccessToken will still refresh in-process */ }
    }
    return docs.length;
  } catch {
    return 0;
  }
}

function writeDisk(provider, record) {
  try {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    fs.writeFileSync(storePath(provider), JSON.stringify(record, null, 2), 'utf8');
  } catch {
    /* read-only FS (e.g. container): in-process refresh still works this run */
  }
}

export function saveTokens(provider, record) {
  writeDisk(provider, record);
  // Durable mirror (best-effort) so tokens + rotated refresh tokens survive a
  // container restart / cold start.
  connRepo.upsert({ id: provider, record, updatedAt: new Date().toISOString() }).catch(() => {});
}

// Durable save: awaits the Cosmos mirror so a rotated, single-use refresh_token
// is persisted BEFORE we rely on it. Without this, a fire-and-forget write can be
// lost when the container is torn down (redeploy), leaving the next container
// with an already-consumed refresh_token → "refresh token does not exist".
export async function saveTokensDurable(provider, record) {
  writeDisk(provider, record);
  try {
    await connRepo.upsert({ id: provider, record, updatedAt: new Date().toISOString() });
  } catch {
    /* best-effort; disk still holds it for this run */
  }
}

export function loadTokens(provider) {
  const p = storePath(provider);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  const env = envTokenJson(provider);
  if (env) return env;
  throw new NotLoggedInError(`No stored login for '${provider}'. Run: node scripts/${provider}_login.mjs`);
}

// Disconnect: remove all stored tokens for a provider so hasLogin() and
// getAccessToken() report "not connected". Clears the on-disk file, the durable
// Cosmos mirror, and any in-flight refresh. An env-bootstrap token
// (<PROVIDER>_TOKEN_JSON, injected as a container secret) CANNOT be removed at
// runtime — reported via envTokenRemains so callers can surface that honestly.
export async function clearTokens(provider) {
  try { fs.rmSync(storePath(provider), { force: true }); } catch { /* ignore FS errors */ }
  try { await connRepo.remove(provider); } catch { /* best-effort durable delete */ }
  delete refreshInFlight[provider];
  return { cleared: true, envTokenRemains: !!envTokenJson(provider) };
}


async function reloadRecord(provider) {
  try {
    const doc = await connRepo.get(provider);
    return doc?.record || null;
  } catch {
    return null;
  }
}

function isInvalidGrant(err) {
  return /invalid_grant|refresh token does not exist/i.test(String(err?.message || ''));
}

// Coalesce concurrent refreshes per provider so two callers never fire the same
// single-use refresh_token in parallel (which would self-invalidate the token).
const refreshInFlight = {};

// Return a valid access token, refreshing via the stored refresh_token if needed.
export async function getAccessToken(provider) {
  const record = loadTokens(provider);
  const now = Date.now() / 1000;
  if (record.access_token && (record.expires_at || 0) > now + ACCESS_TOKEN_SKEW_SECONDS) {
    return record.access_token;
  }
  if (!record.refresh_token) {
    throw new NotLoggedInError(`No refresh_token for '${provider}'. Re-run the login.`);
  }
  if (!refreshInFlight[provider]) {
    refreshInFlight[provider] = refreshFlow(provider, record)
      .finally(() => { delete refreshInFlight[provider]; });
  }
  return refreshInFlight[provider];
}

async function refreshFlow(provider, record) {
  try {
    return await refreshAndPersist(provider, record);
  } catch (err) {
    // The refresh_token we tried may already have been rotated + persisted by an
    // earlier writer. Reload the durable record and, if it's fresher, adopt it.
    if (isInvalidGrant(err)) {
      const fresh = await reloadRecord(provider);
      if (fresh?.refresh_token && fresh.refresh_token !== record.refresh_token) {
        writeDisk(provider, fresh);
        const now = Date.now() / 1000;
        if (fresh.access_token && (fresh.expires_at || 0) > now + ACCESS_TOKEN_SKEW_SECONDS) {
          return fresh.access_token;
        }
        return await refreshAndPersist(provider, fresh);
      }
    }
    throw err;
  }
}

async function refreshAndPersist(provider, record) {
  const tok = await refresh(record.token_endpoint, record.client_id, record.client_secret, record.refresh_token);
  record.access_token = tok.access_token;
  record.expires_at = Date.now() / 1000 + Number(tok.expires_in || 3600);
  if (tok.refresh_token) record.refresh_token = tok.refresh_token; // rotating refresh tokens
  await saveTokensDurable(provider, record);
  return record.access_token;
}

