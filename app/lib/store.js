// In-memory deal store with derived metrics. State is seeded at startup and
// mutated for the session — enough to make the workspace fully interactive.

import { seedDeals, seedSourcing } from '../data/deals.js';
import { personas } from '../data/personas.js';
import { STAGES, STEPS, STEP_KEYS, FLOW, GATE, stepByKey, stepIndex } from '../data/flow.js';
import { runStep as runStepAgent } from './agents.js';
import { mailbox, companiesWithSignals, crmForCompany } from '../data/signals.js';
import { SOURCES, catalysts, catalystById, deskCompanies } from '../data/news.js';
import { researchFor } from '../data/research.js';
import { classifyCatalyst } from './agents.js';
import { fundMandate, seedThemes, seedScreens } from '../data/mandates.js';
import { scoreTargets, validateScreen } from './scoring.js';
import { buildWorkspace, checklistStats, MD_OPTIONS } from '../data/workspace.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

// Attach a provisioned workspace to every already-launched deal so the D1 view
// is populated for all of them (screened deals get theirs on launch).
function attachWorkspaces(list) {
  for (const d of list) {
    if (d.status !== 'screened' && !d.workspace) {
      const lanes = d.workstreams || [];
      const maturity = lanes.length
        ? lanes.reduce((s, w) => s + (w.progress || 0), 0) / (lanes.length * 100)
        : 0.2;
      d.workspace = buildWorkspace(d, { maturity, createdAt: d.screenedAt });
      // reflect each lane's real owner into the workspace swimlane assignment
      for (const sl of d.workspace.swimlanes) {
        const ws = lanes.find((w) => w.lane === sl.lane);
        if (ws && ws.owner) sl.md = ws.owner;
      }
    }
  }
  return list;
}

let deals = attachWorkspaces(clone(seedDeals));
let sourcing = clone(seedSourcing);
let fund = clone(fundMandate);
let themes = clone(seedThemes);
let screens = clone(seedScreens);
let screenSeq = 1;
let dealSeq = 1;
let desk = clone(deskCompanies);
let sources = clone(SOURCES);

const MEMO_WEIGHT = { empty: 0, draft: 0.6, in_progress: 0.8, approved: 1 };
const COMPLIANCE_WEIGHT = { pending: 0, in_progress: 0.5, passed: 1, failed: 0 };
const DAY = 24 * 60 * 60 * 1000;

function daysUntil(iso) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}

export function computeReadiness(deal) {
  const lanes = deal.workstreams || [];
  const laneFrac = lanes.length ? lanes.reduce((s, w) => s + (w.progress || 0), 0) / (lanes.length * 100) : 0;
  const memo = deal.memoSections || [];
  const memoFrac = memo.length ? memo.reduce((s, m) => s + (MEMO_WEIGHT[m.status] ?? 0), 0) / memo.length : 0;
  const comp = deal.compliance || [];
  const compFrac = comp.length ? comp.reduce((s, c) => s + (COMPLIANCE_WEIGHT[c.status] ?? 0), 0) / comp.length : 0;
  return Math.round(45 * laneFrac + 35 * memoFrac + 20 * compFrac);
}

