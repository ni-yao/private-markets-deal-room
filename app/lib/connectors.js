// Data-source connectivity registry + REAL connectivity tests.
//
// This replaces the old faked source status (static latency/lastSync). Each
// connector is one of:
//   - web      : the live web/news search (Bing-grounded Foundry agent). Tested
//                by a real reachability probe of the Foundry project endpoint.
//   - mcp      : a provider MCP server (Morningstar, LSEG, Moody's) reached over
//                OAuth (see lib/mcp). Tested by a real token refresh + MCP
//                `initialize` round-trip. Shows "disconnected" until signed in.
//   - database : a vendor DB integration that is NOT wired yet (PitchBook,
//                FactSet, Capital IQ). Honestly reported as disconnected.
//
// A connector only reports "connected" when a real test actually succeeds.

import { newsAgentConfigured } from './newsAgent.js';
import { McpSession } from './mcp/morningstar.js';
import { hasLogin } from './mcp/oauth.js';

export const CONNECTORS = [
  {
    id: 'web', name: 'Web', kind: 'web', role: 'discover',
    primaryJob: 'Live web & news search (Bing-grounded agent)',
    sweetSpot: 'Earliest soft signals before they hit databases'
  },
  {
    id: 'morningstar', name: 'Morningstar', kind: 'mcp', provider: 'morningstar', role: 'quality',
    primaryJob: 'Fundamentals, ratings, equity & credit research',
    sweetSpot: 'Quality / creditworthiness cross-check',
    mcpUrl: process.env.MORNINGSTAR_MCP_URL || 'https://mcp.morningstar.com/mcp'
  },
  {
    id: 'lseg', name: 'LSEG', kind: 'mcp', provider: 'lseg', role: 'confirm',
    primaryJob: 'Market data, estimates, filings, ownership',
    sweetSpot: 'Public-market data & reference cross-check',
    mcpUrl: process.env.LSEG_MCP_URL || 'https://api.analytics.lseg.com/lfa/mcp'
  },
  {
    id: 'moodys', name: "Moody's", kind: 'mcp', provider: 'moodys', role: 'quality',
    primaryJob: 'Credit ratings, research & risk assessment',
    sweetSpot: 'Credit & default-risk cross-check',
    mcpUrl: process.env.MOODYS_MCP_URL || 'https://mcp.moodys.com/mcp'
  },
  {
    id: 'pitchbook', name: 'PitchBook', kind: 'database', role: 'discover',
    primaryJob: 'Private-company fundings, PE/VC ownership, sponsor hold periods',
    sweetSpot: 'Finding sponsor-exit and founder-owned targets'
  },
  {
    id: 'factset', name: 'FactSet', kind: 'database', role: 'confirm',
    primaryJob: 'Aggregated news + estimates + filings + ownership',
    sweetSpot: 'Fast public-company monitoring & alerts'
  },
  {
    id: 'capitaliq', name: 'Capital IQ', kind: 'database', role: 'confirm',
    primaryJob: 'Deep financials, transaction history, filings, screening',
    sweetSpot: 'Comps, precedent deals, filing full-text search'
  }
];

const byId = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));

// Last successful sync per connector (updated by real tests AND real use, e.g. a
// Morningstar quality check or a web news search). In-memory: honest "never" on
// a fresh boot until the first successful operation.
const lastSync = {};
export function markSync(id) { lastSync[id] = new Date().toISOString(); }
export function getLastSync(id) { return lastSync[id] || null; }

// Short-lived cache of the last test result so repeated Home loads don't hammer
// the providers; the explicit "Test connectivity" button forces a fresh probe.
const CACHE_MS = 20_000;
const lastResult = {};

function isConfigured(c) {
  if (c.kind === 'web') return newsAgentConfigured();
  if (c.kind === 'mcp') return hasLogin(c.provider);
  return false;
}

function result(c, fields) {
  const r = { id: c.id, name: c.name, checkedAt: new Date().toISOString(), lastSync: getLastSync(c.id), ...fields };
  lastResult[c.id] = r;
  return r;
}

async function testWeb(c) {
  if (!newsAgentConfigured()) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'News agent not configured.' });
  }
  const url = (process.env.FOUNDRY_PROJECT_ENDPOINT || '').replace(/\/$/, '');
  const t0 = Date.now();
  try {
    // Any HTTP response means the Bing-grounded agent backend is reachable; only
    // a network failure / timeout rejects.
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · Bing-grounded agent reachable in ${latencyMs}ms` });
  } catch (e) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: Date.now() - t0, message: `Unreachable · ${e.name || 'error'}` });
  }
}

async function testMcp(c) {
  if (!hasLogin(c.provider)) {
    return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Not connected — sign in to enable this source.' });
  }
  const t0 = Date.now();
  try {
    const session = new McpSession(c.provider, c.mcpUrl);
    await session.initialize();
    const latencyMs = Date.now() - t0;
    markSync(c.id);
    return result(c, { ok: true, status: 'connected', latencyMs, lastSync: getLastSync(c.id), message: `Healthy · MCP session established in ${latencyMs}ms` });
  } catch (e) {
    return result(c, { ok: false, status: 'degraded', latencyMs: Date.now() - t0, message: `Reachable but errored · ${String(e.message || e).slice(0, 90)}` });
  }
}

// Run a real connectivity test for one connector. Databases (unwired) always
// report disconnected. Soft-cached for CACHE_MS unless force=true.
export async function testConnector(id, { force = false } = {}) {
  const c = byId[id];
  if (!c) return null;
  const cached = lastResult[id];
  if (!force && cached && Date.now() - new Date(cached.checkedAt).getTime() < CACHE_MS) return cached;

  if (c.kind === 'web') return testWeb(c);
  if (c.kind === 'mcp') return testMcp(c);
  return result(c, { ok: false, status: 'disconnected', latencyMs: null, message: 'Integration not wired — no live connection.' });
}

// The connector table for the Home connectivity panel: metadata + whether it can
// be tested/connected + the last known result (if any this session).
export function listConnectors() {
  return CONNECTORS.map((c) => {
    const configured = isConfigured(c);
    const cached = lastResult[c.id];
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      provider: c.provider || null,
      role: c.role,
      primaryJob: c.primaryJob,
      sweetSpot: c.sweetSpot,
      configured,
      testable: c.kind === 'web' ? true : c.kind === 'mcp' ? configured : false,
      connectable: c.kind === 'mcp',                 // can be signed-in via OAuth
      status: cached ? cached.status : c.kind === 'database' ? 'disconnected' : configured ? 'unknown' : 'disconnected',
      latencyMs: cached ? cached.latencyMs : null,
      lastSync: getLastSync(c.id),
      message: cached ? cached.message : null
    };
  });
}
