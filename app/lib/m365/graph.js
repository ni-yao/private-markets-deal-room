// Microsoft 365 Graph client (delegated) for The Deal Room.
//
// Uses the M365 connector's delegated token — stored under provider 'm365' in the
// shared OAuth token store (lib/mcp/oauth.js) once a user connects M365 from the
// Home connectivity panel — to call Microsoft Graph on behalf of that user.
//
// Powers two things:
//   • identity  — GET /me, for the connector's real connectivity test, and
//   • Teams     — provisioning ONE real Teams channel per deal at launch, so the
//                 "Microsoft Teams" button on the deal workspace map opens a live
//                 channel for that specific deal.
//
// Every M365-dependent step goes through this module, so the single delegated
// connection is reused everywhere.

import { getAccessToken, hasLogin, loadTokens, NotLoggedInError } from '../mcp/oauth.js';
import { config } from '../config.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class GraphError extends Error {}
export class M365NotConnectedError extends Error {}

// The M365 login can be OFFERED once the app registration is configured…
export function m365Configured() {
  return !!(config.m365.clientId && config.m365.clientSecret);
}
// …and is CONNECTED once a user has signed in (delegated token stored).
export function m365Connected() {
  return hasLogin('m365');
}

// Whether the stored delegated token carries the SharePoint/OneDrive file write
// scope (Files.ReadWrite.All) — i.e. the deal SharePoint data room can actually
// be provisioned. Surfaced in /config so the app (and the operator) can confirm,
// after connecting M365, whether file access was granted without guesswork.
export function m365FilesScope() {
  try {
    const rec = loadTokens('m365');
    return /(^|\s)Files\.ReadWrite(\.All)?(\s|$)/i.test(rec?.scope || '');
  } catch {
    return false;
  }
}

async function graph(path, { method = 'GET', body, headers = {}, expect } = {}) {
  let token;
  try {
    token = await getAccessToken('m365');
  } catch (err) {
    if (err instanceof NotLoggedInError) throw new M365NotConnectedError('M365 is not connected — sign in from the Home connectivity panel.');
    throw err;
  }
  const resp = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new GraphError(`Graph ${method} ${path} → ${resp.status}: ${text.slice(0, 240)}`);
  }
  if (expect === 'raw') return resp;
  if (resp.status === 204) return null;
  const ct = resp.headers.get('content-type') || '';
  return ct.includes('application/json') ? resp.json() : null;
}

// The signed-in user (connector connectivity test + "connected as").
export async function me() {
  const u = await graph('/me?$select=displayName,userPrincipalName,mail,id');
  return { displayName: u.displayName, upn: u.userPrincipalName, mail: u.mail || u.userPrincipalName, id: u.id };
}

// ---- Teams provisioning (one Team per deal) ------------------------------
// A deal gets its OWN Microsoft Teams team ("Deal - <company>"), created with the
// user-consentable Team.Create permission (no tenant-admin consent needed — unlike
// Channel.Create). The team's default General channel is "the deal's channel"; the
// workspace button opens the team via its webUrl.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Team display names allow most characters but keep it clean and bounded (≤ 120).
function teamName(deal) {
  const base = `Deal - ${deal.company || deal.id}`;
  return base.replace(/\s+/g, ' ').trim().slice(0, 120) || `Deal ${String(deal.id || '').slice(0, 20)}`;
}

async function getTeam(teamId) {
  return graph(`/teams/${teamId}?$select=id,displayName,webUrl`);
}

// Force the deal team's primary (General) channel into the "chat"/threads layout
// (vs the traditional post-reply layout). Requires ChannelSettings.ReadWrite.All
// (admin-consented). Non-fatal if the scope isn't granted — returns the channel id.
async function setChannelThreads(teamId) {
  try {
    const pc = await graph(`/teams/${teamId}/primaryChannel?$select=id,layoutType`);
    if (pc?.id && pc.layoutType !== 'chat') {
      await graph(`/teams/${teamId}/channels/${pc.id}`, { method: 'PATCH', body: { layoutType: 'chat' } });
    }
    return pc?.id || null;
  } catch {
    return null;
  }
}

