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

import { getAccessToken, hasLogin, NotLoggedInError } from '../mcp/oauth.js';
import { config } from '../config.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TEAM_NAME = config.m365.teamName;

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

// ---- Teams channel provisioning ------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Teams channel display names: ≤ 50 chars, no ~ # % & * { } + / \ : < > ? | ' "
// and can't start/end with '.' or a space. Build a safe "Deal - <company>" name.
function channelName(deal) {
  const base = `Deal - ${deal.company || deal.id}`;
  const cleaned = base
    .replace(/[~#%&*{}+/\\:<>?|'"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 50)
    .replace(/[.\s]+$/g, '');
  return cleaned || `Deal ${String(deal.id || '').slice(0, 20)}`;
}

let cachedTeamId = null;

// Find (or create) the single parent "Deal Room" team that holds one channel per
// deal. Prefers an explicit M365_TEAM_ID; then an existing joined team by name;
// then creates one (async provisioning — polled until it resolves).
export async function ensureDealRoomTeam() {
  if (config.m365.teamId) return config.m365.teamId;
  if (cachedTeamId) return cachedTeamId;

  const joined = await graph('/me/joinedTeams?$select=id,displayName');
  const existing = (joined?.value || []).find((t) => (t.displayName || '').toLowerCase() === TEAM_NAME.toLowerCase());
  if (existing) {
    cachedTeamId = existing.id;
    return cachedTeamId;
  }

  // Create the team (202 Accepted; the new team id is in the Location/Content-Location header).
  const resp = await graph('/teams', {
    method: 'POST',
    expect: 'raw',
    body: {
      'template@odata.bind': "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
      displayName: TEAM_NAME,
      description: 'The Deal Room — one channel per live deal (auto-provisioned at launch).'
    }
  });
  const loc = resp.headers.get('Location') || resp.headers.get('Content-Location') || '';
  const m = loc.match(/teams[('/]+([0-9a-fA-F-]{36})/);
  let teamId = m ? m[1] : null;

  // Poll until the team is queryable (provisioning is asynchronous).
  for (let i = 0; i < 15 && !cachedTeamId; i++) {
    await sleep(3000);
    if (teamId) {
      try {
        await graph(`/teams/${teamId}?$select=id`);
        cachedTeamId = teamId;
        break;
      } catch { /* not ready yet */ }
    }
    if (!teamId) {
      const j = await graph('/me/joinedTeams?$select=id,displayName').catch(() => null);
      const t = (j?.value || []).find((x) => (x.displayName || '').toLowerCase() === TEAM_NAME.toLowerCase());
      if (t) { cachedTeamId = t.id; teamId = t.id; break; }
    }
  }
  if (!cachedTeamId) throw new GraphError('Deal Room team was created but did not finish provisioning in time — retry shortly.');
  return cachedTeamId;
}

// Idempotently ensure a Teams channel exists for this deal; returns its live
// coordinates (including the webUrl the workspace map button opens). Reuses an
// existing channel (by stored id or matching name) instead of creating duplicates.
export async function ensureDealChannel(deal, existing) {
  const teamId = await ensureDealRoomTeam();
  const name = channelName(deal);

  // 1) already recorded on the deal → verify it still exists.
  if (existing?.channelId && existing?.teamId === teamId) {
    try {
      const ch = await graph(`/teams/${teamId}/channels/${existing.channelId}?$select=id,displayName,webUrl`);
      if (ch?.id) return { teamId, channelId: ch.id, webUrl: ch.webUrl, displayName: ch.displayName, createdAt: existing.createdAt || new Date().toISOString() };
    } catch { /* fall through to re-discover / recreate */ }
  }

  // 2) discover an existing channel with the same name.
  const chans = await graph(`/teams/${teamId}/channels?$select=id,displayName,webUrl`);
  const found = (chans?.value || []).find((c) => (c.displayName || '').toLowerCase() === name.toLowerCase());
  if (found) return { teamId, channelId: found.id, webUrl: found.webUrl, displayName: found.displayName, createdAt: new Date().toISOString() };

  // 3) create it.
  const created = await graph(`/teams/${teamId}/channels`, {
    method: 'POST',
    body: {
      displayName: name,
      description: `${deal.company} · ${deal.sector || ''} · ${deal.currency || '$'}${deal.dealSize || ''}M — diligence channel (auto-provisioned at launch).`.slice(0, 1024)
    }
  });
  return { teamId, channelId: created.id, webUrl: created.webUrl, displayName: created.displayName || name, createdAt: new Date().toISOString() };
}
