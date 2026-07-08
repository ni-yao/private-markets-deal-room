// Fabric / OneLake market-intelligence layer.
//
// The fund's real market data — comparable & historical deals, benchmark diligence
// findings, IC voting precedents, company financials and SEC filing metrics — lives
// in the Microsoft Fabric workspace "Deal Room" (lakehouse deal_room_starter, capacity
// dealroomfabric / rg-deal-room-data).
//
// This module serves that data in one of two honest modes, reported by fabricInfo():
//   • 'live'         — queried directly from the Fabric lakehouse SQL analytics
//                      endpoint at boot / on refresh (FABRIC_LIVE=true and the app
//                      identity holds Viewer on the workspace). Carries a queriedAt
//                      freshness stamp and full table-level lineage.
//   • 'materialized' — served from the real snapshot in Cosmos (connectors/fabric-cache)
//                      that scripts/extract_fabric_cache.py wrote from OneLake. Used
//                      when live is off, or attempted-but-unavailable (liveError set) —
//                      it is still real Fabric data, just point-in-time.
//   • 'unconfigured' — no snapshot and no live binding.
//
// There are no fabricated values in any mode: if live cannot connect it degrades to
// the real materialized snapshot and states so explicitly (liveError) — never fake data.

import { connectors } from './repo/index.js';
import { DefaultAzureCredential } from '@azure/identity';

const SQL_ENDPOINT = process.env.FABRIC_SQL_ENDPOINT || '';
const SQL_DATABASE = process.env.FABRIC_SQL_DATABASE || 'deal_room_starter';
const WORKSPACE = process.env.FABRIC_WORKSPACE || 'Deal Room';
const LAKEHOUSE = process.env.FABRIC_LAKEHOUSE || 'deal_room_starter';
const LIVE = String(process.env.FABRIC_LIVE || '').toLowerCase() === 'true';
const LINEAGE_TABLES = [
  'silver.dim_company', 'silver.fact_deal', 'bronze.bronze_diligence_findings',
  'bronze.bronze_ic_approvals', 'bronze.bronze_sec_filings'
];

let _snapshot = null;
let _mode = 'unconfigured'; // 'live' | 'materialized' | 'unconfigured'
let _loadedAt = null;
let _queriedAt = null;
let _liveError = null;
let _cred = null;

function credential() {
  if (!_cred) _cred = new DefaultAzureCredential();
  return _cred;
}

const num = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isNaN(n) ? null : n;
};

