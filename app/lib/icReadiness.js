// IC Readiness Cockpit — turns "readiness" from a completion percentage into a
// decision-grade board. Given a live deal record, computeICReadiness answers the
// seven questions an Investment Committee actually asks before it will convene:
//
//   1. Required artifacts complete?      -> requiredArtifacts[]
//   2. Which workstreams are blocking?   -> blockingWorkstreams[]
//   3. Which assumptions changed since    -> changedAssumptions[]
//      the last IC draft?
//   4. Which risks are unresolved?        -> unresolvedRisks[]  (open issues)
//   5. Which source documents support     -> supportingSources[]
//      the recommendation?
//   6. What is the exact IC ask?          -> icAsk
//   7. What conditions need approval?     -> conditions[]
//
// The overall verdict (READY / CONDITIONAL / NOT-READY) is derived from real
// gating facts (missing artifacts, blocking lanes, unresolved high-severity
// issues) — not from an averaged progress bar. Everything is grounded in what is
// actually on the deal record: workstream findings/contributions, the issue log,
// conditions, assumption snapshots, memo section status, compliance and the
// deal's documents/filings — so the board is defensible, not decorative.

import { buildReturns, fmtMoney as money } from './screening.js';

const LANE_LABEL = {
  commercial: 'Commercial DD', techai: 'Tech / AI DD', operations: 'Operations DD',
  financial: 'Financial / QoE', legal: 'Legal DD', tax: 'Tax DD', esg: 'ESG / Environmental'
};

// Memo sections that MUST be at least drafted (thesis, recommendation) vs approved.
const REQUIRED_MEMO_KEYS = ['thesis', 'recommendation'];
const OPEN_ISSUE_STATUSES = new Set(['open', 'mitigating']);
const BLOCKING_SEVERITIES = new Set(['risk', 'negative']);

const laneLabel = (l) => LANE_LABEL[l] || l;

// ---- 1. Required artifacts -------------------------------------------------
function requiredArtifacts(deal) {
  const arts = deal.artifacts || {};
  const memo = deal.memoSections || [];
  const memoApproved = memo.filter((m) => m.status === 'approved').length;
  const recSection = memo.find((m) => m.key === 'recommendation');
  const compliance = deal.compliance || [];
  const complianceCleared = compliance.length && compliance.every((c) => c.status === 'passed');

  const items = [
    { key: 'D1', label: 'D1 · Diligence plan', complete: !!arts.D1, detail: arts.D1 ? 'Plan on record.' : 'Not yet generated.' },
    { key: 'D2', label: 'D2 · Findings / red-flag report', complete: !!arts.D2, detail: arts.D2 ? 'Findings synthesized.' : 'Not yet generated.' },
    { key: 'D3', label: 'D3 · Final IC memo', complete: !!arts.D3, detail: arts.D3 ? 'Memo drafted.' : 'Not yet generated.' },
    { key: 'memo', label: 'IC memo sections approved', complete: memo.length > 0 && memoApproved === memo.length, detail: `${memoApproved}/${memo.length} sections approved.` },
    { key: 'recommendation', label: 'Recommendation section drafted', complete: !!recSection && recSection.status !== 'empty', detail: recSection ? `Status: ${recSection.status}.` : 'No recommendation section.' },
    { key: 'compliance', label: 'KYC / compliance cleared', complete: !!complianceCleared, detail: compliance.length ? `${compliance.filter((c) => c.status === 'passed').length}/${compliance.length} cleared.` : 'No compliance checks.' }
  ];
  const complete = items.filter((i) => i.complete).length;
  return { items, complete, total: items.length, allComplete: complete === items.length };
}

// ---- 2. Blocking workstreams ----------------------------------------------
function blockingWorkstreams(deal, openIssues) {
  const lanes = deal.workstreams || [];
  const out = [];
  for (const w of lanes) {
    const laneIssues = openIssues.filter((i) => i.lane === w.lane);
    const blockingIssues = laneIssues.filter((i) => BLOCKING_SEVERITIES.has(i.severity));
    const incomplete = (w.progress || 0) < 80 || w.status === 'not_started';
    const reasons = [];
    if (incomplete) reasons.push(`${w.progress || 0}% complete (${w.status || 'not started'})`);
    if (blockingIssues.length) reasons.push(`${blockingIssues.length} open high-severity issue(s)`);
    if (reasons.length) {
      out.push({ lane: w.lane, label: laneLabel(w.lane), owner: w.owner || null, progress: w.progress || 0, status: w.status || 'not_started', openIssues: laneIssues.length, blockingIssues: blockingIssues.length, reasons });
    }
  }
  return out;
}

