// Production data store. Companies/candidates/deals are persisted to Azure
// Cosmos DB via lib/repo (managed identity) and rehydrated at startup; they
// start EMPTY and are populated only by the sourcing input methods. Fund /
// themes / screens / flow / personas remain in-memory config. lib/repo falls
// back to an in-memory Map when COSMOS_ENDPOINT is unset so local dev still runs.

import { seedSourcing } from '../data/deals.js';
import { personas } from '../data/personas.js';
import { STAGES, STEPS, STEP_KEYS, FLOW, GATE, stepByKey, stepIndex } from '../data/flow.js';
import { runStep as runStepAgent } from './agents.js';
import { messagesToSignals } from './ingest/signals.js';
import { SOURCES, catalysts, catalystById } from '../data/news.js';
import { researchFor } from '../data/research.js';
import { classifyCatalyst, assessCandidate, chatCandidate, agentForStage } from './agents.js';
import { scoutNews, newsAgentConfigured } from './newsAgent.js';
import { morningstarConfigured, quality as morningstarQuality } from './mcp/morningstar.js';
import { fundMandate, seedThemes, seedScreens } from '../data/mandates.js';
import { scoreTargets, scoreScreen, gateCompany, validateScreen } from './scoring.js';
import { buildWorkspace, checklistStats, MD_OPTIONS } from '../data/workspace.js';
import {
  PASS_REASONS,
  PARK_REASONS,
  reasonLabel,
  stageIndex as candStageIndex
} from '../data/candidates.js';
import { initRepo, repoMode, companies as coRepo, deals as dealRepo, signals as sigRepo, recordEvent } from './repo/index.js';

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

let deals = [];
let sourcing = clone(seedSourcing);   // O1 signal-source config (not companies)
let fund = clone(fundMandate);
let themes = clone(seedThemes);
let screens = clone(seedScreens);
let screenSeq = 1;
let dealSeq = 1;
let candSeq = 1;
let candidates = [];
let desk = [];
let signalCompanies = [];              // O1 CxO signal companies (from M365 ingestion)
let sources = clone(SOURCES);         // news-desk source connectors (config)

// ---- persistence seam (P1 / P5) -------------------------------------------
// Companies (desk targets + funnel candidates) and deals persist to Cosmos via
// lib/repo. Writes are fire-and-forget so the store's synchronous API is
// unchanged; the in-memory arrays are the session source of truth and Cosmos is
// the durable mirror rehydrated at boot. Desk companies and candidates share the
// `companies` container, tagged by `kind` for rehydration.
function persistDesk(c) {
  coRepo.upsert({ ...c, kind: 'desk' }).catch(() => {});
}
function persistCand(c) {
  coRepo.upsert({ ...c, kind: 'candidate' }).catch(() => {});
}
function persistDeal(d) {
  dealRepo.upsert(d).catch(() => {});
}
function persistSignal(c) {
  sigRepo.upsert({ ...c, kind: 'signal' }).catch(() => {});
}
function logEvent(companyId, type, detail) {
  recordEvent({ companyId, type, detail }).catch(() => {});
}

// Load persisted state from Cosmos at startup (empty on a fresh datastore).
export async function hydrate() {
  const info = await initRepo();
  if (repoMode() !== 'cosmos') return { mode: repoMode(), companies: 0, deals: 0 };
  try {
    const cos = await coRepo.list();
    desk = cos.filter((c) => c.kind === 'desk');
    candidates = cos.filter((c) => c.kind === 'candidate');
    const ds = await dealRepo.list();
    deals = attachWorkspaces(ds);
    signalCompanies = await sigRepo.list();
  } catch {
    /* keep empty in-memory state on a read failure */
  }
  return { mode: 'cosmos', companies: desk.length + candidates.length, deals: deals.length, signals: signalCompanies.length };
}