// Idempotently ensure THIS deal has its own team; returns its live coordinates
// (webUrl opens the team / its General channel). Reuses the team recorded on the
// deal, or an existing joined team with the same name, before creating a new one.
export async function ensureDealChannel(deal, existing) {
  const name = teamName(deal);

  // 1) already recorded on the deal → verify it still exists.
  if (existing?.teamId) {
    try {
      const t = await getTeam(existing.teamId);
      if (t?.id) { const channelId = await setChannelThreads(t.id); return { teamId: t.id, channelId: channelId || existing.channelId || null, webUrl: t.webUrl, displayName: t.displayName, createdAt: existing.createdAt || new Date().toISOString() }; }
    } catch { /* fall through to re-discover / recreate */ }
  }

  // 2) discover an existing joined team with the same name.
  const joined = await graph('/me/joinedTeams?$select=id,displayName').catch(() => null);
  const found = (joined?.value || []).find((t) => (t.displayName || '').toLowerCase() === name.toLowerCase());
  if (found) {
    const t = await getTeam(found.id).catch(() => null);
    const channelId = await setChannelThreads(found.id);
    return { teamId: found.id, channelId, webUrl: t?.webUrl || null, displayName: found.displayName, createdAt: new Date().toISOString() };
  }

  // 3) create the deal's team (202 Accepted; team id is in the Location header).
  const resp = await graph('/teams', {
    method: 'POST',
    expect: 'raw',
    body: {
      'template@odata.bind': "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
      displayName: name,
      description: `${deal.company} · ${deal.sector || ''} · ${deal.currency || '$'}${deal.dealSize || ''}M — deal diligence space (auto-provisioned at launch).`.slice(0, 1024)
    }
  });
  const loc = resp.headers.get('Location') || resp.headers.get('Content-Location') || '';
  const m = loc.match(/teams[('/]+([0-9a-fA-F-]{36})/);
  let teamId = m ? m[1] : null;

  // Poll until the new team is queryable (provisioning is asynchronous).
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    if (!teamId) {
      const j = await graph('/me/joinedTeams?$select=id,displayName').catch(() => null);
      const t = (j?.value || []).find((x) => (x.displayName || '').toLowerCase() === name.toLowerCase());
      if (t) teamId = t.id;
    }
    if (teamId) {
      try {
        const t = await getTeam(teamId);
        if (t?.id) { const channelId = await setChannelThreads(t.id); return { teamId: t.id, channelId, webUrl: t.webUrl, displayName: t.displayName || name, createdAt: new Date().toISOString() }; }
      } catch { /* not ready yet */ }
    }
  }
  throw new GraphError('The deal team was created but did not finish provisioning in time — open it again shortly.');
}

// ---- SharePoint folder provisioning (the deal's VDR document library) -------
// Every Team is backed by an M365 group whose SharePoint site has a default
// document library ("Documents" / "Shared Documents"). We resolve that drive and
// create the standard VDR folder taxonomy inside it, so the deal's SharePoint
// isn't just a link — it opens a real, indexed data room. Idempotent: a folder
// that already exists (409) is treated as success. Best-effort at the call site:
// a failure here never blocks the Teams provisioning or the deal launch.

// The team's default document library drive (the group id == the team id).
async function getTeamDrive(teamId) {
  return graph(`/groups/${teamId}/drive?$select=id,webUrl`);
}

// Create one folder at the drive root; treat an existing folder as success.
async function ensureFolder(driveId, name) {
  try {
    const created = await graph(`/drives/${driveId}/root/children`, {
      method: 'POST',
      body: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }
    });
    return { name, url: created?.webUrl || null, created: true };
  } catch (err) {
    // 409 nameAlreadyExists → the folder is already there; look it up for its URL.
    if (/→ 409/.test(String(err?.message || ''))) {
      const seg = encodeURIComponent(name);
      const existing = await graph(`/drives/${driveId}/root:/${seg}?$select=webUrl`).catch(() => null);
      return { name, url: existing?.webUrl || null, created: false };
    }
    throw err;
  }
}

// Provision the standard VDR folder taxonomy into the deal team's document library.
// Returns { driveId, driveWebUrl, folders: [{ name, url, created }] }. Folders are
// created sequentially (small, bounded list) to stay well within Graph throttling.
export async function provisionDealFolders(teamId, folderNames) {
  const drive = await getTeamDrive(teamId);
  if (!drive?.id) throw new GraphError('Could not resolve the deal team document library.');
  const folders = [];
  for (const name of folderNames) {
    try {
      folders.push(await ensureFolder(drive.id, name));
    } catch (err) {
      folders.push({ name, url: null, created: false, error: String(err?.message || err).slice(0, 120) });
    }
  }
  return { driveId: drive.id, driveWebUrl: drive.webUrl || null, folders };
}