// ---- 3. Changed assumptions (vs last snapshot) -----------------------------
export function changedAssumptions(deal) {
  const snaps = deal.assumptionSnapshots || [];
  if (!snaps.length) return { baseline: null, changes: [], note: 'No prior IC-draft snapshot to compare against.' };
  const baseline = snaps[snaps.length - 1]; // latest snapshot = last IC draft
  const now = currentAssumptions(deal);
  const changes = [];
  for (const [key, cur] of Object.entries(now)) {
    const prev = baseline.figures?.[key];
    if (prev != null && cur != null && String(prev) !== String(cur)) {
      changes.push({ key, label: ASSUMPTION_LABELS[key] || key, from: prev, to: cur });
    }
  }
  return { baseline: { label: baseline.label, at: baseline.at }, changes, note: changes.length ? `${changes.length} assumption(s) changed since "${baseline.label}".` : `No assumptions changed since "${baseline.label}".` };
}

const ASSUMPTION_LABELS = {
  revenue: 'Revenue (LTM)', ebitda: 'EBITDA (LTM)', ebitdaMargin: 'EBITDA margin',
  entryMultiple: 'Entry multiple', baseIrr: 'Base-case IRR', baseMoic: 'Base-case MoIC', dealSize: 'Enterprise value'
};

// The current key assumptions, from the deal's key figures + the returns engine.
export function currentAssumptions(deal) {
  const num = (v) => {
    const m = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
    return m ? +m : null;
  };
  const kf = {};
  for (const f of deal.keyFigures || []) {
    if (/revenue/i.test(f.label)) kf.revenue = num(f.value);
    else if (/ebitda margin/i.test(f.label)) kf.ebitdaMargin = num(f.value);
    else if (/ebitda/i.test(f.label)) kf.ebitda = num(f.value);
  }
  const cand = { ...deal, revenue: kf.revenue, ebitda: kf.ebitda, growth: deal.growth };
  let entryMultiple = null, baseIrr = null, baseMoic = null;
  try {
    const r = buildReturns({ ebitda: kf.ebitda ?? 0, dealSize: deal.dealSize ?? 0, growth: deal.growth ?? 6, revenue: kf.revenue ?? 0 });
    entryMultiple = r.entryMultiple;
    baseIrr = r.scenarios?.base?.irr ?? null;
    baseMoic = r.scenarios?.base?.moic ?? null;
  } catch { /* returns are best-effort */ }
  return { revenue: kf.revenue, ebitda: kf.ebitda, ebitdaMargin: kf.ebitdaMargin, dealSize: deal.dealSize ?? null, entryMultiple, baseIrr, baseMoic };
}

// ---- 5. Supporting sources (grounding) -------------------------------------
// Real evidence on the record: the deal's documents, the source citations on open
// and resolved issues, memo-section citations, and the sources tagged on findings.
function supportingSources(deal, allIssues) {
  const seen = new Set();
  const out = [];
  const add = (kind, label, ref) => {
    const k = `${kind}:${label}`;
    if (!label || seen.has(k)) return;
    seen.add(k);
    out.push({ kind, label, ref: ref || null });
  };
  for (const d of deal.documents || []) add('document', d.name, d.status);
  for (const iss of allIssues) for (const s of iss.sources || []) add(s.kind || 'source', s.label, s.ref || s.url || null);
  for (const m of deal.memoSections || []) for (const c of m.citations || []) add('citation', c, m.title);
  for (const w of deal.workstreams || []) {
    for (const c of w.contributions || []) if (c.source && c.source !== 'Diligence') add('finding-source', c.source, laneLabel(w.lane));
  }
  return out;
}

