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

// Auto-publish a deal team to every member of the "Private Equity Deals" group,
// so each deal channel is visible to the whole PE deal team. Best-effort +
// idempotent (a user already on the team returns 4xx which we ignore). Needs
// GroupMember.Read.All + TeamMember.ReadWrite.All (admin-consented).
// The group whose members every deal channel is published to. Tenant-configurable
// (env), defaults to the reference "Private Equity Deals" team.
const PUBLISH_GROUP = (process.env.M365_PUBLISH_GROUP || 'Private Equity Deals').trim();

// Install the org-catalog Deal Dashboard Teams app into a deal team so its bot can
// receive @mentions in the channel. Uses the org-catalog teamsApp id directly
// (no catalog read scope needed). Best-effort + idempotent (409 = already installed).
// Requires TeamsAppInstallation.ReadWriteForTeam (admin-consented). The catalog id
// is tenant-specific and MUST be supplied via TEAMS_APP_CATALOG_ID; when unset the
// install step is skipped (non-fatal — the bot still works once installed manually).
const TEAMS_APP_CATALOG_ID = (process.env.TEAMS_APP_CATALOG_ID || '').trim();
export async function installTeamsAppInTeam(teamId) {
  if (!teamId) return { installed: false, reason: 'no-team' };
  if (!TEAMS_APP_CATALOG_ID) { console.log('[install] TEAMS_APP_CATALOG_ID not set — skipping app install'); return { installed: false, reason: 'no-catalog-id' }; }
  try {
    await graph(`/teams/${teamId}/installedApps`, {
      method: 'POST',
      body: { 'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${TEAMS_APP_CATALOG_ID}` }
    });
    console.log(`[install] app ${TEAMS_APP_CATALOG_ID} installed in team ${teamId}`);
    return { installed: true, appId: TEAMS_APP_CATALOG_ID };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/→ 409|already|Conflict/i.test(msg)) { console.log(`[install] app already in team ${teamId}`); return { installed: true, already: true, appId: TEAMS_APP_CATALOG_ID }; }
    console.error(`[install] FAILED team ${teamId}: ${msg.slice(0, 260)}`);
    return { installed: false, error: msg.slice(0, 160) };
  }
}

export async function publishTeamToGroup(teamId, groupName = PUBLISH_GROUP) {
  if (!teamId) return { added: 0, reason: 'no-team' };
  try {
    const g = await graph(`/groups?$filter=displayName eq '${String(groupName).replace(/'/g, "''")}'&$select=id`);
    const groupId = g?.value?.[0]?.id;
    if (!groupId) return { added: 0, reason: 'group-not-found' };
    const members = await graph(`/groups/${groupId}/members?$select=id,userPrincipalName&$top=999`);
    let added = 0;
    for (const m of (members?.value || [])) {
      if (!m.id) continue;
      try {
        await graph(`/teams/${teamId}/members`, {
          method: 'POST',
          body: {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: [],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${m.id}')`
          }
        });
        added++;
      } catch { /* already a member / not addable — ignore */ }
    }
    return { added, groupId, total: (members?.value || []).length };
  } catch (err) {
    return { added: 0, error: String(err?.message || err).slice(0, 160) };
  }
}

// Idempotently ensure THIS deal has its own team; returns its live coordinates
// (webUrl opens the team / its General channel). Reuses the team recorded on the
// deal, or an existing joined team with the same name, before creating a new one.
// Deal channel display name (Teams: ≤50 chars, limited punctuation).
function channelName(deal) {
  const base = String(deal.company || `Deal ${deal.id}`).replace(/[~#%&*{}/\\:<>?+|"'\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return base.slice(0, 48) || `Deal ${String(deal.id || '').slice(0, 20)}`;
}

// Create/reuse ONE channel per deal inside the pinned parent team (e.g. "Private
// Equity Deals"), in the threads (chat) layout. Everyone in that team sees it and
// the app/bot is installed once on the team. Requires Channel.Create (admin-consented).
async function ensureDealChannelInParent(deal, parentTeamId, existing) {
  const name = channelName(deal);
  const team = await getTeam(parentTeamId);
  if (existing?.channelId && existing.teamId === parentTeamId) {
    try {
      const c = await graph(`/teams/${parentTeamId}/channels/${existing.channelId}?$select=id,displayName,webUrl`);
      if (c?.id) return { teamId: parentTeamId, channelId: c.id, webUrl: c.webUrl, displayName: c.displayName, createdAt: existing.createdAt || new Date().toISOString() };
    } catch { /* recreate below */ }
  }
  const list = await graph(`/teams/${parentTeamId}/channels?$select=id,displayName,webUrl`).catch(() => null);
  const found = (list?.value || []).find((c) => (c.displayName || '').toLowerCase() === name.toLowerCase());
  if (found) {
    try { await graph(`/teams/${parentTeamId}/channels/${found.id}`, { method: 'PATCH', body: { layoutType: 'chat' } }); } catch { /* best-effort threads */ }
    return { teamId: parentTeamId, channelId: found.id, webUrl: found.webUrl, displayName: found.displayName, createdAt: new Date().toISOString() };
  }
  let created;
  try {
    created = await graph(`/teams/${parentTeamId}/channels`, { method: 'POST', body: { displayName: name, description: `${deal.company} — deal channel (auto-provisioned)`.slice(0, 1024), membershipType: 'standard', layoutType: 'chat' } });
  } catch {
    // Some tenants reject layoutType at creation — retry without it, then PATCH.
    created = await graph(`/teams/${parentTeamId}/channels`, { method: 'POST', body: { displayName: name, membershipType: 'standard' } });
    if (created?.id) { try { await graph(`/teams/${parentTeamId}/channels/${created.id}`, { method: 'PATCH', body: { layoutType: 'chat' } }); } catch { /* ignore */ } }
  }
  return { teamId: parentTeamId, channelId: created?.id || null, webUrl: created?.webUrl || team.webUrl, displayName: created?.displayName || name, createdAt: new Date().toISOString() };
}

// Idempotently ensure THIS deal has its own space. Prefers a channel in the pinned
// parent team (M365_TEAM_ID); falls back to a team-per-deal when none is set.
export async function ensureDealChannel(deal, existing) {
  const parentTeamId = (process.env.M365_TEAM_ID || '').trim();
  if (parentTeamId) return ensureDealChannelInParent(deal, parentTeamId, existing);

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