// A screened deal (Stage-2 entry, pre-launch) built from a pursued candidate.
function makeScreenedDeal(cand, when) {
  return {
    id: `screened-${dealSeq++}-${cand.id}`,
    company: cand.company,
    sector: cand.sector,
    subSector: cand.subSector || cand.sector,
    hq: cand.hq || cand.country || cand.region,
    dealSize: cand.dealSize,
    currency: 'EUR',
    stage: 'SCR',
    status: 'screened',
    screenedAt: when || new Date().toISOString(),
    sponsorPersona: cand.sponsorPersona || 'partner',
    leadAnalyst: 'analyst',
    targetICDate: new Date(Date.now() + 42 * DAY).toISOString(),
    baselineDays: 45,
    thesis: `${cand.company} — ${cand.sector}. Cleared the Screening Gate; awaiting diligence launch.`,
    keyFigures: [
      { label: 'Revenue (LTM)', value: `€${cand.revenue}M`, source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA (LTM)', value: `€${cand.ebitda}M`, source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA margin', value: `${cand.ebitdaMargin}%`, source: 'Derived', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'techai', owner: 'ai-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'not_started', progress: 0, findings: [] }
    ],
    documents: [{ name: 'Investment Screen.pdf', type: 'Screen', pages: 6, status: 'parsed' }],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: `${cand.company} — ${cand.sector}. (Screen.)`, citations: ['Screen'] },
      { key: 'market', title: 'Market & commercial', status: 'empty', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [{ check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }],
    activity: [{ actor: 'Eleanor Bishop', action: 'PURSUE recorded at the Screening Gate', when: when || new Date().toISOString() }],
    hoursSaved: 0
  };
}

// At startup, materialise a screened deal for each already-pursued candidate.
function initScreenedFromCandidates() {
  const existing = new Set(deals.map((d) => d.company.toLowerCase()));
  for (const c of candidates.filter((x) => x.disposition === 'pursued')) {
    if (!existing.has(c.company.toLowerCase())) {
      deals.push(makeScreenedDeal(c, c.sourcedAt));
      existing.add(c.company.toLowerCase());
    }
  }
}

const MEMO_WEIGHT = { empty: 0, draft: 0.6, in_progress: 0.8, approved: 1 };
const COMPLIANCE_WEIGHT = { pending: 0, in_progress: 0.5, passed: 1, failed: 0 };
const DAY = 24 * 60 * 60 * 1000;

// Now that DAY is initialised, seed screened deals from pursued candidates.
initScreenedFromCandidates();

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
// Signal companies are ingested from the analyst's M365 mailbox (real CxO
// emails) via lib/ingest/signals and persisted to Cosmos. The raw "mailbox"
// left-hand view is derived by flattening the per-company embedded items, so
// there is no separate seeded mailbox — it starts empty and fills from real
// signals only.
const bySignalId = (id) => signalCompanies.find((c) => c.id === id);

export function getMailbox() {
  const flat = (kind) =>
    signalCompanies
      .flatMap((c) => c[kind] || [])
      .sort((a, b) => new Date(b.when) - new Date(a.when));
  return { emails: flat('emails'), chats: flat('chats'), meetings: flat('meetings') };
}

export function getSignalCompanies() {
  return signalCompanies.map((c) => {
    const emails = c.emails || [];
    const chats = c.chats || [];
    const meetings = c.meetings || [];
    return {
      id: c.id,
      name: c.name,
      sector: c.sector,
      hq: c.hq,
      summary: c.summary,
      intent: c.intent,
      counts: { emails: emails.length, chats: chats.length, meetings: meetings.length, total: emails.length + chats.length + meetings.length },
      hasCrm: !!(c.crm && c.crm.exists),
      signals: { emails, chats, meetings }
    };
  });
}

export function getCrm(companyId) {
  const c = bySignalId(companyId);
  if (!c) return null;
  return { companyId: c.id, company: c.name, ...(c.crm || { exists: false, note: 'No CRM record — net-new target.' }) };
}

// Ingest raw Microsoft Graph / WorkIQ messages into CxO signal companies:
// transform -> upsert to Cosmos -> refresh the in-memory view. Returns a summary.
// The FETCH is environment-specific (WorkIQ MCP today, a Graph job later); this
// is the shared persist step both paths call.
export function ingestSignals(messages) {
  const docs = messagesToSignals(messages || []);
  for (const doc of docs) {
    const idx = signalCompanies.findIndex((c) => c.id === doc.id);
    if (idx >= 0) signalCompanies[idx] = doc;
    else signalCompanies.push(doc);
    persistSignal(doc);
    logEvent(doc.id, 'signal-ingested', { name: doc.name, emails: doc.emails.length });
  }
  return { ingested: docs.length, companies: docs.map((d) => ({ id: d.id, name: d.name, emails: d.emails.length })) };
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
    quality: c.quality,
    live: !!c.live,
    estimated: !!c.estimated
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

// Live news search — invokes the Bing-grounded Foundry news-scout agent for the
// fund mandate, injects any newly discovered (real, source-cited) companies into
// the desk, and returns the desk. Falls back to the seed reveal on empty/error so
// the desk always advances. `source` tells the UI whether results were live.
export async function searchMoreNews({ focus } = {}) {
  if (!newsAgentConfigured()) {
    return { source: 'seed', ...findMoreNews() };
  }
  let scouted = [];
  try {
    scouted = await scoutNews({ mandate: fund, focus });
  } catch (err) {
    return { source: 'fallback', error: String(err?.message || err), ...findMoreNews() };
  }
  // Entity resolution: match by a normalized key (strip legal suffixes,
  // parenthetical aliases, and punctuation) so re-discovered companies merge
  // instead of creating duplicate profiles. De-dupes against the desk (which is
  // rehydrated from Cosmos at boot) and within the incoming batch.
  const known = new Set(desk.map((c) => entityKey(c.name)));
  const fresh = [];
  for (const c of scouted) {
    const key = entityKey(c.name);
    if (!key || known.has(key)) continue;
    known.add(key);
    fresh.push(c);
  }
  if (fresh.length === 0) {
    return { source: 'fallback', ...findMoreNews() };
  }
  for (const c of fresh) {
    desk.push(c);
    persistDesk(c);
    logEvent(c.id, 'discovered', { via: 'news-agent', name: c.name });
  }
  return {
    source: 'live',
    revealed: fresh.map(publicCompany),
    revealedCount: fresh.length,
    desk: getSourcingDesk()
  };
}

// Normalized entity-resolution key: lowercase, drop parenthetical aliases and
// anything after a slash, strip common legal/entity suffixes and punctuation.
const LEGAL_SUFFIXES = /\b(plc|inc|ltd|llc|lp|llp|gmbh|ag|sa|sas|sarl|nv|bv|spa|srl|as|ab|oyj|oy|aps|kg|co|corp|corporation|company|group|holding|holdings|international|global|the)\b/g;
function entityKey(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .split('/')[0]                    // "X / X alt spelling" -> "X"
    .replace(/\([^)]*\)/g, ' ')       // drop "(LDA)" etc.
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, '')       // punctuation + spaces
    .trim();
}

