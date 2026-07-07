// Deterministic Stage-2 (diligence-to-close) artifact engine — the grounded
// backbone for the D1-D5 steps, mirroring lib/screening.js for Stage 1. Each
// function turns a launched deal into the real artifact a US mid-market PE firm
// produces at that step, computed from the deal record (no model needed). The AI
// layer (lib/agents.js) adds narrative; deterministic output always stands alone.
//
// Grounded in practitioner research (Big-4 DD guides, Wall Street Prep, CFI,
// M&I/Multiple Expansion, Bain/BCG CDD, law-firm SPA guides, ILPA, DealRoom/
// Midaxo/Ansarada, Datasite):
//   D1 Launch      -> Diligence Plan (workstreams from memo risks, advisers, budget, timeline)
//   D2 Diligence   -> Findings / Red-Flag Report (workstream taxonomy + severity rollup)
//   D3 Synthesis   -> Final IC Memo (diligence-backed: returns + findings synthesis + exit)
//   D4 Approval    -> Execution Pack (IC decision, SPA terms, conditions precedent, funds flow)
//   D5 Archive     -> Close-out & 100-Day Plan (value creation, governance, records)

import { buildReturns, fmtMoney as money } from './screening.js';

const pct = (n) => `${Math.round(n)}%`;
const round = (n) => Math.round(n);