// Build the snapshot shape (identical to scripts/extract_fabric_cache.py) from raw
// lakehouse rows, so the live and materialized paths are byte-for-byte compatible.
function buildSnapshot({ companies, comps, fcounts, samples, ic, sec }) {
  const outCompanies = (companies || []).map((r) => ({
    ticker: r.ticker, name: r.name, sector: r.sector, industry: r.industry,
    employees: num(r.employees), marketCap: num(r.market_cap), revenue: num(r.revenue)
  }));

  const outComps = (comps || []).map((r) => ({
    company: r.company_name, ticker: r.ticker, dealType: r.deal_type,
    dealValue: num(r.deal_value), impliedValuation: num(r.implied_valuation),
    evEbitda: null, stage: r.stage, status: r.status,
    thesis: (r.investment_thesis || '').slice(0, 240), dealDate: r.deal_date
  }));

  const byWs = {};
  for (const r of fcounts || []) {
    const ws = r.workstream;
    if (!byWs[ws]) byWs[ws] = { workstream: ws, total: 0, byRisk: {} };
    byWs[ws].byRisk[r.risk_level] = num(r.c);
    byWs[ws].total += num(r.c) || 0;
  }
  const wsSamples = {};
  for (const r of samples || []) {
    (wsSamples[r.workstream] ||= []);
    if (wsSamples[r.workstream].length < 3) {
      wsSamples[r.workstream].push({
        type: r.finding_type, description: (r.description || '').slice(0, 280), risk: r.risk_level,
        remediation: (r.remediation || '').slice(0, 200), status: r.status, owner: r.owner, targetResolution: r.target_resolution
      });
    }
  }
  const benchmarkFindings = Object.keys(byWs).sort().map((ws) => ({ ...byWs[ws], samples: wsSamples[ws] || [] }));

  const icPrecedents = (ic || []).map((r) => ({
    deal: r.deal_name, decision: r.decision, votesFor: num(r.votes_for),
    votesAgainst: num(r.votes_against), votesAbstain: num(r.votes_abstain),
    conditions: String(r.conditions || '').split('|').map((c) => c.trim()).filter(Boolean),
    closingStatus: r.closing_conditions_status, meetingDate: r.ic_meeting_date
  }));

  const finByTicker = {};
  for (const r of sec || []) {
    (finByTicker[r.ticker] ||= {});
    const cur = finByTicker[r.ticker][r.metric];
    const v = num(r.value);
    if (cur == null || Math.abs(v || 0) > Math.abs(cur.value || 0)) {
      finByTicker[r.ticker][r.metric] = { value: v, unit: r.unit, form: r.form, filed: r.filed };
    }
  }

  return {
    source: `fabric:${WORKSPACE}/${LAKEHOUSE}`,
    sqlEndpoint: SQL_ENDPOINT,
    capacity: 'dealroomfabric',
    extractedAt: new Date().toISOString(),
    companies: outCompanies,
    comparableDeals: outComps,
    benchmarkFindings,
    icPrecedents,
    companyFinancials: finByTicker,
    counts: {
      companies: outCompanies.length, comparableDeals: outComps.length,
      benchmarkFindingWorkstreams: benchmarkFindings.length, icPrecedents: icPrecedents.length,
      secTickers: Object.keys(finByTicker).length
    }
  };
}

// Query the Fabric lakehouse SQL analytics endpoint directly (live path). Uses the
// app identity's AAD token against the SQL scope. Throws on any connection/auth error
// so the caller can degrade honestly to the materialized snapshot.
async function queryLive() {
  if (!SQL_ENDPOINT) throw new Error('FABRIC_SQL_ENDPOINT not set');
  const sql = (await import('mssql')).default;
  const token = await credential().getToken('https://database.windows.net/.default');
  const pool = await sql.connect({
    server: SQL_ENDPOINT,
    database: SQL_DATABASE,
    port: 1433,
    options: { encrypt: true, trustServerCertificate: false },
    authentication: { type: 'azure-active-directory-access-token', options: { token: token.token } },
    connectionTimeout: 15000,
    requestTimeout: 20000
  });
  try {
    const q = (s) => pool.request().query(s).then((r) => r.recordset);
    const [companies, comps, fcounts, samples, ic, sec] = await Promise.all([
      q('SELECT ticker,name,sector,industry,employees,market_cap,revenue FROM silver.dim_company'),
      q('SELECT company_name,ticker,deal_type,deal_value,implied_valuation,stage,status,investment_thesis,deal_date FROM silver.fact_deal ORDER BY deal_date DESC'),
      q('SELECT workstream, risk_level, COUNT(*) c FROM bronze.bronze_diligence_findings GROUP BY workstream, risk_level'),
      q("SELECT workstream, finding_type, description, risk_level, remediation, status, owner, target_resolution FROM bronze.bronze_diligence_findings WHERE risk_level IN ('Critical','High') ORDER BY workstream"),
      q('SELECT deal_name,decision,votes_for,votes_against,votes_abstain,conditions,closing_conditions_status,ic_meeting_date FROM bronze.bronze_ic_approvals'),
      q('SELECT ticker, metric, value, unit, form, filed FROM bronze.bronze_sec_filings f WHERE filed = (SELECT MAX(filed) FROM bronze.bronze_sec_filings g WHERE g.ticker=f.ticker AND g.metric=f.metric)')
    ]);
    return buildSnapshot({ companies, comps, fcounts, samples, ic, sec });
  } finally {
    await pool.close().catch(() => {});
  }
}