export function setFindingCatalyst(findingId, catalystId) {
  if (!catalystById[catalystId]) return null;
  for (const c of desk) {
    const n = c.news.find((x) => x.id === findingId);
    if (n) {
      n.catalyst = catalystId;
      n.manualOverride = true;
      persistDesk(c);
      return { findingId, catalyst: catalystId, companyId: c.id };
    }
  }
  return null;
}

// Live Morningstar quality check for a desk company. Maps the company to its
// Morningstar security, pulls analyst/quantitative research, and stores a real
// DeskQuality on the company (persisted to Cosmos). Falls back to the existing
// (pending) quality when the Morningstar MCP login isn't configured.
export async function runMorningstarQuality(deskId) {
  const c = desk.find((x) => x.id === deskId);
  if (!c) return null;
  if (!morningstarConfigured()) {
    return { ...c.quality, configured: false };
  }
  try {
    const q = await morningstarQuality(c.name, c.ticker || null);
    c.quality = q;
    persistDesk(c);
    logEvent(c.id, 'morningstar-quality', { rating: q.rating, score: q.score });
    return { ...q, configured: true };
  } catch (err) {
    return { ...c.quality, configured: true, error: String(err?.message || err) };
  }
}

export function morningstarReady() {
  return morningstarConfigured();
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
  const inFunnel = new Set(candidates.map((c) => c.company.toLowerCase()));
  return {
    selectedCount: sel.length,
    discoveredCount: desk.filter((c) => c.justDiscovered).length,
    totalCount: list.length,
    gatedCount: targets.filter((t) => t.gated).length,
    targets: targets.map((t) => ({ ...t, inFunnel: inFunnel.has(t.name.toLowerCase()) }))
  };
}

// ===========================================================================
//  Stage-1 origination COHORT — candidates flow O2 → O3 → O4, filtered at each
//  step (advance / pass / park). PURSUE at O4 flips a candidate into a screened
//  deal (single-deal workflow from there).
// ===========================================================================