function derive(deal) {
  const readiness = computeReadiness(deal);
  const daysToIC = daysUntil(deal.targetICDate);
  const projectedDaysSaved = Math.round((deal.hoursSaved || 0) / 8);
  const projectedICDate = new Date(new Date(deal.targetICDate).getTime() - projectedDaysSaved * DAY).toISOString();
  const isScreened = deal.status === 'screened';
  const idx = Math.max(0, stepIndex(deal.stage));
  const stepNumber = idx + 1;
  const totalSteps = STEP_KEYS.length;
  const flowProgress = Math.round((idx / (totalSteps - 1)) * 100);
  const completedSteps = STEP_KEYS.slice(0, idx);

  // Stage-local position (e.g. "Diligence · Step 2 of 5").
  const stepObj = stepByKey(deal.stage) || STEPS[idx];
  const stageId = isScreened ? 'screened' : (stepObj ? stepObj.stage : STAGES[0].id);
  const stageObj = STAGES.find((s) => s.id === stageId) || STAGES[0];
  const stageSteps = STEPS.filter((s) => s.stage === (isScreened ? 'diligence' : stageId));
  const stageStepTotal = stageSteps.length;
  const stageStepNumber = isScreened ? 0 : Math.max(1, stageSteps.findIndex((s) => s.key === deal.stage) + 1);

  // Real, defensible deal KPIs derived from the live record.
  const lanes = deal.workstreams || [];
  const diligenceProgress = lanes.length
    ? Math.round(lanes.reduce((s, w) => s + (w.progress || 0), 0) / lanes.length)
    : 0;
  const memo = deal.memoSections || [];
  const memoTotal = memo.length;
  const memoApproved = memo.filter((m) => m.status === 'approved').length;
  const memoProgress = memoTotal
    ? Math.round((100 * memo.reduce((s, m) => s + (MEMO_WEIGHT[m.status] ?? 0), 0)) / memoTotal)
    : 0;
  const comp = deal.compliance || [];
  const complianceTotal = comp.length;
  const complianceCleared = comp.filter((c) => c.status === 'passed').length;
  const checklist = deal.workspace ? checklistStats(deal.workspace) : null;

  return {
    ...deal,
    status: deal.status || 'launched',
    readiness,
    daysToIC,
    projectedDaysSaved,
    projectedICDate,
    currentStep: deal.stage,
    stepIndex: idx,
    stepNumber,
    totalSteps,
    flowProgress,
    completedSteps,
    stageId,
    stageName: isScreened ? 'Screened — awaiting launch' : stageObj.name,
    stageStepNumber,
    stageStepTotal,
    diligenceProgress,
    memoApproved,
    memoTotal,
    memoProgress,
    complianceCleared,
    complianceTotal,
    workspaceReady: !!deal.workspace,
    checklistStats: checklist,
    stepRuns: deal.stepRuns || {}
  };
}

function summarize(deal) {
  const d = derive(deal);
  return {
    id: d.id,
    company: d.company,
    sector: d.sector,
    subSector: d.subSector,
    hq: d.hq,
    dealSize: d.dealSize,
    currency: d.currency,
    stage: d.stage,
    status: d.status,
    sponsorPersona: d.sponsorPersona,
    leadAnalyst: d.leadAnalyst,
    thesis: d.thesis,
    readiness: d.readiness,
    daysToIC: d.daysToIC,
    projectedDaysSaved: d.projectedDaysSaved,
    hoursSaved: d.hoursSaved,
    targetICDate: d.targetICDate,
    projectedICDate: d.projectedICDate,
    stepIndex: d.stepIndex,
    stepNumber: d.stepNumber,
    totalSteps: d.totalSteps,
    flowProgress: d.flowProgress,
    stageId: d.stageId,
    stageName: d.stageName,
    stageStepNumber: d.stageStepNumber,
    stageStepTotal: d.stageStepTotal,
    diligenceProgress: d.diligenceProgress,
    memoApproved: d.memoApproved,
    memoTotal: d.memoTotal,
    memoProgress: d.memoProgress,
    complianceCleared: d.complianceCleared,
    complianceTotal: d.complianceTotal,
    workspaceReady: d.workspaceReady,
    workstreams: d.workstreams.map((w) => ({ lane: w.lane, status: w.status, progress: w.progress }))
  };
}

export function listDeals() {
  return deals.map(summarize);
}

export function getDealRaw(id) {
  return deals.find((d) => d.id === id);
}

export function getDeal(id) {
  const d = getDealRaw(id);
  return d ? derive(d) : null;
}

export function listSourcing() {
  return sourcing;
}

export function promoteSourcing(id) {
  const item = sourcing.find((s) => s.id === id);
  if (item) item.promoted = true;
  return item;
}