async function loadMaterialized() {
  const doc = await connectors.get('fabric-cache');
  if (doc && doc.record) {
    _snapshot = doc.record;
    _mode = 'materialized';
    _loadedAt = new Date().toISOString();
    return true;
  }
  return false;
}

// Load Fabric data at boot (and on refresh). Serves the real materialized snapshot
// immediately (fast, never blocks boot); when FABRIC_LIVE is on it then attempts a
// direct live lakehouse query in the background and swaps to live data on success,
// or records the explicit reason it could not (liveError). Never fabricates data.
export async function loadFabric() {
  _liveError = null;
  try {
    await loadMaterialized();
  } catch {
    if (!_snapshot) _mode = 'unconfigured';
  }
  if (LIVE) attemptLive(); // background upgrade; does not block boot
  return fabricInfo();
}

// Re-attempt the live query synchronously (used by the refresh endpoint so the
// caller sees the live/materialized outcome), else reload the materialized snapshot.
export async function refreshFabric() {
  _liveError = null;
  if (LIVE) {
    await attemptLive();
    if (_mode === 'live') return fabricInfo();
  }
  try { await loadMaterialized(); } catch { /* keep prior snapshot */ }
  return fabricInfo();
}

let _liveInFlight = null;
function attemptLive() {
  if (_liveInFlight) return _liveInFlight;
  _liveInFlight = queryLive()
    .then((snap) => {
      _snapshot = snap;
      _mode = 'live';
      _queriedAt = new Date().toISOString();
      _loadedAt = _queriedAt;
      _liveError = null;
    })
    .catch((err) => {
      _liveError = String(err?.message || err).slice(0, 240);
      // keep the real materialized snapshot already loaded
    })
    .finally(() => { _liveInFlight = null; });
  return _liveInFlight;
}

export function fabricConfigured() {
  return !!_snapshot;
}

function freshness() {
  const stamp = _mode === 'live' ? _queriedAt : (_snapshot?.extractedAt || _loadedAt);
  if (!stamp) return null;
  const ageMs = Date.now() - new Date(stamp).getTime();
  const mins = Math.max(0, Math.round(ageMs / 60000));
  const label = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
  return { asOf: stamp, ageMinutes: mins, label };
}

// Honest status + data lineage for /api/config and the UI.
export function fabricInfo() {
  const s = _snapshot;
  return {
    configured: !!s,
    mode: _mode,
    live: _mode === 'live',
    liveConfigured: LIVE,
    liveError: _liveError,
    workspace: WORKSPACE,
    lakehouse: LAKEHOUSE,
    source: s?.source || null,
    sqlEndpoint: s?.sqlEndpoint || SQL_ENDPOINT || null,
    capacity: s?.capacity || 'dealroomfabric',
    extractedAt: s?.extractedAt || null,
    queriedAt: _queriedAt,
    loadedAt: _loadedAt,
    freshness: freshness(),
    lineage: {
      platform: 'Microsoft Fabric · OneLake',
      workspace: WORKSPACE,
      lakehouse: LAKEHOUSE,
      endpoint: SQL_ENDPOINT || null,
      database: SQL_DATABASE,
      tables: LINEAGE_TABLES,
      mode: _mode
    },
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

// Comparable / historical deals, optionally biased to a sector.
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
export function getBenchmarkFindings(workstream) {
  if (!_snapshot) return [];
  const all = _snapshot.benchmarkFindings || [];
  if (!workstream) return all;
  const key = norm(workstream);
  return all.filter((w) => norm(w.workstream) === key || norm(w.workstream).includes(key));
}

// IC voting precedents (decision, votes, conditions, closing status).
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

// Sector-matched comps for a specific deal/target.
export function compsForDeal(deal) {
  const sector = deal?.sector || deal?.company?.sector || '';
  return getComparableDeals({ sector, limit: 6 });
}