// Score a candidate against the selected screens (same engine as O1 targets).
function scoreCandidate(c) {
  const sel = selectedScreens();
  const gate = gateCompany(c, fund);
  let best = { score: 0, screen: null, parts: null };
  if (gate.passes) {
    for (const s of sel) {
      const { score, parts } = scoreScreen(c, s);
      if (score > best.score) best = { score, screen: { id: s.id, name: s.name }, parts };
    }
  }
  const band = !gate.passes ? 'excluded' : best.score >= 75 ? 'strong' : best.score >= 45 ? 'moderate' : 'weak';
  return { gate, score: best.score, band, matchedScreen: best.screen };
}

// The O2 "Target-Screening Agent" hard-knockout recommendation for a candidate.
function screenRecommendation(c) {
  const knockouts = [];
  const gate = gateCompany(c, fund);
  if (!gate.passes) knockouts.push({ reason: 'esg-exclusion', detail: gate.reasons[0] });
  if ((c.ebitdaMargin ?? 0) < 6) knockouts.push({ reason: 'business-model', detail: `EBITDA margin ${c.ebitdaMargin}% below viability floor` });
  if ((c.growth ?? 0) < -2) knockouts.push({ reason: 'revenue-quality', detail: `Revenue declining (${c.growth}% YoY)` });
  if ((c.ebitda ?? 0) < 10) knockouts.push({ reason: 'size-floor', detail: `EBITDA €${c.ebitda}M below the size floor` });
  return { action: knockouts.length ? 'pass' : 'advance', knockouts };
}

// Assemble the grounded "knowledge" an assessment agent reasons over: the fund
// mandate + hard gate + quant fit + the candidate record. Keeps the LLM (or the
// seeded fallback) anchored to real fund constraints and figures.
function candidateKnowledge(c) {
  const sc = scoreCandidate(c);
  const rec = screenRecommendation(c);
  const mandate = [
    `${fund.name} — ${fund.strategy}.`,
    `Permitted sectors: ${fund.sectorsPermitted.join(', ')}. LPA-excluded: ${fund.sectorsExcluded.join(', ')}.`,
    `Geographies: ${fund.geographies.join(', ')}. EV band €${fund.evMin}–${fund.evMax}M.`,
    `ESG: ${fund.esgPolicy}. Leverage limit ${fund.leverageLimit}. Max ${fund.maxEquityPerDeal}% equity/deal, ${fund.maxSectorConcentration}% sector concentration.`
  ].join(' ');
  const gateSummary = sc.gate.passes
    ? 'PASSES all binding mandate constraints (sector, geography, EV band).'
    : `FAILS mandate constraints — ${sc.gate.reasons.join('; ')}.`;
  const scoreSummary = `${sc.score}/100 (${sc.band} fit)${sc.matchedScreen ? `, best-fit screen "${sc.matchedScreen.name}"` : ', no strong screen match'}.`;
  const knockoutSummary = rec.knockouts.length
    ? rec.knockouts.map((k) => k.detail).join('; ')
    : 'none tripped.';
  const candidateSummary = [
    `${c.company} — ${c.sector} / ${c.subSector}, ${c.region} (${c.country}), HQ ${c.hq}.`,
    `Ownership: ${c.ownership}. Indicative EV €${c.dealSize}M.`,
    `Revenue €${c.revenue}M, EBITDA €${c.ebitda}M (${c.ebitdaMargin}% margin), growth ${c.growth >= 0 ? '+' : ''}${c.growth}% YoY.`,
    `Angle/keywords: ${(c.keywords || []).join(', ') || '—'}.`
  ].join(' ');
  return {
    mandate, gateSummary, scoreSummary, knockoutSummary, candidateSummary,
    score: sc.score, band: sc.band, matchedScreen: sc.matchedScreen,
    knockouts: rec.knockouts,
    sector: c.sector, region: c.region, dealSize: c.dealSize,
    ebitda: c.ebitda, ebitdaMargin: c.ebitdaMargin, growth: c.growth
  };
}