// ---- 6. The exact IC ask ---------------------------------------------------
function icAsk(deal) {
  if (deal.icAsk) return { ...deal.icAsk, source: 'set' };
  // Derive from the returns engine + deal fields when not explicitly set.
  const kf = currentAssumptions(deal);
  let r = null;
  try { r = buildReturns({ ebitda: kf.ebitda ?? 0, dealSize: deal.dealSize ?? 0, growth: deal.growth ?? 6, revenue: kf.revenue ?? 0 }); } catch { /* best effort */ }
  const ev = deal.dealSize ?? null;
  const equity = r?.scenarios?.base?.equity ?? (ev != null ? Math.round(ev * 0.45) : null);
  return {
    enterpriseValue: ev != null ? money(ev) : '—',
    entryMultiple: r ? `${r.entryMultiple}x adj. EBITDA` : '—',
    equityCheck: equity != null ? money(equity) : '—',
    structure: 'Control buyout · completion accounts with NWC true-up',
    hurdle: r ? `${r.hurdle.irr}% IRR / ${r.hurdle.moic}x MoIC` : '20% IRR / 2.0x MoIC',
    baseCase: r?.scenarios?.base ? `${r.scenarios.base.irr}% IRR · ${r.scenarios.base.moic}x MoIC` : '—',
    source: 'derived'
  };
}

// ---- verdict ---------------------------------------------------------------
function verdict({ required, blocking, unresolvedRisks, conditions }) {
  const gating = [];
  if (!required.allComplete) gating.push(`${required.total - required.complete} required artifact(s) incomplete`);
  if (blocking.length) gating.push(`${blocking.length} workstream(s) blocking`);
  const hardRisks = unresolvedRisks.filter((i) => i.severity === 'risk');
  if (hardRisks.length) gating.push(`${hardRisks.length} unresolved risk-level issue(s)`);
  const openConditions = conditions.filter((c) => c.status !== 'satisfied');

  let state, headline;
  if (gating.length) {
    state = 'NOT-READY';
    headline = `Not IC-ready — ${gating.join('; ')}.`;
  } else if (openConditions.length) {
    state = 'CONDITIONAL';
    headline = `IC-ready, subject to ${openConditions.length} condition(s) to close.`;
  } else {
    state = 'READY';
    headline = 'IC-ready — required artifacts complete, no blocking workstreams or unresolved risks.';
  }
  return { state, headline, gating, openConditions: openConditions.length };
}

// ---- public: the decision board --------------------------------------------
export function computeICReadiness(deal) {
  const allIssues = (deal.issues || []).slice();
  const openIssues = allIssues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));

  const required = requiredArtifacts(deal);
  const blocking = blockingWorkstreams(deal, openIssues);
  const assumptions = changedAssumptions(deal);
  const unresolvedRisks = openIssues
    .filter((i) => BLOCKING_SEVERITIES.has(i.severity) || i.severity === 'caution')
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .map((i) => ({ id: i.id, lane: i.lane, laneLabel: laneLabel(i.lane), title: i.title, severity: i.severity, owner: i.owner || null, status: i.status, resolutionPath: i.resolutionPath || null, sources: (i.sources || []).length }));
  const sources = supportingSources(deal, allIssues);
  const ask = icAsk(deal);
  const conditions = (deal.conditions || []).map((c) => ({ id: c.id, text: c.text, owner: c.owner || null, status: c.status || 'proposed' }));

  const v = verdict({ required, blocking, unresolvedRisks, conditions });

  return {
    dealId: deal.id,
    company: deal.company,
    stage: deal.stage,
    verdict: v,
    // legacy completion % kept for continuity, clearly labelled as progress-only
    progressReadiness: deal.readiness ?? null,
    requiredArtifacts: required,
    blockingWorkstreams: blocking,
    changedAssumptions: assumptions,
    unresolvedRisks,
    supportingSources: sources,
    icAsk: ask,
    conditions,
    overrides: (deal.icOverrides || []).map((o) => ({ stage: o.stage, gate: o.gate, verdict: o.verdict, reason: o.reason, by: o.by, at: o.at })),
    counts: {
      openIssues: openIssues.length,
      unresolvedRisks: unresolvedRisks.length,
      blockingWorkstreams: blocking.length,
      conditions: conditions.length,
      sources: sources.length
    }
  };
}

function sevRank(s) {
  return { risk: 4, negative: 3, caution: 2, neutral: 1, positive: 0 }[s] ?? 1;
}