export function getPersonas() {
  return personas;
}

export function getStages() {
  return STAGES;
}

export function getFlow() {
  return FLOW;
}

// ---- O1 CxO signals explorer ------------------------------------------------
export function getMailbox() {
  return mailbox;
}

export function getSignalCompanies() {
  return companiesWithSignals();
}

export function getCrm(companyId) {
  return crmForCompany(companyId);
}

// ---- O1 News & filings desk ------------------------------------------------
function l1Mandate() {
  return {
    id: fund.id,
    name: fund.name,
    sector: fund.sectorsPermitted || [],
    region: fund.geographies || [],
    sizeMin: fund.evMin ?? null,
    sizeMax: fund.evMax ?? null,
    thesis: fund.strategy || ''
  };
}

function publicCompany(c) {
  return {
    id: c.id,
    name: c.name,
    sector: c.sector,
    region: c.region,
    country: c.country,
    dealSize: c.dealSize,
    ownership: c.ownership,
    news: c.news,
    filings: c.filings,
    quality: c.quality
  };
}

export function getSourcingDesk() {
  return {
    l1: l1Mandate(),
    sources,
    catalysts,
    companies: desk.filter((c) => c.visible).map(publicCompany)
  };
}

export function findMoreNews() {
  const next = desk.find((c) => !c.visible);
  if (!next) return { revealed: null, desk: getSourcingDesk() };
  next.visible = true;
  next.justDiscovered = true;
  // Run the catalyst-classifier agent on each freshly-surfaced finding.
  for (const n of next.news) {
    const { catalyst, confidence } = classifyCatalyst(`${n.headline}. ${n.detail}`);
    n.catalyst = catalyst;
    n.confidence = confidence;
    n.aiLabeled = true;
  }
  return { revealed: publicCompany(next), desk: getSourcingDesk() };
}

export function setFindingCatalyst(findingId, catalystId) {
  if (!catalystById[catalystId]) return null;
  for (const c of desk) {
    const n = c.news.find((x) => x.id === findingId);
    if (n) {
      n.catalyst = catalystId;
      n.manualOverride = true;
      return { findingId, catalyst: catalystId, companyId: c.id };
    }
  }
  return null;
}

export function testSource(id) {
  const s = sources.find((x) => x.id === id);
  if (!s) return null;
  const base = s.latencyMs;
  const jitter = Math.round((Math.random() - 0.5) * 80);
  const latencyMs = Math.max(40, base + jitter);
  const ok = s.status === 'connected';
  s.lastSyncMin = 0;
  return {
    id: s.id,
    name: s.name,
    ok,
    status: s.status,
    latencyMs,
    checkedAt: new Date().toISOString(),
    message: ok ? `Healthy · responded in ${latencyMs}ms` : `Reachable but degraded · ${latencyMs}ms (elevated latency)`
  };
}

// ---- O1 Analyst reports (thesis context attached to discovered companies) ---
export function getAnalystResearch() {
  const companies = desk
    .filter((c) => c.visible)
    .map((c) => ({
      id: c.id,
      name: c.name,
      sector: c.sector,
      region: c.region,
      country: c.country,
      dealSize: c.dealSize,
      ownership: c.ownership,
      justDiscovered: !!c.justDiscovered,
      research: researchFor(c.id)
    }))
    .filter((c) => c.research);
  return { companies };
}

// ---- O1 Sourcing framework (fund GATE · themes GUIDE · screens RANK) --------
export function getFramework() {
  return {
    fund,
    themes: themes.map((t) => ({
      ...t,
      screens: screens.filter((s) => s.themeId === t.id)
    })),
    screensWithoutTheme: screens.filter((s) => !themes.some((t) => t.id === s.themeId))
  };
}

function selectedScreens() {
  return screens.filter((s) => s.selected);
}

export function setScreenSelected(id, selected) {
  const s = screens.find((x) => x.id === id);
  if (!s) return null;
  s.selected = !!selected;
  return s;
}

