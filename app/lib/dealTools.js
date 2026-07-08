// Deal tool contracts — the single source of truth for the "analyst tools" that
// read the fund's deals (stored in Cosmos, container `deals`). Both surfaces reuse
// these EXACT contracts and projections:
//   • the Foundry "deal-room-analyst" agent (lib/dealAgent.js), and
//   • the Deal MCP server for Copilot Studio (lib/mcp/dealServer.js).
//
// Keeping the projections + dispatch + scope enforcement here means a partner-MD
// Copilot Studio agent and the in-app analyst see identical, size-bounded views of
// a deal, and the same server-side per-deal scoping guarantees.

import {
  listDeals, getDeal,
  getPipeline, getCandidatePublic, getCandidateArtifact, getDealArtifact,
  sendToScreening, screenCandidate, triageCandidate, gateCandidate,
  launchDeal, advanceDeal, runStep, assignSwimlane, recordFinding, recordContribution,
  getICReadiness, marketIntel, recordIssue, resolveIssue, setCondition, snapshotAssumptions,
  getCitationAudit, canonicalCompanies, canonicalCompany
} from './store.js';
import { can, nextActions, PERSONA_LANE } from './personaPolicy.js';

// ---- projections (narrow, size-bounded views of the deal record) ------------
const trim = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const RISK_SEVERITIES = new Set(['caution', 'negative', 'risk', 'high', 'warning']);

// Sections a caller may request from get_deal (also the MCP tool's enum).
export const DEAL_SECTIONS = ['summary', 'financials', 'workstreams', 'memo', 'compliance', 'risks', 'activity'];
const DEFAULT_SECTIONS = ['summary', 'financials', 'workstreams', 'memo', 'compliance', 'risks'];

export function dealSummary(s) {
  return {
    id: s.id,
    company: s.company,
    sector: s.sector,
    subSector: s.subSector,
    hq: s.hq,
    dealSize: s.dealSize,
    currency: s.currency,
    stage: s.stage,
    stageName: s.stageName,
    status: s.status,
    readiness: s.readiness,
    daysToIC: s.daysToIC,
    diligenceProgress: s.diligenceProgress,
    memoProgress: s.memoProgress,
    thesis: trim(s.thesis, 240)
  };
}

export function listDealSummaries() {
  return listDeals().map(dealSummary);
}

export function summaryFor(id) {
  return listDeals().find((s) => s.id === id) || null;
}

// Bounded "analyst view" of one deal. `sections` narrows what is returned.
export function dealAnalystView(id, sections) {
  const d = getDeal(id);
  if (!d) return { error: 'deal-not-found', deal_id: id };
  const want = new Set(Array.isArray(sections) && sections.length ? sections : DEFAULT_SECTIONS);
  const view = { id: d.id, company: d.company };

  if (want.has('summary')) {
    view.summary = {
      sector: d.sector,
      subSector: d.subSector,
      hq: d.hq,
      dealSize: d.dealSize,
      currency: d.currency,
      stage: d.stage,
      stageName: d.stageName,
      status: d.status,
      leadAnalyst: d.leadAnalyst,
      sponsorPersona: d.sponsorPersona,
      thesis: trim(d.thesis, 600),
      readiness: d.readiness,
      daysToIC: d.daysToIC,
      projectedICDate: d.projectedICDate,
      diligenceProgress: d.diligenceProgress
    };
  }
  if (want.has('financials')) {
    view.keyFigures = (d.keyFigures || []).slice(0, 14).map((f) => ({ label: f.label, value: f.value, source: f.source }));
  }
  if (want.has('workstreams')) {
    view.workstreams = (d.workstreams || []).map((w) => ({
      lane: w.lane,
      status: w.status,
      progress: w.progress,
      findings: (w.findings || []).slice(0, 2).map((f) => ({ text: trim(f.text, 220), severity: f.severity }))
    }));
  }
  if (want.has('memo')) {
    view.memo = {
      progress: d.memoProgress,
      approved: d.memoApproved,
      total: d.memoTotal,
      sections: (d.memoSections || []).map((m) => ({ title: m.title, status: m.status }))
    };
  }
  if (want.has('compliance')) {
    view.compliance = {
      cleared: d.complianceCleared,
      total: d.complianceTotal,
      items: (d.compliance || []).map((c) => ({ check: c.check, framework: c.framework, status: c.status }))
    };
  }
  if (want.has('risks')) {
    const risks = [];
    for (const w of d.workstreams || []) {
      for (const f of w.findings || []) {
        if (RISK_SEVERITIES.has(f.severity)) risks.push({ text: trim(f.text, 220), lane: w.lane, source: f.source });
      }
    }
    for (const c of d.compliance || []) {
      if (c.status && c.status !== 'passed' && c.status !== 'cleared') {
        risks.push({ text: `Open compliance item: ${c.check} (${c.framework})`, lane: 'compliance', source: c.framework });
      }
    }
    view.risks = risks.slice(0, 8);
  }
  if (want.has('activity')) {
    view.activity = (d.activity || []).slice(0, 6).map((a) => ({ actor: a.actor, action: trim(a.action, 160), when: a.when }));
  }
  return view;
}