function publicCandidate(c) {
  const sc = scoreCandidate(c);
  return {
    id: c.id,
    company: c.company,
    sector: c.sector,
    subSector: c.subSector,
    region: c.region,
    country: c.country,
    hq: c.hq,
    dealSize: c.dealSize,
    ownership: c.ownership,
    revenue: c.revenue,
    ebitda: c.ebitda,
    ebitdaMargin: c.ebitdaMargin,
    growth: c.growth,
    keywords: c.keywords,
    sources: c.sources || [],
    stage: c.stage,
    disposition: c.disposition,
    passReason: c.passReason,
    passReasonLabel: c.passReason ? reasonLabel(c.passStage, c.passReason) : null,
    passStage: c.passStage,
    passNote: c.passNote || null,
    sourcedAt: c.sourcedAt,
    score: sc.score,
    band: sc.band,
    gated: !sc.gate.passes,
    gateReasons: sc.gate.reasons,
    matchedScreen: sc.matchedScreen,
    screenRec: screenRecommendation(c),
    assessment: (c.assessments && c.assessments[c.stage]) || null
  };
}

// Funnel "reached" math: a candidate at stage S (or pursued) reached S. Passed/
// parked candidates reached their passStage. Segments are monotonic survivors.
const REACHED = { O2: 2, O3: 3, O4: 4, pursued: 5 };
function reachedIndex(c) {
  if (c.disposition === 'pursued') return 5;
  if (c.disposition === 'passed' || c.disposition === 'parked') return REACHED[c.passStage] ?? candStageIndex(c.stage) + 2;
  return REACHED[c.stage] ?? 2;
}

export function getStage1Funnel() {
  const all = candidates;
  const reachedAtLeast = (n) => all.filter((c) => reachedIndex(c) >= n).length;
  const activeAt = (s) => all.filter((c) => c.disposition === 'active' && c.stage === s).length;
  return {
    fundName: fund.name,
    fundStrategy: fund.strategy,
    selectedScreens: selectedScreens().length,
    discovered: 0,
    counts: {
      total: all.length,
      active: all.filter((c) => c.disposition === 'active').length,
      passed: all.filter((c) => c.disposition === 'passed').length,
      parked: all.filter((c) => c.disposition === 'parked').length,
      pursued: all.filter((c) => c.disposition === 'pursued').length
    },
    funnel: [
      { key: 'O1', step: 'Deal Sourcing', label: 'Sourced', count: reachedAtLeast(2), active: activeAt('O2') },
      { key: 'O2', step: 'Auto Screen', label: 'Screened', count: reachedAtLeast(3), active: activeAt('O2') },
      { key: 'O3', step: 'Triage', label: 'Triaged', count: reachedAtLeast(4), active: activeAt('O3') },
      { key: 'O4', step: 'Screening Gate', label: 'Gate-ready', count: reachedAtLeast(5), active: activeAt('O4') }
    ]
  };
}

// Backward-compatible alias for the top-bar/home funnel (same {key,label,count}).
export function getPipelineFunnel() {
  return getStage1Funnel();
}

// The actionable cohort at a stage — active candidates awaiting the step action.
export function getCohort(stage) {
  const list = candidates
    .filter((c) => c.disposition === 'active' && c.stage === stage)
    .map(publicCandidate);
  // O3 is a relative-ranking activity — sort by score desc and attach a rank.
  if (stage === 'O3' || stage === 'O4') {
    list.sort((a, b) => b.score - a.score);
    list.forEach((c, i) => { c.rank = i + 1; });
  }
  return { stage, fundName: fund.name, candidates: list };
}

// Only O2 (Auto Screen) and O3 (Triage) run a per-candidate assessment agent.
// O4 is the MD's human PURSUE call; O1 is sourcing.
const ASSESSABLE = new Set(['O2', 'O3']);

// Run (or reuse) the assessment agent for a single candidate at its stage. The
// result is cached on the candidate so opening the desk doesn't re-run the model
// every refresh; `force` bypasses the cache for a manual re-assessment.
async function ensureAssessment(c, force) {
  if (!ASSESSABLE.has(c.stage)) return null;
  c.assessments = c.assessments || {};
  if (c.assessments[c.stage] && !force) return c.assessments[c.stage];
  const knowledge = candidateKnowledge(c);
  const a = await assessCandidate({ candidate: publicCandidate(c), stage: c.stage, knowledge });
  if (a) { c.assessments[c.stage] = a; persistCand(c); }
  return a;
}