// Selecting a theme toggles every child screen (screens are the source of truth).
export function setThemeSelected(id, selected) {
  const children = screens.filter((s) => s.themeId === id);
  for (const s of children) s.selected = !!selected;
  return { themeId: id, selected: !!selected, screenIds: children.map((s) => s.id) };
}

const NUM_FIELDS = ['evMin', 'evMax', 'revenueMin', 'ebitdaMin', 'ebitdaMarginMin', 'growthMin'];
const ARR_FIELDS = ['subSectors', 'regions', 'ownership', 'keywords'];
const STR_FIELDS = ['name', 'sector'];

function coerceScreen(target, patch) {
  for (const f of STR_FIELDS) if (patch[f] !== undefined) target[f] = patch[f];
  for (const f of ARR_FIELDS) {
    if (patch[f] === undefined) continue;
    target[f] = Array.isArray(patch[f])
      ? patch[f]
      : String(patch[f]).split(',').map((s) => s.trim()).filter(Boolean);
  }
  for (const f of NUM_FIELDS) {
    if (patch[f] === undefined) continue;
    target[f] = patch[f] === '' || patch[f] === null ? null : Number(patch[f]);
  }
}

export function updateScreen(id, patch) {
  const s = screens.find((x) => x.id === id);
  if (!s) return { error: 'not-found' };
  const candidate = clone(s);
  coerceScreen(candidate, patch);
  const theme = themes.find((t) => t.id === candidate.themeId);
  const check = validateScreen(candidate, theme, fund);
  if (!check.ok) return { error: 'invalid', errors: check.errors, warnings: check.warnings };
  coerceScreen(s, patch);
  return { screen: s, warnings: check.warnings };
}

export function createScreen(input) {
  const theme = themes.find((t) => t.id === input.themeId) || null;
  const candidate = {
    id: `screen-custom-${screenSeq++}`,
    tier: 3,
    kind: 'screen',
    name: input.name || 'New screen',
    themeId: input.themeId || null,
    author: input.author || 'Maya Olsen (Analyst)',
    sector: input.sector || (theme ? theme.sector : ''),
    subSectors: [],
    regions: [],
    evMin: null,
    evMax: null,
    revenueMin: null,
    ebitdaMin: null,
    ebitdaMarginMin: null,
    growthMin: null,
    ownership: [],
    keywords: [],
    custom: true,
    selected: true
  };
  coerceScreen(candidate, input);
  const check = validateScreen(candidate, theme, fund);
  if (!check.ok) return { error: 'invalid', errors: check.errors, warnings: check.warnings };
  screens.push(candidate);
  return { screen: candidate, warnings: check.warnings };
}

export function getScoredTargets() {
  const sel = selectedScreens();
  const list = desk.filter((c) => c.visible);
  const targets = scoreTargets(list, sel, fund);
  return {
    selectedCount: sel.length,
    discoveredCount: desk.filter((c) => c.justDiscovered).length,
    totalCount: list.length,
    gatedCount: targets.filter((t) => t.gated).length,
    targets
  };
}

// The Stage-1 origination funnel — real, derived counts (not a single deal).
// Stage 1 is a funnel that filters MANY candidates down to a shortlist; these
// counts map straight onto the four O-steps and come from the live sourcing
// desk + fund-gate + screen scoring, so they are defensible KPIs.
export function getPipelineFunnel() {
  const scored = getScoredTargets();
  const targets = scored.targets || [];
  const passing = targets.filter((t) => !t.gated);
  const sourced = scored.totalCount;
  const mandateFit = sourced - scored.gatedCount;
  const triaged = passing.filter((t) => t.band === 'strong' || t.band === 'moderate').length;
  const gateReady = passing.filter((t) => t.band === 'strong').length;
  return {
    fundName: fund.name,
    fundStrategy: fund.strategy,
    selectedScreens: scored.selectedCount,
    discovered: scored.discoveredCount,
    funnel: [
      { key: 'O1', step: 'Deal Sourcing', label: 'Sourced', count: sourced },
      { key: 'O2', step: 'Auto Screen', label: 'Mandate-fit', count: mandateFit },
      { key: 'O3', step: 'Triage', label: 'Triaged', count: triaged },
      { key: 'O4', step: 'Screening Gate', label: 'Gate-ready', count: gateReady }
    ]
  };
}