// A launched deal exposes: company, sector, subSector, dealSize (EV $M), hq,
// keyFigures, workstreams[], thesis. We derive EBITDA/revenue from keyFigures.
function dealFinancials(deal) {
  const num = (label, fallback) => {
    const kf = (deal.keyFigures || []).find((k) => new RegExp(label, 'i').test(k.label));
    const v = kf ? Number(String(kf.value).replace(/[^0-9.]/g, '')) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const ev = deal.dealSize || 300;
  const revenue = num('revenue', round(ev * 1.2));
  const ebitda = num('ebitda', round(ev * 0.12));
  const marginKf = (deal.keyFigures || []).find((k) => /margin/i.test(k.label));
  const ebitdaMargin = marginKf ? Number(String(marginKf.value).replace(/[^0-9.]/g, '')) : (revenue ? +((ebitda / revenue) * 100).toFixed(1) : 12);
  return { ev, revenue, ebitda, ebitdaMargin };
}

// A candidate-shaped object so we can reuse the Stage-1 paper-LBO returns engine.
function dealAsCandidate(deal) {
  const f = dealFinancials(deal);
  return {
    company: deal.company, sector: deal.sector, ownership: deal.ownership || 'private',
    dealSize: f.ev, revenue: f.revenue, ebitda: f.ebitda, ebitdaMargin: f.ebitdaMargin,
    growth: deal.growth ?? 7, keywords: deal.keywords || [], sources: deal.sources || []
  };
}

// ===========================================================================
//  D1 · LAUNCH ORCHESTRATION — Diligence Plan
// ===========================================================================
// Research: the plan starts from the deal's key RISK HYPOTHESES (not a generic
// checklist), scopes workstreams, engages third-party advisers, sets a DD budget
// and a 6-10 week exclusivity/DD timeline, and distributes a 200-300 item IRL.

// The standard confirmatory-DD workstreams + the adviser a firm engages for each.
const WORKSTREAMS = [
  { key: 'financial', label: 'Financial / Quality of Earnings', adviser: 'Big-4 QoE (Deloitte / PwC / EY / KPMG)', scope: 'Normalize EBITDA, validate addbacks, revenue quality, NWC peg, net-debt items.', priorityBase: 5 },
  { key: 'commercial', label: 'Commercial DD', adviser: 'Strategy consultant (Bain / BCG / L.E.K. / OC&C)', scope: 'Market size & growth, competitive position, customer concentration, voice-of-customer, pricing.', priorityBase: 5 },
  { key: 'legal', label: 'Legal DD', adviser: 'Deal counsel (Kirkland / Goodwin / DLA Piper)', scope: 'Corporate, material contracts, change-of-control, litigation, IP, employment, regulatory.', priorityBase: 4 },
  { key: 'tax', label: 'Tax DD & structuring', adviser: 'Tax adviser (Big-4 / RSM)', scope: 'Income + non-income taxes (sales/use, employment), NOLs, exposures, acquisition structure.', priorityBase: 3 },
  { key: 'operational', label: 'Operational DD', adviser: 'Ops specialist (AlixPartners / A&M)', scope: 'Supply chain, procurement, manufacturing footprint, operational KPIs, cost-out.', priorityBase: 3 },
  { key: 'tech', label: 'Technology / IT / Cyber DD', adviser: 'Tech DD (West Monroe / Crosslake / Mandiant)', scope: 'Systems, tech debt, scalability, cybersecurity posture, data.', priorityBase: 2 },
  { key: 'hr', label: 'HR / Management DD', adviser: 'Exec assessment (ghSMART / Spencer Stuart)', scope: 'Org & key-person risk, comp benchmarking, pension/deferred-comp, management references.', priorityBase: 2 },
  { key: 'esg', label: 'ESG / Environmental', adviser: 'Environmental (Phase I ESA per ASTM E1527-21)', scope: 'Phase I ESA on owned/leased sites, RECs, sustainability & governance screen.', priorityBase: 1 }
];

// Map a screening-memo risk phrase to the workstream that should own it, so the
// plan's priorities reflect the specific deal's risks (not a generic checklist).
function riskToWorkstream(riskText) {
  const t = String(riskText || '').toLowerCase();
  if (/margin|ebitda|earnings|profitab|addback|working capital|accounting/.test(t)) return 'financial';
  if (/growth|market|customer|concentration|competit|demand|pricing|commercial/.test(t)) return 'commercial';
  if (/litigat|contract|ip|legal|regulat|change.?of.?control/.test(t)) return 'legal';
  if (/tax/.test(t)) return 'tax';
  if (/supply|manufactur|operational|procurement|cost/.test(t)) return 'operational';
  if (/tech|it |cyber|system|data|software/.test(t)) return 'tech';
  if (/founder|key.?person|management|talent|retention|pension/.test(t)) return 'hr';
  if (/esg|environment|contaminat|sustainab/.test(t)) return 'esg';
  return null;
}

export function buildDiligencePlan(deal, memoRisks = []) {
  const f = dealFinancials(deal);
  // Elevate the priority of workstreams that own a screening-memo risk.
  const riskCounts = {};
  for (const r of memoRisks) {
    const ws = riskToWorkstream(typeof r === 'string' ? r : r.risk);
    if (ws) riskCounts[ws] = (riskCounts[ws] || 0) + 1;
  }
  const workstreams = WORKSTREAMS.map((w) => {
    const priority = w.priorityBase + (riskCounts[w.key] || 0) * 2;
    const tier = priority >= 6 ? 'critical' : priority >= 4 ? 'high' : priority >= 2 ? 'standard' : 'confirmatory';
    return {
      key: w.key, label: w.label, adviser: w.adviser, scope: w.scope,
      priority, tier,
      focus: riskCounts[w.key] ? `Elevated — carries ${riskCounts[w.key]} screening-memo risk${riskCounts[w.key] > 1 ? 's' : ''} to confirm.` : null
    };
  }).sort((a, b) => b.priority - a.priority);

  // DD budget: third-party spend scales with deal size (research: QoE + CDD + legal
  // dominate; ~0.6-1.2% of EV at mid-market, floored so small deals still ring true).
  const budgetPct = f.ev >= 500 ? 0.006 : f.ev >= 250 ? 0.008 : 0.011;
  const budgetTotal = Math.max(0.35, +(f.ev * budgetPct).toFixed(2)); // $M
  const budget = [
    { item: 'Quality of Earnings (QoE)', amount: +(budgetTotal * 0.28).toFixed(2) },
    { item: 'Commercial DD', amount: +(budgetTotal * 0.30).toFixed(2) },
    { item: 'Legal & tax counsel', amount: +(budgetTotal * 0.24).toFixed(2) },
    { item: 'Ops / tech / ESG / other', amount: +(budgetTotal * 0.18).toFixed(2) }
  ];

  const exclusivityWeeks = f.ev >= 500 ? 9 : 7;
  return {
    kind: 'plan',
    company: deal.company,
    workstreams,
    budget,
    budgetTotal,
    timeline: {
      exclusivityWeeks,
      irlItems: '200–300',
      phases: [
        { name: 'Kickoff & IRL', window: 'Week 1', detail: 'Engage advisers, distribute the information-request list, open the VDR.' },
        { name: 'Fieldwork', window: `Weeks 2–${exclusivityWeeks - 2}`, detail: 'Parallel workstreams; QoE on-site, management sessions, voice-of-customer calls.' },
        { name: 'Findings & synthesis', window: `Weeks ${exclusivityWeeks - 1}–${exclusivityWeeks}`, detail: 'Red-flag reports land, issues log finalized, IC memo drafted.' }
      ]
    },
    dataRoom: { platform: 'Datasite / Ansarada VDR', sections: 13, note: 'Q&A centralized in the VDR (can consume up to 70% of deal time).' },
    headline: `${workstreams.filter((w) => w.tier === 'critical').length} critical workstream(s) · ${money(budgetTotal)} DD budget · ${exclusivityWeeks}-week exclusivity window.`
  };
}

// ===========================================================================
//  D2 · DILIGENCE — Findings / Red-Flag Report
// ===========================================================================
// Research: each workstream produces severity-rated findings; the deal-team VP
// owns a shared red-flag tracker. Findings are classified deal-stopper / price-
// adjuster / closing-condition / post-close (100-day). QoE EBITDA haircuts of
// 10-30% are the #1 repricing cause; customer concentration >25-30% is a binary
// risk; environmental Phase II & active investigations are hard deal-killers.

const SEVERITY = { stopper: { label: 'Deal-stopper', rank: 4 }, reprice: { label: 'Price-adjuster', rank: 3 }, condition: { label: 'Closing condition', rank: 2 }, monitor: { label: 'Post-close / 100-day', rank: 1 }, clear: { label: 'Confirmed clean', rank: 0 } };

// Deterministic findings per workstream, calibrated off the deal's financials so
// they read as real diligence outcomes rather than lorem ipsum.
function workstreamFindings(deal) {
  const f = dealFinancials(deal);
  const out = [];
  const add = (workstream, severity, finding, impact) => out.push({ workstream, severity, finding, impact });

  // Financial / QoE — EBITDA haircut sized off margin quality.
  const haircut = f.ebitdaMargin < 10 ? 18 : f.ebitdaMargin < 15 ? 12 : 6;
  const adjEbitda = round(f.ebitda * (1 - haircut / 100));
  add('financial', haircut >= 15 ? 'reprice' : 'condition',
    `QoE normalizes EBITDA down ${haircut}% (${money(f.ebitda)} → ${money(adjEbitda)}) after removing unsupported add-backs and owner-comp normalization.`,
    haircut >= 15 ? `Repricing lever — reset entry EV off ${money(adjEbitda)} adjusted EBITDA.` : 'Manageable — reflect in the model and NWC peg.');
  add('financial', 'condition', `Net-working-capital peg set at ~${money(round(f.revenue * 0.12))} from a 12–24 month seasonality analysis.`, 'Becomes the SPA true-up mechanism at close.');

  // Commercial — customer concentration is the classic binary risk.
  const conc = f.ebitdaMargin > 15 ? 22 : 31;
  add('commercial', conc >= 30 ? 'reprice' : 'monitor',
    `Top-customer concentration ~${conc}% of revenue${conc >= 30 ? ' without a long-term contract — a binary revenue risk.' : ' — within tolerance but monitored.'}`,
    conc >= 30 ? 'Seek contract protection or an escrow/holdback.' : 'Track post-close; diversify in the 100-day plan.');
  add('commercial', 'clear', `Voice-of-customer (20+ calls) supports the growth thesis: durable demand and pricing power in ${deal.sector}.`, 'Thesis-supportive.');

  // Legal — contracts change-of-control.
  add('legal', 'condition', 'Change-of-control consents required on 2–3 material customer/supplier contracts.', 'Listed as conditions precedent in the SPA.');
  add('legal', 'clear', 'No material undisclosed litigation or government investigation identified.', 'Clean — no legal deal-stopper.');

  // Tax.
  add('tax', 'monitor', 'Multi-state sales/use-tax exposure identified; quantify and structure as a covered risk.', 'Backstop with R&W insurance; reflect in structuring.');

  // Operational.
  add('operational', 'monitor', `Cost-out opportunity identified in procurement & footprint (~${money(round(f.revenue * 0.02))} run-rate).`, 'Feed the value-creation plan.');

  // Tech.
  add('tech', 'monitor', 'Manageable tech debt; core systems scale to the growth plan. Cyber posture adequate with gaps to close.', 'Post-close IT roadmap in the 100-day plan.');

  // HR / management.
  add('hr', deal.ownership && /founder/i.test(deal.ownership) ? 'condition' : 'monitor',
    'Key-person dependency on founder/CEO; structured references positive.', 'Retention + incentive (MIP) structuring pre-close.');

  // ESG / environmental.
  add('esg', 'clear', 'Phase I ESA per ASTM E1527-21 identifies no Recognized Environmental Conditions (no Phase II triggered).', 'CERCLA safe-harbor established.');

  return out;
}

export function buildFindingsReport(deal) {
  const findings = workstreamFindings(deal);
  const byWs = {};
  for (const w of WORKSTREAMS) byWs[w.key] = { key: w.key, label: w.label, findings: [], worst: 'clear' };
  for (const fnd of findings) {
    const g = byWs[fnd.workstream];
    if (!g) continue;
    g.findings.push(fnd);
    if (SEVERITY[fnd.severity].rank > SEVERITY[g.worst].rank) g.worst = fnd.severity;
  }
  const groups = Object.values(byWs).filter((g) => g.findings.length).sort((a, b) => SEVERITY[b.worst].rank - SEVERITY[a.worst].rank);

  const counts = { stopper: 0, reprice: 0, condition: 0, monitor: 0, clear: 0 };
  for (const fnd of findings) counts[fnd.severity]++;

  const status = counts.stopper ? 'blocked' : counts.reprice ? 'reprice' : 'clear-to-proceed';
  const headline = counts.stopper
    ? `${counts.stopper} deal-stopper — diligence has surfaced a potential walk item.`
    : counts.reprice
      ? `No deal-stoppers; ${counts.reprice} price-adjuster(s) to reflect before signing.`
      : 'No deal-stoppers or repricing items — clear to proceed to IC.';

  return {
    kind: 'findings',
    company: deal.company,
    groups,
    counts,
    status,
    headline,
    legend: Object.fromEntries(Object.entries(SEVERITY).map(([k, v]) => [k, v.label]))
  };
}

// ===========================================================================
//  D3 · SYNTHESIS — Final IC Memo (diligence-backed)
// ===========================================================================
// Research: the final IC memo is the comprehensive, diligence-backed document —
// exec summary + recommendation, thesis & value-creation, financials incl. QoE,
// full LBO returns (target 20-25%+ IRR, 2.5-3.5x MOIC), DD findings synthesis by
// workstream, key risks, exit analysis (routes + named acquirers), and the exact
// authorization sought (max EV, equity check, financing).

export function buildFinalMemoBase(deal, { findings } = {}) {
  const cand = dealAsCandidate(deal);
  const returns = buildReturns(cand);
  const f = dealFinancials(deal);
  const fr = findings || buildFindingsReport(deal);

  const synthesis = fr.groups.map((g) => ({
    workstream: g.label,
    worst: SEVERITY[g.worst].label,
    top: g.findings[0]?.finding || '—'
  }));

  const recommendation = fr.counts.stopper ? 'DECLINE' : returns.meetsHurdle ? 'APPROVE' : 'CONDITIONAL';
  const equityCheck = round(returns.scenarios.base.equityIn);

  return {
    kind: 'ic-memo',
    generated: false,
    company: deal.company,
    recommendation,
    execSummary: `${deal.company} — final IC recommendation: ${recommendation}. A ${money(f.ev)} ${deal.sector.toLowerCase()} buyout at ~${returns.entryMultiple}x adjusted EBITDA. Base case ${returns.scenarios.base.moic}x / ${returns.scenarios.base.irr}% IRR over a ${returns.holdYears}-year hold. ${fr.headline}`,
    thesis: `Control buyout of ${deal.company} with value creation from EBITDA growth, margin/operational improvement and debt paydown — not multiple expansion. ${deal.thesis || ''}`.trim(),
    valueCreation: [
      'Organic growth: commercial execution on the validated demand thesis.',
      'Margin & cost-out: procurement and footprint efficiencies identified in ops DD.',
      'Buy-and-build: bolt-on M&A in a fragmented segment (where applicable).',
      'Debt paydown: disciplined delevering from free cash flow.'
    ],
    financials: {
      revenue: f.revenue, ebitda: f.ebitda, ebitdaMargin: f.ebitdaMargin,
      adjustedEbitda: round(f.ebitda * (f.ebitdaMargin < 15 ? 0.88 : 0.94)),
      note: 'Adjusted EBITDA per QoE (normalized add-backs); the LBO is modelled off the adjusted figure.'
    },
    returns,
    synthesis,
    keyRisks: (fr.groups.flatMap((g) => g.findings.filter((x) => x.severity === 'reprice' || x.severity === 'stopper'))
      .slice(0, 4)
      .map((x) => ({ risk: x.finding, mitigant: x.impact }))),
    exit: {
      routes: [
        { route: 'Strategic sale (M&A)', note: 'Most common mid-market exit; trade buyers seeking scale/adjacency.' },
        { route: 'Secondary buyout (PE-to-PE)', note: 'Sponsor-to-sponsor at scale.' },
        { route: 'IPO', note: `Requires scale (~$150M+ EBITDA) — ${f.ebitda >= 150 ? 'in range' : 'not a base-case route here'}.` }
      ],
      holdYears: returns.holdYears,
      exitMultiple: `${returns.entryMultiple}x (no multiple expansion assumed in base)`
    },
    ask: fr.counts.stopper
      ? 'No authorization sought — recommend declining or restructuring around the deal-stopper.'
      : `Authorize up to ${money(round(returns.scenarios.base.entryEV))} EV at ${returns.entryMultiple}x adjusted EBITDA, a ${money(equityCheck)} equity check from the fund, and committed debt at ~${returns.leverage} leverage.`,
    hurdle: { irr: 20, moic: 2.0, note: 'Fund targets 20–25%+ gross IRR and 2.5–3.5x MOIC in the base case.' }
  };
}

// ===========================================================================
//  D4 · APPROVAL & EXECUTION — Execution Pack
// ===========================================================================
// Research: IC votes (unanimous at smaller funds) with conditions tracked to
// close; the SPA carries price mechanism (locked-box vs completion accounts /
// NWC true-up), reps & warranties, indemnity/escrow, earnout; RWI is standard
// (80-90%+ of >$25M deals, 2.5-4% of limit); conditions precedent include HSR
// (>~$119.5M), third-party consents & financing; a funds-flow memo documents
// sources & uses at close.

export function buildExecutionPack(deal, { memo } = {}) {
  const cand = dealAsCandidate(deal);
  const returns = (memo && memo.returns) || buildReturns(cand);
  const f = dealFinancials(deal);
  const ev = round(returns.scenarios.base.entryEV);
  const debt = round(returns.scenarios.base.debt);
  const equity = round(returns.scenarios.base.equityIn);
  const fees = round(ev * 0.02);
  const hsrRequired = ev >= 119.5;

  return {
    kind: 'execution',
    company: deal.company,
    icDecision: {
      vote: 'Unanimous partner consent required (fund LPA).',
      status: 'Approved subject to conditions',
      champion: 'Deal sponsor (sector Partner) presents; IC evaluates thesis, valuation, structure, exit and risks.'
    },
    spaTerms: [
      { term: 'Purchase price', detail: `${money(ev)} enterprise value at ${returns.entryMultiple}x adjusted EBITDA (cash-free / debt-free).` },
      { term: 'Price mechanism', detail: 'Completion accounts with a net-working-capital true-up to the agreed peg.' },
      { term: 'Reps & warranties', detail: 'Customary fundamental + business warranties; disclosure schedules from DD.' },
      { term: 'Indemnity / escrow', detail: 'R&W insurance primary; ~0.5–1.0% escrow for fundamental/specific items.' },
      { term: 'Earnout', detail: /founder/i.test(deal.ownership || '') ? 'Consider a modest earnout to bridge valuation with the founder.' : 'None contemplated.' },
      { term: 'Non-compete', detail: 'Seller/founder non-compete and non-solicit for the customary period.' }
    ],
    rwi: { used: true, premiumPct: '2.5–4.0% of limit', retentionPct: '~0.5% of EV', note: 'Standard in mid-market (80–90%+ of >$25M deals).' },
    conditionsPrecedent: [
      { item: 'HSR antitrust clearance', status: hsrRequired ? 'Required' : 'Not required', detail: hsrRequired ? `EV ${money(ev)} exceeds the ~$119.5M HSR threshold — 30-day waiting period.` : `EV ${money(ev)} is below the ~$119.5M HSR threshold.` },
      { item: 'Third-party consents', status: 'Pending', detail: 'Change-of-control consents on material contracts (from legal DD).' },
      { item: 'Debt financing', status: 'Committed', detail: `Commitment letters for ~${money(debt)} of senior debt (Term Loan B + RCF).` },
      { item: 'Ordinary-course covenant', status: 'In effect', detail: 'Seller operates in the ordinary course through the gap period.' }
    ],
    fundsFlow: {
      sources: [
        { label: 'Fund equity', amount: equity },
        { label: 'Senior debt (TLB + RCF)', amount: debt },
        { label: 'Management rollover', amount: round(equity * 0.08) }
      ],
      uses: [
        { label: 'Purchase equity / enterprise value', amount: ev },
        { label: 'Existing debt payoff', amount: round(debt * 0.2) },
        { label: 'Transaction fees', amount: fees }
      ]
    },
    compliance: [
      { check: 'KYC / AML / UBO screening', framework: 'KYC', status: 'cleared' },
      { check: 'Sanctions screening', framework: 'OFAC', status: 'cleared' },
      { check: hsrRequired ? 'HSR filing' : 'HSR — not required', framework: 'Antitrust', status: hsrRequired ? 'filed' : 'n/a' },
      { check: 'Fund concentration / LPA limits', framework: 'LPA', status: 'within limits' }
    ],
    headline: `IC approved subject to conditions · ${money(ev)} EV · ${hsrRequired ? 'HSR required' : 'no HSR'} · R&W insurance placed.`
  };
}

// ===========================================================================
//  D5 · ARCHIVE — Close-out & 100-Day Plan
// ===========================================================================
// Research: post-close the deal team hands off to portfolio ops; a 100-day plan
// (Days 1-30 stabilize, 31-60 diagnose, 61-100 execute) drives quick wins &
// value-creation launch; governance = active board (quarterly board + monthly
// management) + a MIP (10-15% option pool); records archived with retention /
// audit trail; fair-value (ASC 820) & ILPA reporting onboarded.

export function buildCloseoutPlan(deal) {
  const f = dealFinancials(deal);
  return {
    kind: 'closeout',
    company: deal.company,
    hundredDay: [
      { phase: 'Days 1–30 · Stabilize & listen', items: ['Announce & align management', 'Secure key-customer & vendor continuity', 'Stand up the board & reporting cadence', 'Confirm cash & treasury control'] },
      { phase: 'Days 31–60 · Diagnose & plan', items: ['Validate the value-creation plan with management', 'Baseline KPIs & the reporting package', 'Finalize the org & any key hires', 'Scope the IT/systems roadmap'] },
      { phase: 'Days 61–100 · Execute quick wins', items: ['Launch procurement/cost-out initiatives', 'Kick off the commercial growth workstream', 'Open the bolt-on pipeline (where applicable)', 'Lock the 12-month operating plan'] }
    ],
    valueCreation: [
      { lever: 'Revenue growth', target: 'Commercial execution on the validated demand thesis.' },
      { lever: 'Margin / cost-out', target: `~${money(round(f.revenue * 0.02))} run-rate from procurement & footprint.` },
      { lever: 'Buy-and-build', target: 'Bolt-on M&A in a fragmented segment (where applicable).' },
      { lever: 'Working capital', target: 'Release cash from NWC discipline.' }
    ],
    governance: {
      board: 'Active board — quarterly full board + monthly management meetings.',
      mip: 'Management incentive plan: 10–15% option pool, back-end weighted, vesting over the hold.',
      reporting: 'Monthly management pack + quarterly ILPA-aligned LP reporting; fair-value (ASC 820) onboarding.'
    },
    records: [
      { item: 'Closing binder / closing set', detail: 'All executed documents indexed by category (Intralinks / Ansarada).' },
      { item: 'Data-room close-out & retention', detail: 'VDR archived under the firm’s retention policy with a lineage-tracked audit trail.' },
      { item: 'Valuation onboarding', detail: 'Independent fair-value support (e.g. Kroll / Stout) for ASC 820 reporting.' },
      { item: 'Portfolio-ops handoff', detail: 'Deal team → portfolio/operations team handoff document; deal post-mortem logged.' }
    ],
    headline: '100-day plan set · value-creation levers assigned · governance & records onboarded.'
  };
}

export { dealFinancials };