// Assess every active candidate at a stage (in parallel) and return the cohort
// with each candidate's recommendation attached. Called when the O2/O3 desk opens.
export async function assessCohort(stage, { force = false } = {}) {
  if (!ASSESSABLE.has(stage)) return getCohort(stage);
  const active = candidates.filter((c) => c.disposition === 'active' && c.stage === stage);
  await Promise.all(active.map((c) => ensureAssessment(c, force).catch(() => null)));
  return getCohort(stage);
}

// Force a fresh assessment for one candidate (the per-row re-assess action).
export async function assessCandidateById(id, force = true) {
  const c = candidates.find((x) => x.id === id);
  if (!c || c.disposition !== 'active' || !ASSESSABLE.has(c.stage)) return { error: 'not-actionable' };
  const a = await ensureAssessment(c, force);
  return { ok: true, assessment: a, candidate: publicCandidate(c) };
}

// Persistent per-candidate conversation with the step's agent (O2/O3). History
// is stored on the candidate so reopening the popup shows the prior thread.
export function getCandidateChat(id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return { error: 'not-found' };
  return { id: c.id, company: c.company, stage: c.stage, agent: agentForStage(c.stage), log: c.chatLog || [] };
}

export async function chatCandidateById(id, message) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return { error: 'not-found' };
  const text = (message || '').toString().trim().slice(0, 1000);
  if (!text) return { error: 'message-required' };
  c.chatLog = c.chatLog || [];
  c.chatLog.push({ role: 'user', content: text, at: new Date().toISOString() });
  const knowledge = candidateKnowledge(c);
  const assessment = (c.assessments && c.assessments[c.stage]) || null;
  const history = c.chatLog.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  const out = await chatCandidate({
    stage: c.stage, agent: agentForStage(c.stage), knowledge, assessment, message: text, history
  });
  c.chatLog.push({ role: 'agent', content: out.reply, at: new Date().toISOString(), source: out.source });
  persistCand(c);
  return { reply: out.reply, source: out.source, log: c.chatLog };
}

// The whole Stage-1 pipeline (for the Pipeline page).
export function getPipeline() {
  return {
    fundName: fund.name,
    funnel: getStage1Funnel().funnel,
    candidates: candidates.map(publicCandidate)
  };
}

export function getPassReasons() {
  return { pass: PASS_REASONS, park: PARK_REASONS };
}

// Move a candidate from one stage to the next (or pass/park it) with a reason.
function transition(cand, fromStage, action, reason, note) {
  if (action === 'pass') {
    cand.disposition = 'passed';
    cand.passStage = fromStage;
    cand.passReason = reason || 'conviction';
    if (note) cand.passNote = note;
    return;
  }
  if (action === 'park') {
    cand.disposition = 'parked';
    cand.passStage = fromStage;
    cand.passReason = reason || 'monitor';
    if (note) cand.passNote = note;
    return;
  }
  // advance
  const next = { O2: 'O3', O3: 'O4' };
  cand.stage = next[fromStage] || fromStage;
  cand.disposition = 'active';
  cand.passStage = null;
  cand.passReason = null;
  cand.passNote = null;
}

export function screenCandidate(id, action, reason, note) {
  const c = candidates.find((x) => x.id === id);
  if (!c || c.stage !== 'O2' || c.disposition !== 'active') return { error: 'not-actionable' };
  transition(c, 'O2', action, reason, note);
  persistCand(c);
  logEvent(c.deskId || c.id, 'screen', { action, reason: reason || null });
  return { ok: true, candidate: publicCandidate(c) };
}

export function triageCandidate(id, action, reason, note) {
  const c = candidates.find((x) => x.id === id);
  if (!c || c.stage !== 'O3' || c.disposition !== 'active') return { error: 'not-actionable' };
  transition(c, 'O3', action, reason, note);
  persistCand(c);
  logEvent(c.deskId || c.id, 'triage', { action, reason: reason || null });
  return { ok: true, candidate: publicCandidate(c) };
}