// ---- Deal lifecycle: screen (gate) → launch (workspace) → diligence ----------

// Gate-ready targets for the O4 Screening Gate desk. Scores the full sourcing
// desk (strong-band), each flagged if a deal with that company already exists.
export function getGateTargets() {
  const sel = selectedScreens();
  const scored = scoreTargets(desk, sel, fund);
  const strong = scored.filter((t) => !t.gated && t.band === 'strong');
  const existing = new Set(deals.map((d) => d.company.toLowerCase()));
  return {
    fundName: fund.name,
    targets: strong.map((t) => ({
      id: t.id,
      name: t.name,
      sector: t.sector,
      region: t.region,
      country: t.country,
      dealSize: t.dealSize,
      ownership: t.ownership,
      score: t.score,
      matchedScreen: t.matchedScreen,
      pursued: existing.has(t.name.toLowerCase())
    }))
  };
}

// PURSUE — record the Screening-Gate decision, converting a gate-ready target
// into a SCREENED deal (passed the gate, awaiting diligence launch).
export function pursueTarget(targetId) {
  const sel = selectedScreens();
  const scored = scoreTargets(desk, sel, fund);
  const t = scored.find((x) => x.id === targetId);
  if (!t) return { error: 'target-not-found' };
  if (deals.some((d) => d.company.toLowerCase() === t.name.toLowerCase())) {
    return { error: 'already-pursued' };
  }
  const id = `screened-${dealSeq++}-${t.id}`;
  const deal = {
    id,
    company: t.name,
    sector: t.sector,
    subSector: t.matchedScreen ? t.matchedScreen.name : t.sector,
    hq: t.country || t.region,
    dealSize: t.dealSize,
    currency: 'EUR',
    stage: 'SCR',
    status: 'screened',
    screenedAt: new Date().toISOString(),
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: new Date(Date.now() + 42 * DAY).toISOString(),
    baselineDays: 45,
    thesis: `Cleared the Screening Gate with a mandate-fit score of ${t.score}. Awaiting diligence launch.`,
    keyFigures: [],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'techai', owner: 'ai-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'not_started', progress: 0, findings: [] }
    ],
    documents: [{ name: 'Investment Screen.pdf', type: 'Screen', pages: 6, status: 'parsed' }],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: `${t.name} — ${t.sector}. (Screen.)`, citations: ['Screen'] },
      { key: 'market', title: 'Market & commercial', status: 'empty', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }],
    activity: [{ actor: 'Eleanor Bishop', action: 'PURSUE recorded at the Screening Gate', when: new Date().toISOString() }],
    hoursSaved: 0
  };
  deals.push(deal);
  return { deal: getDeal(id) };
}

// LAUNCH — the Launch Orchestration (D1) action. Provisions the deal workspace
// (Teams + SharePoint + DD checklist + templates + swimlanes) and moves the deal
// into Stage-2 diligence.
export function launchDeal(id) {
  const deal = getDealRaw(id);
  if (!deal) return { error: 'not-found' };
  if (deal.status !== 'screened') return { error: 'already-launched' };
  deal.status = 'launched';
  deal.stage = 'D1';
  deal.workspace = buildWorkspace(deal, { maturity: 0, createdAt: new Date().toISOString() });
  for (const sl of deal.workspace.swimlanes) {
    const ws = deal.workstreams.find((w) => w.lane === sl.lane);
    if (ws && ws.owner) sl.md = ws.owner;
  }
  deal.activity.unshift(
    { actor: 'Power Automate', action: `PURSUE — ${GATE.detail}`, when: new Date().toISOString() },
    { actor: 'Gate-Orchestration Agent', action: 'Provisioned Teams + SharePoint workspace, DD checklist & templates', when: new Date().toISOString() }
  );
  return { deal: getDeal(id) };
}