export function searchDealSummaries(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return listDeals()
    .filter((s) => {
      const hay = `${s.company} ${s.sector} ${s.subSector} ${s.thesis}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .map(dealSummary);
}

// ---- tool dispatch with server-side scope enforcement -----------------------
// In 'deal' scope every tool is hard-filtered to the focused deal, so a caller
// (a model, or a Copilot Studio agent) cannot reach another deal's data no matter
// what arguments it emits. 'portfolio' scope exposes the whole pipeline.
export function dispatchTool(name, args, { scope = 'portfolio', focusId, focusCompany } = {}) {
  const dealScope = scope === 'deal';
  if (name === 'list_deals') {
    if (dealScope) {
      const s = summaryFor(focusId);
      return { scoped_to: focusCompany, deals: s ? [dealSummary(s)] : [], note: `Scoped to ${focusCompany}; other deals are not accessible in this conversation.` };
    }
    return { deals: listDeals().map(dealSummary) };
  }
  if (name === 'get_deal') {
    if (dealScope) {
      const note = args?.deal_id && args.deal_id !== focusId
        ? `Ignored deal_id "${args.deal_id}" — this conversation is scoped to ${focusCompany} (${focusId}).`
        : undefined;
      const view = dealAnalystView(focusId, args?.sections);
      return note ? { ...view, note } : view;
    }
    if (!args?.deal_id) return { error: 'deal_id-required' };
    return dealAnalystView(args.deal_id, args?.sections);
  }
  if (name === 'search_deals') {
    if (dealScope) {
      const s = summaryFor(focusId);
      return { scoped_to: focusCompany, deals: s ? [dealSummary(s)] : [], note: `Scoped to ${focusCompany}; search is limited to this deal.` };
    }
    return { deals: searchDealSummaries(args?.query) };
  }
  return { error: 'unknown-tool', name };
}

// ===========================================================================
//  Stage-1 PIPELINE + ARTIFACT read tools (the funnel + the rich deliverables)
// ===========================================================================
// These extend the agents' visibility beyond Stage-2 deals to the whole
// origination funnel and to every step's real artifact (scorecard, triage,
// IC pre-screen memo, diligence plan, findings, final IC memo, execution pack,
// 100-day plan) — the same deliverables the dashboard renders.

const candSummary = (c) => ({
  id: c.id, company: c.company, sector: c.sector, region: c.region,
  dealSize: c.dealSize, ownership: c.ownership, stage: c.stage,
  disposition: c.disposition, score: c.score, band: c.band,
  passReason: c.passReasonLabel || null
});

export function listPipeline() {
  const p = getPipeline();
  return {
    fundName: p.fundName,
    funnel: p.funnel,
    candidates: p.candidates.map(candSummary)
  };
}

export function candidateView(id, { includeArtifact = true } = {}) {
  const c = getCandidatePublic(id);
  if (!c) return { error: 'candidate-not-found', candidate_id: id };
  const view = {
    id: c.id, company: c.company, sector: c.sector, subSector: c.subSector,
    region: c.region, country: c.country, dealSize: c.dealSize, ownership: c.ownership,
    revenue: c.revenue, ebitda: c.ebitda, ebitdaMargin: c.ebitdaMargin, growth: c.growth,
    stage: c.stage, disposition: c.disposition, score: c.score, band: c.band,
    gated: c.gated, matchedScreen: c.matchedScreen, passReason: c.passReasonLabel || null,
    assessment: c.assessment ? { action: c.assessment.action, rationale: c.assessment.rationale } : null
  };
  return view;
}

// A candidate's stage artifact (O2 scorecard / O3 triage / O4 IC pre-screen memo).
export async function candidateArtifactView(id) {
  const a = await getCandidateArtifact(id).catch(() => null);
  if (!a) return { error: 'candidate-not-found', candidate_id: id };
  return a;
}

// A deal's diligence-step artifact (D1 plan / D2 findings / D3 final memo /
// D4 execution pack / D5 100-day plan).
export async function dealArtifactView(dealId, step) {
  const a = await getDealArtifact(dealId, step).catch(() => null);
  if (!a) return { error: 'deal-not-found', deal_id: dealId };
  return a;
}

// The IC Readiness board for a deal — the seven decision-grade questions + verdict,
// grounded in real Fabric/OneLake market intelligence. Bounded for tool output.
export function icReadinessView(dealId) {
  const b = getICReadiness(dealId);
  if (!b) return { error: 'deal-not-found', deal_id: dealId };
  return {
    deal_id: b.dealId,
    company: b.company,
    stage: b.stage,
    verdict: b.verdict,
    requiredArtifacts: { complete: b.requiredArtifacts.complete, total: b.requiredArtifacts.total, missing: b.requiredArtifacts.items.filter((i) => !i.complete).map((i) => i.label) },
    blockingWorkstreams: b.blockingWorkstreams.map((w) => ({ lane: w.label, owner: w.owner, reasons: w.reasons })),
    changedAssumptions: b.changedAssumptions.note,
    unresolvedRisks: b.unresolvedRisks.map((r) => ({ title: r.title, severity: r.severity, lane: r.laneLabel, owner: r.owner, status: r.status })),
    conditions: b.conditions.map((c) => ({ text: c.text, status: c.status })),
    icAsk: b.icAsk,
    supportingSources: b.supportingSources.slice(0, 10).map((s) => `${s.label}${s.ref ? ` (${s.ref})` : ''}`),
    comparableDeals: (b.marketIntel?.comparableDeals || []).slice(0, 5).map((c) => ({ company: c.company, dealType: c.dealType, impliedValuation: c.impliedValuation, status: c.status })),
    icPrecedents: (b.marketIntel?.icPrecedents || []).map((p) => ({ deal: p.deal, decision: p.decision, votes: `${p.votesFor}-${p.votesAgainst}`, conditions: p.conditions })),
    fabric: b.marketIntel?.source?.mode || 'unconfigured'
  };
}

// Source-citation audit for a deal (point 5): key figures + memo numeric claims
// mapped to sources, with the unsourced ones flagged. Bounded for tool output.
export function citationAuditView(dealId) {
  const a = getCitationAudit(dealId);
  if (!a) return { error: 'deal-not-found', deal_id: dealId };
  return {
    deal_id: a.dealId,
    company: a.company,
    score: a.score,
    clean: a.clean,
    summary: a.summary,
    unsourcedFigures: a.unsourcedFigures.map((f) => `${f.label}: ${f.value}`),
    unsourcedClaims: a.unsourcedClaims.slice(0, 10).map((c) => `${c.figure} (in "${c.section}")`),
    icAskBaseSourced: a.icAsk.baseSourced,
    missingBase: a.icAsk.missingBase
  };
}

// Canonical Company model (point 3): the unified, entity-resolved governed record
// over the three sourcing feeds. list = every governed company + how many duplicate
// feed records were resolved into one; single = the full profile for one company.
export function canonicalCompaniesView({ inFunnel } = {}) {
  const r = canonicalCompanies({ inFunnel });
  return {
    count: r.count,
    fromFeeds: r.fromFeeds,
    resolvedDuplicates: r.resolvedDuplicates,
    companies: r.companies.slice(0, 40).map((c) => ({
      id: c.id, name: c.name, sector: c.sector, region: c.region, ownership: c.ownership,
      revenue: c.revenue, ebitda: c.ebitda, sources: c.sources, inFunnel: c.inFunnel,
      funnelStage: c.funnel?.stage || null, disposition: c.funnel?.disposition || null
    }))
  };
}

export function canonicalCompanyView(id) {
  const c = canonicalCompany(id);
  if (!c) return { error: 'company-not-found', id };
  return {
    id: c.id, name: c.name, aliases: c.aliases, domain: c.domain, ticker: c.ticker,
    sector: c.sector, subSector: c.subSector, region: c.region, country: c.country, hq: c.hq,
    ownership: c.ownership, keywords: c.keywords,
    financials: { revenue: c.revenue, ebitda: c.ebitda, ebitdaMargin: c.ebitdaMargin, growth: c.growth, dealSize: c.dealSize, estimated: c.estimated },
    provenance: { sources: c.sources, discoveredVia: c.discoveredVia, firstSeen: c.firstSeen, feedIds: c.feedIds },
    newsCount: (c.news || []).length,
    signals: c.signals || null,
    funnel: c.funnel ? { stage: c.funnel.stage, disposition: c.funnel.disposition, passReason: c.funnel.passReason } : null
  };
}

// Fabric / OneLake market intelligence — comparable & historical deals, benchmark
// diligence findings by workstream, and IC voting precedents. Grounds valuation,
// diligence scoping and IC conditions in the fund's real market data.
export function marketIntelView({ sector } = {}) {
  const mi = marketIntel();
  if (!mi) return { fabric: 'unconfigured', note: 'Fabric market-intelligence snapshot not loaded.', comparableDeals: [], benchmarkFindings: [], icPrecedents: [] };
  const norm = (x) => String(x || '').toLowerCase();
  let comps = mi.comparableDeals || [];
  if (sector) {
    const key = norm(sector);
    comps = comps.slice().sort((a, b) => (norm(b.thesis).includes(key) ? 1 : 0) - (norm(a.thesis).includes(key) ? 1 : 0));
  }
  return {
    fabric: mi.info?.mode || 'materialized',
    source: mi.info?.source || null,
    comparableDeals: comps.slice(0, 8).map((c) => ({ company: c.company, ticker: c.ticker, dealType: c.dealType, dealValue: c.dealValue, impliedValuation: c.impliedValuation, stage: c.stage, status: c.status })),
    benchmarkFindings: (mi.benchmarkFindings || []).map((w) => ({ workstream: w.workstream, total: w.total, byRisk: w.byRisk, topSamples: (w.samples || []).slice(0, 2).map((s) => ({ type: s.type, description: s.description, risk: s.risk })) })),
    icPrecedents: (mi.icPrecedents || []).map((p) => ({ deal: p.deal, decision: p.decision, votes: `${p.votesFor}-${p.votesAgainst}`, conditions: p.conditions }))
  };
}

// ===========================================================================
//  ACTION tools — MOVE the pipeline forward, governed by persona policy.
// ===========================================================================
// Every action is authorization-checked with the caller's resolved persona before
// it mutates anything (personaPolicy.can). The check is server-side, so a tool call
// can never exceed the persona's powers regardless of the arguments emitted — the
// same defense-in-depth the read tools use for deal `scope`. `by` is threaded into
// the audit trail for attribution.

const CAND_STAGE_FOR = { screen_candidate: 'O2', triage_candidate: 'O3', gate_candidate: 'O4' };

// Map an action to a stable, low-cardinality string for logging/attribution.
function actor(persona) {
  return { analyst: 'Analyst agent', partner: 'Partner agent', 'retail-md': 'Retail-MD agent', 'ai-md': 'AI-MD agent', 'supply-md': 'Supply-MD agent' }[persona] || 'Agent';
}

// dispatchAction(name, args, { persona }) — the single entry point for writes.
export async function dispatchAction(name, args = {}, { persona } = {}) {
  if (!persona) return { error: 'persona-required', detail: 'No persona resolved for this caller; an action needs a persona.' };

  // Lane matters for the lane-scoped contribution/issue actions; derive it for authz.
  const lane = (name === 'record_finding' || name === 'record_contribution' || name === 'record_issue')
    ? (args.lane || PERSONA_LANE[persona])
    : undefined;
  const verdict = can(persona, name, { lane });
  if (!verdict.ok) return { error: 'forbidden', action: name, persona, detail: verdict.reason };

  const by = actor(persona);
  try {
    switch (name) {
      case 'send_to_screening':
        return withAudit(sendToScreening(args.desk_id || args.target_id), { name, persona });
      case 'screen_candidate':
      case 'triage_candidate':
      case 'gate_candidate': {
        const fn = { screen_candidate: screenCandidate, triage_candidate: triageCandidate, gate_candidate: gateCandidate }[name];
        return withAudit(fn(args.candidate_id, args.action, args.reason, args.note), { name, persona, expectStage: CAND_STAGE_FOR[name] });
      }
      case 'launch_deal':
        return withAudit(await launchDeal(args.deal_id), { name, persona });
      case 'advance_deal':
      case 'approve_ic':
        return withAudit(await advanceDeal(args.deal_id, { persona, overrideReason: args.override_reason }), { name, persona });
      case 'run_step':
        return withAudit(await runStep(args.deal_id, args.step), { name, persona });
      case 'assign_lane':
        return withAudit(await assignSwimlane(args.deal_id, args.lane, args.md), { name, persona });
      case 'record_finding':
        return withAudit(await recordFinding(args.deal_id, lane, { text: args.text, severity: args.severity, source: args.source, by }), { name, persona });
      case 'record_contribution':
        return withAudit(await recordContribution(args.deal_id, lane, { kind: args.kind, text: args.text, severity: args.severity, source: args.source, by, persona }), { name, persona });
      case 'record_issue':
        return withAudit(await recordIssue(args.deal_id, { lane, title: args.title, severity: args.severity, owner: args.owner, resolutionPath: args.resolution_path, dueDate: args.due_date, by, persona }), { name, persona });
      case 'resolve_issue':
        return withAudit(await resolveIssue(args.deal_id, args.issue_id, { status: args.status, resolutionPath: args.resolution_path, by, persona }), { name, persona });
      case 'set_condition':
        return withAudit(await setCondition(args.deal_id, { text: args.text, owner: args.owner, status: args.status, by, persona }), { name, persona });
      case 'snapshot_assumptions':
        return withAudit(await snapshotAssumptions(args.deal_id, { label: args.label, by }), { name, persona });
      default:
        return { error: 'unknown-action', name };
    }
  } catch (err) {
    return { error: 'action-failed', action: name, detail: String(err?.message || err) };
  }
}

function withAudit(result, { name, persona }) {
  if (result && result.error) {
    const out = { ok: false, action: name, persona, error: result.error };
    if (result.detail) out.detail = result.detail;
    if (result.verdict) out.verdict = result.verdict;
    if (result.gate) out.gate = result.gate;
    return out;
  }
  return { ok: true, action: name, persona, result };
}

// get_next_actions — the allowed, stage-valid moves for the caller's persona on a
// given deal or candidate. Lets an agent propose only moves it is authorized to make.
export function nextActionsFor(persona, { deal_id, candidate_id } = {}) {
  if (candidate_id) {
    const c = getCandidatePublic(candidate_id);
    if (!c) return { error: 'candidate-not-found', candidate_id };
    return { candidate_id, company: c.company, stage: c.stage, persona, actions: nextActions(persona, { kind: 'candidate', stage: c.stage }) };
  }
  if (deal_id) {
    const d = getDeal(deal_id);
    if (!d) return { error: 'deal-not-found', deal_id };
    return { deal_id, company: d.company, stage: d.stage, persona, actions: nextActions(persona, { kind: 'deal', stage: d.stage }) };
  }
  return { error: 'deal_id-or-candidate_id-required' };
}

// Human-readable tool descriptions — shared so the MCP tool descriptions and any
// docs stay identical to what the Foundry agent was provisioned with.
export const TOOL_DESCRIPTIONS = {
  list_deals:
    "List EVERY deal in the fund's pipeline as a compact summary (id, company, sector, stage, " +
    'status, deal size, IC readiness, days-to-IC, thesis). Use to see the whole portfolio or to ' +
    "find a deal's id.",
  get_deal:
    'Get ONE deal as a bounded analyst view: key figures, diligence workstreams + status, ' +
    'memo-section status, compliance status and top risks/findings. Use for anything specific ' +
    'about a named deal. Pass optional sections to narrow the view.',
  search_deals:
    'Keyword-search the pipeline across company name, sector and thesis when you do not know the ' +
    'deal id. Returns matching deal summaries.',
  list_pipeline:
    'List the Stage-1 origination funnel: every candidate (id, company, sector, stage O2/O3/O4, ' +
    'disposition, fit score) plus the funnel counts. Use to see what is being sourced and screened ' +
    'before it becomes a deal.',
  get_candidate:
    'Get ONE Stage-1 candidate by id: financials, mandate-fit score, stage and the screening ' +
    "agent's assessment. Use for anything specific about a sourced/screened target.",
  get_candidate_artifact:
    "Get a candidate's stage deliverable: the O2 Investment-Criteria Scorecard, the O3 Triage " +
    'Scorecard (tiered A/B/C), or the O4 IC Pre-Screen Memo (paper-LBO returns + recommendation).',
  get_deal_artifact:
    "Get a deal's diligence-step deliverable by step: D1 Diligence Plan, D2 Findings / Red-Flag " +
    'Report, D3 Final IC Memo, D4 Execution Pack (SPA terms + funds flow), or D5 Close-out & ' +
    '100-Day Plan.',
  get_next_actions:
    'List the actions YOUR persona is allowed to take right now on a given deal or candidate ' +
    '(pass deal_id or candidate_id). Always call this before acting so you propose only ' +
    'authorized, stage-valid moves.',
  get_ic_readiness:
    'Get the IC Readiness board for a deal — the decision-grade answer to the seven questions the ' +
    'Investment Committee asks (required artifacts complete? blocking workstreams? changed assumptions? ' +
    'unresolved risks? supporting sources? exact IC ask? conditions to approve?) plus an overall ' +
    'READY / CONDITIONAL / NOT-READY verdict, grounded in real Fabric comparable deals and IC precedents.',
  get_market_intel:
    "Get the fund's real market intelligence from Fabric / OneLake: comparable & historical deals " +
    '(deal type, value, implied valuation, outcome), benchmark diligence findings by workstream ' +
    '(Commercial / Financial / Legal / Operational / Tax, with severity mix) and IC voting precedents ' +
    '(decision, votes, conditions). Use to ground valuation, diligence scoping and IC conditions. ' +
    'Pass an optional sector to bias the comparables.',
  get_citation_audit:
    'Get the source-citation audit for a deal: every numeric claim in the IC materials (key figures ' +
    'and memo sections) mapped to a source fact or cited document, with unsourced figures flagged and ' +
    'a 0–100 citation score. Use before finalizing an IC memo to confirm every number is defensible.',
  get_companies:
    "List the fund's canonical Company records — the unified, entity-resolved governed model over the three " +
    'sourcing feeds (news/filings desk, screening-funnel candidates, CxO signals). One record per real company ' +
    '(deduped by domain → registry → name), showing sources/provenance and funnel state. Reports how many duplicate ' +
    'feed records were resolved into one.',
  get_company:
    'Get ONE canonical Company record by id (or a feed id): identity & aliases, classification, financials with an ' +
    'estimated flag, provenance (which feeds sourced it), news count, CxO signals and funnel state — the single ' +
    'governed record for a real company across every feed.',
  // Action tools
  send_to_screening: 'Send a sourced target into the screening funnel (creates an O2 candidate). Analyst/Partner only.',
  screen_candidate: 'Record the Auto-Screen (O2) decision for a candidate: action = advance | pass | park (+ reason). Analyst/Partner only.',
  triage_candidate: 'Record the Triage (O3) decision for a candidate: action = advance | pass | park (+ reason). Analyst/Partner only.',
  gate_candidate: 'Record the Screening-Gate (O4) decision: action = advance (PURSUE, creates a deal) | pass | park. PARTNER only.',
  launch_deal: 'Launch diligence on a screened deal — provisions the workspace and moves it to D1. Analyst/Partner only.',
  advance_deal: 'Advance a deal to the next diligence step. Analyst/Partner only. Entering IC approval (D3→D4) is BLOCKED when the IC-readiness verdict is NOT-READY unless the Partner passes override_reason.',
  approve_ic: 'Record the IC approval and advance the deal past the IC gate (D4→D5). PARTNER only. BLOCKED when the IC-readiness verdict is NOT-READY unless override_reason is provided (logged as a partner-override audit event).',
  run_step: 'Run a diligence step (by step key, e.g. D2) to produce its deliverable on the record.',
  assign_lane: 'Assign a diligence lane (commercial | techai | operations) to an MD. Analyst/Partner only.',
  record_finding:
    'Record a diligence finding into a workstream lane (text, severity = positive|neutral|caution|negative|risk). ' +
    'Sector MDs may only record into their own lane; Analyst/Partner into any lane.',
  record_contribution:
    'Contribute MD input into a workstream lane through one of three lenses: kind = guidance (steer/direction for the lane), ' +
    'value_add (a value-creation lever/thesis input), or diligence (a finding, with severity = positive|neutral|caution|negative|risk). ' +
    'Sector MDs may only contribute to their own lane; Analyst/Partner to any lane. This is the MD input entrypoint.',
  record_issue:
    'Log an operational diligence issue into the deal issue log: title, severity (positive|neutral|caution|negative|risk), ' +
    'optional owner, resolution_path and due_date, into a workstream lane. Feeds the IC Readiness cockpit as an unresolved ' +
    'risk until resolved. Sector MDs may only log into their own lane; Analyst/Partner into any lane.',
  resolve_issue:
    'Update or resolve a logged issue by issue_id: status = open | mitigating | resolved, with an optional resolution_path. ' +
    'Clears it from the cockpit unresolved-risk list when resolved.',
  set_condition:
    'Set (or draft) an IC condition-to-approve on a deal: text, optional owner, status = proposed | accepted | satisfied. ' +
    'Surfaces in the cockpit as a condition the IC must clear. Analyst/Partner only.',
  snapshot_assumptions:
    "Snapshot the deal's current key assumptions (revenue, EBITDA, entry multiple, base-case IRR/MoIC, EV) as an IC-draft " +
    'baseline, so the cockpit can show which assumptions changed since the last IC draft. Analyst/Partner only.'
};