// O4 gate: advance === PURSUE (create the screened deal); pass/park otherwise.
export function gateCandidate(id, action, reason, note) {
  const c = candidates.find((x) => x.id === id);
  if (!c || c.stage !== 'O4' || c.disposition !== 'active') return { error: 'not-actionable' };
  if (action === 'advance' || action === 'pursue') {
    if (deals.some((d) => d.company.toLowerCase() === c.company.toLowerCase())) {
      return { error: 'already-pursued' };
    }
    c.disposition = 'pursued';
    c.stage = 'pursued';
    c.passStage = null;
    c.passReason = null;
    const deal = makeScreenedDeal(c, new Date().toISOString());
    deals.push(deal);
    persistCand(c);
    persistDeal(deal);
    logEvent(c.deskId || c.id, 'pursue', { deal: deal.id, company: c.company });
    return { ok: true, candidate: publicCandidate(c), deal: getDeal(deal.id) };
  }
  transition(c, 'O4', action, reason, note);
  persistCand(c);
  logEvent(c.deskId || c.id, 'gate', { action, reason: reason || null });
  return { ok: true, candidate: publicCandidate(c) };
}

// Option A — promote a discovered O1 desk target into the funnel at O2.
export function sendToScreening(deskId) {
  const d = desk.find((x) => x.id === deskId);
  if (!d) return { error: 'target-not-found' };
  if (candidates.some((c) => c.company.toLowerCase() === d.name.toLowerCase())) {
    return { error: 'already-in-funnel' };
  }
  const c = {
    id: `cand-new-${candSeq++}`,
    deskId: d.id,
    company: d.name,
    sector: d.sector,
    subSector: d.sector,
    region: d.region,
    country: d.country,
    hq: d.country,
    dealSize: d.dealSize,
    ownership: d.ownership,
    revenue: d.revenue,
    ebitda: d.ebitda,
    ebitdaMargin: d.ebitdaMargin,
    growth: d.growth,
    keywords: d.keywords || [],
    sources: d.sources || ['news'],
    stage: 'O2',
    disposition: 'active',
    passReason: null,
    passStage: null,
    sourcedAt: new Date().toISOString()
  };
  candidates.push(c);
  persistCand(c);
  logEvent(d.id, 'sent-to-screening', { candidate: c.id, company: c.company });
  return { ok: true, candidate: publicCandidate(c) };
}

// ---- Deal lifecycle: launch (workspace) → diligence -------------------------

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
  persistDeal(deal);
  logEvent(deal.id, 'launch', { company: deal.company });
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
  persistDeal(deal);
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
      persistDeal(deal);
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
  persistDeal(deal);
  return getDeal(id);
}

export function regressDeal(id) {
  const deal = getDealRaw(id);
  if (!deal) return null;
  const idx = stepIndex(deal.stage);
  if (idx > 0) deal.stage = STEP_KEYS[idx - 1];
  persistDeal(deal);
  return getDeal(id);
}

export async function runStep(id, stepKey) {
  const deal = getDealRaw(id);
  if (!deal) return null;
  const step = stepByKey(stepKey);
  if (!step) return null;
  const result = await runStepAgent({ deal, step });
  persistDeal(deal);
  return { result, deal: getDeal(id) };
}

export function portfolioStats() {
  const list = deals.map(derive);
  const n = list.length;
  const totalHours = list.reduce((s, d) => s + (d.hoursSaved || 0), 0);
  const avgReadiness = n ? Math.round(list.reduce((s, d) => s + d.readiness, 0) / n) : 0;
  const inDiligence = list.filter((d) => d.stage.startsWith('D')).length;
  const avgDaysSaved = n ? Math.round(list.reduce((s, d) => s + d.projectedDaysSaved, 0) / n) : 0;
  const baseline = list[0]?.baselineDays || 45;
  const cycleReduction = baseline ? Math.round((avgDaysSaved / baseline) * 100) : 0;
  return {
    deals: n,
    inDiligence,
    totalHoursSaved: totalHours,
    avgReadiness,
    avgDaysSaved,
    baselineDays: baseline,
    cycleReductionPct: cycleReduction,
    fteWeeks: +(totalHours / 40).toFixed(1)
  };
}

// Reset to a clean EMPTY production state (no seed companies). Persisted state in
// Cosmos is untouched; callers that want a fresh datastore clear it out-of-band.
export function resetStore() {
  deals = [];
  sourcing = clone(seedSourcing);
  fund = clone(fundMandate);
  themes = clone(seedThemes);
  screens = clone(seedScreens);
  screenSeq = 1;
  dealSeq = 1;
  candSeq = 1;
  candidates = [];
  desk = [];
  sources = clone(SOURCES);
}