export function getMdOptions() {
  return MD_OPTIONS;
}

// Assign / reassign a swimlane's owning MD (updates the workspace + workstream).
export function assignSwimlane(id, lane, md) {
  const deal = getDealRaw(id);
  if (!deal || !deal.workspace) return { error: 'not-found' };
  if (!MD_OPTIONS.some((m) => m.id === md)) return { error: 'invalid-md' };
  const sl = deal.workspace.swimlanes.find((s) => s.lane === lane);
  if (!sl) return { error: 'lane-not-found' };
  sl.md = md;
  const ws = deal.workstreams.find((w) => w.lane === lane);
  if (ws) ws.owner = md;
  return { deal: getDeal(id) };
}

// Advance a DD checklist item: requested → received → reviewed (→ requested).
export function cycleChecklistItem(id, itemId) {
  const deal = getDealRaw(id);
  if (!deal || !deal.workspace) return { error: 'not-found' };
  const order = ['requested', 'received', 'reviewed'];
  for (const sec of deal.workspace.checklist) {
    const it = sec.items.find((x) => x.id === itemId);
    if (it) {
      it.status = order[(order.indexOf(it.status) + 1) % order.length];
      return { deal: getDeal(id) };
    }
  }
  return { error: 'item-not-found' };
}

export function advanceDeal(id) {
  const deal = getDealRaw(id);
  if (!deal) return null;
  const idx = stepIndex(deal.stage);
  if (idx < STEP_KEYS.length - 1) {
    const crossedGate = deal.stage === GATE.afterStep;
    deal.stage = STEP_KEYS[idx + 1];
    const next = stepByKey(deal.stage);
    deal.activity.unshift({
      actor: crossedGate ? 'Power Automate' : 'Deal Orchestrator',
      action: crossedGate ? `PURSUE — ${GATE.detail}` : `Advanced to ${next.code} · ${next.title}`,
      when: new Date().toISOString()
    });
  }
  return getDeal(id);
}

export function regressDeal(id) {
  const deal = getDealRaw(id);
  if (!deal) return null;
  const idx = stepIndex(deal.stage);
  if (idx > 0) deal.stage = STEP_KEYS[idx - 1];
  return getDeal(id);
}

export async function runStep(id, stepKey) {
  const deal = getDealRaw(id);
  if (!deal) return null;
  const step = stepByKey(stepKey);
  if (!step) return null;
  const result = await runStepAgent({ deal, step });
  return { result, deal: getDeal(id) };
}

export function portfolioStats() {
  const list = deals.map(derive);
  const totalHours = list.reduce((s, d) => s + (d.hoursSaved || 0), 0);
  const avgReadiness = Math.round(list.reduce((s, d) => s + d.readiness, 0) / list.length);
  const inDiligence = list.filter((d) => d.stage.startsWith('D')).length;
  const avgDaysSaved = Math.round(list.reduce((s, d) => s + d.projectedDaysSaved, 0) / list.length);
  const baseline = list[0]?.baselineDays || 45;
  const cycleReduction = Math.round((avgDaysSaved / baseline) * 100);
  return {
    deals: list.length,
    inDiligence,
    totalHoursSaved: totalHours,
    avgReadiness,
    avgDaysSaved,
    baselineDays: baseline,
    cycleReductionPct: cycleReduction,
    fteWeeks: +(totalHours / 40).toFixed(1)
  };
}

export function resetStore() {
  deals = attachWorkspaces(clone(seedDeals));
  sourcing = clone(seedSourcing);
  fund = clone(fundMandate);
  themes = clone(seedThemes);
  screens = clone(seedScreens);
  screenSeq = 1;
  dealSeq = 1;
  desk = clone(deskCompanies);
  sources = clone(SOURCES);
}
