// Fabric / OneLake market-intelligence layer.
//
// The fund's real market data — comparable & historical deals, benchmark diligence
// findings, IC voting precedents, company financials and SEC filing metrics — lives
// in the Microsoft Fabric workspace "Deal Room" (lakehouse deal_room_starter, capacity
// dealroomfabric / rg-deal-room-data). scripts/extract_fabric_cache.py reads that
// OneLake data through the lakehouse SQL endpoint and materializes a real snapshot into
// Cosmos (connectors/fabric-cache). This module serves that real snapshot to the app so
// artifacts and the IC cockpit are grounded in Fabric data — no fabricated values.
//
// Live binding: when the app's managed identity is granted Viewer on the Fabric
// workspace (a one-time grant by the workspace admin), FABRIC_SQL_ENDPOINT can drive
// direct live reads. Until then the materialized snapshot is the source; fabricInfo()
// reports the honest mode so the UI never implies a live link that doesn't exist.

import { connectors } from './repo/index.js';

const SQL_ENDPOINT = process.env.FABRIC_SQL_ENDPOINT || '';
const WORKSPACE = process.env.FABRIC_WORKSPACE || 'Deal Room';
const LIVE_BOUND = String(process.env.FABRIC_LIVE || '').toLowerCase() === 'true';

let _snapshot = null;
let _loadedAt = null;

// Load the materialized Fabric snapshot from Cosmos. Called once at store hydrate;
// safe to call again to refresh. On any failure it leaves the cache untouched.
export async function loadFabric() {
  try {
    const doc = await connectors.get('fabric-cache');
    if (doc && doc.record) {
      _snapshot = doc.record;
      _loadedAt = new Date().toISOString();
    }
  } catch {
    /* leave existing cache; fabricInfo() reflects unconfigured if never loaded */
  }
  return fabricInfo();
}

export function fabricConfigured() {
  return !!_snapshot;
}

// Honest status for /api/config. mode:
//   'live'         — bound directly to the Fabric SQL endpoint (MI grant in place)
//   'materialized' — serving the real snapshot extracted from Fabric/OneLake
//   'unconfigured' — no snapshot loaded and no live binding
export function fabricInfo() {
  const s = _snapshot;
  const mode = LIVE_BOUND && SQL_ENDPOINT ? 'live' : s ? 'materialized' : 'unconfigured';
  return {
    configured: !!s,
    mode,
    workspace: WORKSPACE,
    source: s?.source || null,
    sqlEndpoint: s?.sqlEndpoint || SQL_ENDPOINT || null,
    capacity: s?.capacity || 'dealroomfabric',
    extractedAt: s?.extractedAt || null,
    loadedAt: _loadedAt,
    counts: s?.counts || null
  };
}

// Full market-intelligence view (safe read-only projection of the snapshot).
export function getMarketIntel() {
  if (!_snapshot) return null;
  const s = _snapshot;
  return {
    info: fabricInfo(),
    companies: s.companies || [],
    comparableDeals: s.comparableDeals || [],
    benchmarkFindings: s.benchmarkFindings || [],
    icPrecedents: s.icPrecedents || [],
    companyFinancials: s.companyFinancials || {}
  };
}

const norm = (x) => String(x || '').toLowerCase();

// Comparable / historical deals, optionally biased to a sector. Returns the sector
// matches first, then the rest (comps are scarce; we never hide the real set).
export function getComparableDeals({ sector, limit = 8 } = {}) {
  if (!_snapshot) return [];
  const all = _snapshot.comparableDeals || [];
  if (!sector) return all.slice(0, limit);
  const key = norm(sector);
  const scored = all
    .map((d) => ({ d, hit: norm(d.thesis).includes(key) || norm(d.company).includes(key) || norm(d.dealType).includes(key) }))
    .sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
  return scored.map((x) => x.d).slice(0, limit);
}

// Benchmark diligence findings from real prior deals, optionally one workstream.
// These ground the diligence plan/issue log (what findings actually arise, at what
// severity, with real remediation patterns) rather than invented placeholders.
export function getBenchmarkFindings(workstream) {
  if (!_snapshot) return [];
  const all = _snapshot.benchmarkFindings || [];
  if (!workstream) return all;
  const key = norm(workstream);
  return all.filter((w) => norm(w.workstream) === key || norm(w.workstream).includes(key));
}

// IC voting precedents (decision, votes, conditions, closing status) — grounds the
// cockpit's conditions/verdict in how the IC actually decided on prior deals.
export function getICPrecedents() {
  if (!_snapshot) return [];
  return _snapshot.icPrecedents || [];
}

// Real company financials from SEC filing metrics, plus dim_company metadata.
export function getCompanyFinancials(ticker) {
  if (!_snapshot || !ticker) return null;
  const t = String(ticker).toUpperCase();
  const metrics = (_snapshot.companyFinancials || {})[t];
  if (!metrics) return null;
  const meta = (_snapshot.companies || []).find((c) => String(c.ticker).toUpperCase() === t) || null;
  return { ticker: t, company: meta, metrics };
}

// Sector-matched comps for a specific deal/target — used by the IC cockpit and the
// market-intelligence panel to attach real supporting sources to a recommendation.
export function compsForDeal(deal) {
  const sector = deal?.sector || deal?.company?.sector || '';
  const comps = getComparableDeals({ sector, limit: 6 });
  return comps;
}
