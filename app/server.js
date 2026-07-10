// The Deal Room — API server. Serves the built React client and exposes the
// deal record, persona quick-actions and the Deal Orchestrator chat.

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import {
  listDeals,
  getDeal,
  getDealRaw,
  listSourcing,
  promoteSourcing,
  getPersonas,
  getStages,
  getFlow,
  getMailbox,
  getSignalCompanies,
  getCrm,
  getSourcingDesk,
  findMoreNews,
  searchMoreNews,
  setFindingCatalyst,
  runMorningstarQuality,
  runFilings,
  scanFormDTargets,
  morningstarReady,
  getAnalystResearch,
  getFramework,
  setScreenSelected,
  setThemeSelected,
  updateScreen,
  createScreen,
  getScoredTargets,
  getTargetDetail,
  retryTargetQuality,
  saveFilingArchive,
  getSavedFilingManifest,
  getSavedFilingFile,
  archiveDealFilingsToOneLake,
  backfillOneLakeFilings,
  oneLakeStatus,
  oneLakeProbe,
  listOneLakeFilings,
  getPipelineFunnel,
  getStage1Funnel,
  getCohort,
  getPipeline,
  canonicalCompanies,
  canonicalCompany,
  getPassReasons,
  assessCohort,
  assessCandidateById,
  getCandidateChat,
  getCandidateArtifact,
  chatCandidateById,
  screenCandidate,
  triageCandidate,
  gateCandidate,
  sendToScreening,
  launchDeal,
  getDealArtifact,
  ensureDealTeamsChannel,
  provisionAllDealChannels,
  dealForTeam,
  getMdOptions,
  assignSwimlane,
  recordContribution,
  cycleChecklistItem,
  recordIssue,
  resolveIssue,
  setCondition,
  updateCondition,
  snapshotAssumptions,
  getICReadiness,
  getCitationAudit,
  marketIntel,
  fabricStatus,
  refreshFabricData,
  comparableDeals,
  benchmarkFindings,
  icPrecedents,
  companyFinancials,
  advanceDeal,
  regressDeal,
  runStep,
  portfolioStats,
  hydrate
} from './lib/store.js';
import { personaById } from './data/personas.js';
import { runAction, chat } from './lib/agents.js';
import { getModelInfo } from './lib/ai.js';
import { newsAgentConfigured } from './lib/newsAgent.js';
import { chatDealAgent, dealAgentInfo } from './lib/dealAgent.js';
import { chatPersonaAgent, personaAgentsInfo } from './lib/personaAgent.js';
import { dealMcpHandler, dealMcpReadonlyHandler, dealMcpMethodNotAllowed, dealMcpInfo, dealMcpReadonlyInfo } from './lib/mcp/dealServer.js';
import { mcpAuthMiddleware, mcpReadonlyAuthMiddleware, mcpAuthInfo, mcpReadonlyKeyConfigured } from './lib/mcp/entraAuth.js';
import { listConnectors, testConnector, disconnectConnector } from './lib/connectors.js';
import connectorLoginRouter from './lib/mcp/loginRoutes.js';
import m365LoginRouter from './lib/m365/loginRoutes.js';
import { m365Configured, m365Connected, m365FilesScope, listDealDocuments, saveDealDocument, M365NotConnectedError } from './lib/m365/graph.js';
import { buildIcMemoDocx, buildDealModelXlsx, OFFICE_MIME } from './lib/m365/office.js';
import { repoMode } from './lib/repo/index.js';
import graphRouter from './lib/graph.js';
import { config, validateConfig } from './lib/config.js';
import { accessFor, authorizePersona, authorizeDealAccess } from './lib/userPolicy.js';

validateConfig({ strict: false });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

// RBAC trust seam: only honour a supplied requesting identity when the caller
// proves it is the Teams bot (shared BOT_BACKEND_KEY). Otherwise the request is
// treated as unidentified (DEFAULT_AGENT_ROLE) so a client can't spoof a role.
const BOT_BACKEND_KEY = (process.env.BOT_BACKEND_KEY || '').trim();
function requestingIdentity(req) {
  const ru = req.body?.requestingUser;
  if (!ru) return null;
  if (BOT_BACKEND_KEY && req.headers['x-bot-key'] !== BOT_BACKEND_KEY) return null;
  return { oid: ru.oid, upn: ru.upn, name: ru.name };
}

// ---- API ----
const api = express.Router();

api.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Microsoft Graph mailbox change-notifications (O1 Deal-Sourcing signals)
api.use('/graph', graphRouter);

api.get('/config', (_req, res) => {
  const info = getModelInfo();
  res.json({
    ...info,
    region: config.server.region,
    appName: 'The Deal Room',
    newsAgent: newsAgentConfigured() ? 'live' : 'demo',
    dealAgent: dealAgentInfo().configured ? 'live' : 'demo',
    personaAgents: personaAgentsInfo(),
    dealMcp: { ...dealMcpInfo(), auth: mcpAuthInfo(), readonly: { ...dealMcpReadonlyInfo(), keyConfigured: mcpReadonlyKeyConfigured() } },
    m365: { configured: m365Configured(), connected: m365Connected(), files: m365FilesScope() },
    morningstar: morningstarReady() ? 'live' : 'demo',
    fabric: fabricStatus(),
    onelake: oneLakeStatus(),
    datastore: repoMode()
  });
});

api.get('/personas', (_req, res) => res.json(getPersonas()));
api.get('/stages', (_req, res) => res.json(getStages()));
api.get('/flow', (_req, res) => res.json(getFlow()));
api.get('/deals', (_req, res) => res.json(listDeals()));
api.get('/analytics', (_req, res) => res.json(portfolioStats()));
api.get('/pipeline', (_req, res) => res.json(getPipelineFunnel())); // alias (funnel)

// Stage-1 origination cohort funnel
api.get('/stage1/funnel', (_req, res) => res.json(getStage1Funnel()));
api.get('/stage1/pipeline', (_req, res) => res.json(getPipeline()));
api.get('/stage1/cohort/:stage', (req, res) => res.json(getCohort(req.params.stage)));
api.get('/stage1/pass-reasons', (_req, res) => res.json(getPassReasons()));

// Run the step's assessment agent across the whole active cohort (O2/O3), then
// return the cohort with each candidate's recommendation attached.
api.post('/stage1/cohort/:stage/assess', async (req, res) => {
  const stage = req.params.stage;
  if (stage !== 'O2' && stage !== 'O3') return res.status(400).json({ error: 'stage-not-assessable' });
  try {
    const cohort = await assessCohort(stage, { force: !!req.body?.force });
    res.json(cohort);
  } catch (err) {
    res.status(500).json({ error: 'assess failed', detail: String(err?.message || err) });
  }
});

// Force a fresh assessment for a single candidate (per-row re-assess).
api.post('/candidates/:id/assess', async (req, res) => {
  try {
    const r = await assessCandidateById(req.params.id, true);
    if (r.error) return res.status(400).json(r);
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: 'assess failed', detail: String(err?.message || err) });
  }
});

// Persistent per-candidate conversation with the step's agent (O2/O3).
api.get('/candidates/:id/chat', (req, res) => {
  const r = getCandidateChat(req.params.id);
  if (r.error) return res.status(404).json(r);
  res.json(r);
});
api.post('/candidates/:id/chat', async (req, res) => {
  try {
    const r = await chatCandidateById(req.params.id, req.body?.message);
    if (r.error) return res.status(400).json(r);
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: 'chat failed', detail: String(err?.message || err) });
  }
});

// Stage artifact — the real PE deliverable for the candidate's funnel step:
// O2 Investment-Criteria Scorecard · O3 Triage Scorecard · O4 IC Pre-Screen Memo.
api.post('/candidates/:id/artifact', async (req, res) => {
  try {
    const r = await getCandidateArtifact(req.params.id, { force: !!req.body?.force });
    if (!r) return res.status(404).json({ error: 'candidate not found' });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: 'artifact failed', detail: String(err?.message || err) });
  }
});

api.post('/candidates/:id/screen', (req, res) => {
  const r = screenCandidate(req.params.id, req.body?.action, req.body?.reason, req.body?.note);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});
api.post('/candidates/:id/triage', (req, res) => {
  const r = triageCandidate(req.params.id, req.body?.action, req.body?.reason, req.body?.note);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});
api.post('/candidates/:id/gate', (req, res) => {
  const r = gateCandidate(req.params.id, req.body?.action, req.body?.reason, req.body?.note);
  if (r.error) return res.status(r.error === 'already-pursued' ? 409 : 400).json(r);
  res.json(r);
});
api.post('/candidates/send-to-screening', (req, res) => {
  const r = sendToScreening(req.body?.deskId);
  if (r.error) return res.status(r.error === 'already-in-funnel' ? 409 : 404).json(r);
  res.status(201).json(r);
});

// D1 · Launch Orchestration — workspace provisioning + swimlane / checklist ops
api.get('/md-options', (_req, res) => res.json(getMdOptions()));
api.post('/deals/:id/launch', async (req, res) => {
  const r = await launchDeal(req.params.id);
  if (r.error) return res.status(r.error === 'not-found' ? 404 : 409).json(r);
  res.json(r.deal);
});
// Ensure (create-or-reuse) the deal's live Teams channel; used by the workspace
// Teams button and as a retry when the deal was launched while M365 was offline.
api.post('/deals/:id/teams/ensure', async (req, res) => {
  const r = await ensureDealTeamsChannel(req.params.id);
  if (r.error === 'not-found') return res.status(404).json(r);
  if (r.error === 'not-launched') return res.status(409).json(r);
  res.json(r);
});
// Ensure EVERY deal has its own Teams channel in the threads (chat) layout — the
// backfill used to auto-create channels for all deals + force existing ones to threads.
api.post('/deals/teams/ensure-all', async (_req, res) => {
  res.json(await provisionAllDealChannels());
});
// Resolve the deal that owns a given Teams team/channel id — used by the in-channel
// conversational bot to map a message to its deal.
api.get('/deals/resolve-team/:teamId', (req, res) => {
  const r = dealForTeam(req.params.teamId);
  if (!r) return res.status(404).json({ error: 'no-deal-for-team' });
  res.json(r);
});
api.patch('/deals/:id/swimlanes/:lane', async (req, res) => {
  const r = await assignSwimlane(req.params.id, req.params.lane, req.body?.md);
  if (r.error) return res.status(r.error === 'invalid-md' ? 422 : 404).json(r);
  res.json(r.deal);
});

// ---- Deal documents (Word/Excel in the SharePoint data room) ----------------
// Leverages the signed-in user's Microsoft 365 (delegated Graph) to list the
// deal's data-room documents and to GENERATE a Word IC memo / Excel deal model
// from the live deal record, saved back into SharePoint. Reads follow deal
// access; writes are RBAC-gated (deal team / partner). Degrades cleanly with a
// 409 when M365 isn't connected yet.
const docSafeCompany = (deal) =>
  String(deal.company || deal.id).replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Deal';

api.get('/deals/:id/documents', async (req, res) => {
  const deal = getDealRaw(req.params.id);
  if (!deal) return res.status(404).json({ error: 'not-found' });
  const identity = requestingIdentity(req);
  const gate = authorizeDealAccess(identity, deal.stage || deal.stageName);
  if (!gate.ok) return res.status(403).json({ denied: true, reason: gate.reason });
  try {
    const out = await listDealDocuments(deal);
    res.json({ ...out, canWrite: !!gate.access.canWrite });
  } catch (err) {
    const notConnected = err instanceof M365NotConnectedError;
    res.status(notConnected ? 409 : 502).json({ error: String(err?.message || err).slice(0, 240), notConnected });
  }
});

api.post('/deals/:id/documents/:kind', async (req, res) => {
  const { id, kind } = req.params;
  if (kind !== 'ic-memo' && kind !== 'model') return res.status(404).json({ error: 'unknown-document' });
  const deal = getDealRaw(id);
  if (!deal) return res.status(404).json({ error: 'not-found' });
  const identity = requestingIdentity(req);
  const gate = authorizeDealAccess(identity, deal.stage || deal.stageName);
  if (!gate.ok) return res.status(403).json({ denied: true, reason: gate.reason });
  if (!gate.access.canWrite) return res.status(403).json({ denied: true, reason: 'Generating deal documents requires deal-team or partner access.' });
  try {
    const co = docSafeCompany(deal);
    let filename, buffer, contentType;
    if (kind === 'ic-memo') {
      buffer = await buildIcMemoDocx(deal);
      filename = `IC Memo — ${co}.docx`;
      contentType = OFFICE_MIME.docx;
    } else {
      buffer = await buildDealModelXlsx(deal);
      filename = `Deal Model — ${co}.xlsx`;
      contentType = OFFICE_MIME.xlsx;
    }
    const document = await saveDealDocument(deal, filename, buffer, contentType);
    res.json({ ok: true, kind, document });
  } catch (err) {
    const notConnected = err instanceof M365NotConnectedError;
    res.status(notConnected ? 409 : 502).json({ error: String(err?.message || err).slice(0, 240), notConnected });
  }
});
// Record an MD contribution (guidance | value_add | diligence) into a lane. This
// is the dashboard-side entrypoint mirroring the MCP record_contribution tool.
// `md` is the contributing MD's persona id (defaults to the lane's assigned MD);
// the display name is resolved from the MD options.
api.post('/deals/:id/contributions', async (req, res) => {
  const { lane, kind, text, severity, source, md } = req.body || {};
  if (!lane || !text) return res.status(422).json({ error: 'lane-and-text-required' });
  const mdName = (getMdOptions().find((m) => m.id === md) || {}).name || null;
  const r = await recordContribution(req.params.id, lane, { kind, text, severity, source, by: mdName, persona: md });
  if (r.error) {
    const code = r.error === 'not-found' || r.error === 'lane-not-found' ? 404 : 422;
    return res.status(code).json(r);
  }
  res.json(r.deal);
});
api.post('/deals/:id/checklist/:itemId/cycle', async (req, res) => {
  const r = await cycleChecklistItem(req.params.id, req.params.itemId);
  if (r.error) return res.status(404).json(r);
  res.json(r.deal);
});

// IC Readiness Cockpit — the decision-grade board (7 questions + verdict),
// grounded in real Fabric/OneLake market intelligence.
api.get('/deals/:id/ic-readiness', (req, res) => {
  const board = getICReadiness(req.params.id);
  if (!board) return res.status(404).json({ error: 'not-found' });
  res.json(board);
});

// Source-citation audit — numeric claims in IC materials mapped to source facts;
// unsourced figures flagged (point 5).
api.get('/deals/:id/citations', (req, res) => {
  const audit = getCitationAudit(req.params.id);
  if (!audit) return res.status(404).json({ error: 'not-found' });
  res.json(audit);
});

// Operational diligence: issue log (severity + owner + resolution path + due date).
api.post('/deals/:id/issues', async (req, res) => {
  const { lane, title, severity, owner, resolutionPath, sources, dueDate, md } = req.body || {};
  const by = (getMdOptions().find((m) => m.id === md) || {}).name || null;
  const r = await recordIssue(req.params.id, { lane, title, severity, owner, resolutionPath, sources, dueDate, by, persona: md });
  if (r.error) return res.status(r.error === 'not-found' ? 404 : 422).json(r);
  res.json(r.deal);
});
api.patch('/deals/:id/issues/:issueId', async (req, res) => {
  const { status, resolutionPath, md } = req.body || {};
  const by = (getMdOptions().find((m) => m.id === md) || {}).name || null;
  const r = await resolveIssue(req.params.id, req.params.issueId, { status, resolutionPath, by, persona: md });
  if (r.error) return res.status(r.error.endsWith('not-found') ? 404 : 422).json(r);
  res.json(r.deal);
});

// IC conditions (partner-owned).
api.post('/deals/:id/conditions', async (req, res) => {
  const { text, owner, status, md } = req.body || {};
  const by = (getMdOptions().find((m) => m.id === md) || {}).name || null;
  const r = await setCondition(req.params.id, { text, owner, status, by, persona: md });
  if (r.error) return res.status(r.error === 'not-found' ? 404 : 422).json(r);
  res.json(r.deal);
});
api.patch('/deals/:id/conditions/:condId', async (req, res) => {
  const { status, text, owner, md } = req.body || {};
  const by = (getMdOptions().find((m) => m.id === md) || {}).name || null;
  const r = await updateCondition(req.params.id, req.params.condId, { status, text, owner, by });
  if (r.error) return res.status(r.error.endsWith('not-found') ? 404 : 422).json(r);
  res.json(r.deal);
});

// Assumption snapshot — records the current key assumptions as an IC-draft baseline
// so the cockpit can show what changed since the last draft.
api.post('/deals/:id/assumption-snapshot', async (req, res) => {
  const { label, md } = req.body || {};
  const by = (getMdOptions().find((m) => m.id === md) || {}).name || null;
  const r = await snapshotAssumptions(req.params.id, { label, by });
  if (r.error) return res.status(404).json(r);
  res.json(r.deal);
});

// Fabric / OneLake market intelligence — comparable deals, benchmark diligence
// findings, IC voting precedents and real company financials.
api.get('/market-intel', (_req, res) => res.json(marketIntel() || { info: fabricStatus(), companies: [], comparableDeals: [], benchmarkFindings: [], icPrecedents: [], companyFinancials: {} }));
api.get('/market-intel/comps', (req, res) => res.json(comparableDeals({ sector: req.query.sector })));
api.get('/market-intel/benchmarks', (req, res) => res.json(benchmarkFindings(req.query.workstream)));
api.get('/market-intel/ic-precedents', (_req, res) => res.json(icPrecedents()));
api.get('/market-intel/financials/:ticker', (req, res) => {
  const f = companyFinancials(req.params.ticker);
  if (!f) return res.status(404).json({ error: 'no-coverage' });
  res.json(f);
});

// Fabric status + data lineage; POST re-attempts a live lakehouse query.
api.get('/fabric', (_req, res) => res.json(fabricStatus()));
api.post('/fabric/refresh', async (_req, res) => {
  const info = await refreshFabricData();
  res.json(info);
});

// O1 · Deal Sourcing — CxO signals explorer
api.get('/signals/mailbox', (_req, res) => res.json(getMailbox()));
api.get('/signals/companies', (_req, res) => res.json(getSignalCompanies()));
api.get('/signals/companies/:id/crm', (req, res) => {
  const crm = getCrm(req.params.id);
  if (!crm) return res.status(404).json({ error: 'company not found' });
  res.json(crm);
});

// Canonical Company model — the unified, entity-resolved governed record over the
// three sourcing feeds (news desk + funnel candidates + CxO signals).
api.get('/companies', (req, res) => {
  const inFunnel = req.query.inFunnel === 'true' ? true : req.query.inFunnel === 'false' ? false : undefined;
  res.json(canonicalCompanies({ inFunnel }));
});
api.get('/companies/:id', (req, res) => {
  const c = canonicalCompany(req.params.id);
  if (!c) return res.status(404).json({ error: 'company-not-found' });
  res.json(c);
});

// Data-source connectivity (Home connectivity panel). Real tests for Web + MCP
// connectors; unwired vendor DBs report disconnected honestly.
api.get('/connectors', (_req, res) => res.json(listConnectors()));
api.post('/connectors/:id/test', async (req, res) => {
  try {
    const out = await testConnector(req.params.id, { force: true });
    if (!out) return res.status(404).json({ error: 'unknown connector' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'connectivity test failed', detail: String(err?.message || err) });
  }
});
// Disconnect an OAuth-backed connector (m365 / MCP provider): clears the stored
// delegated token so the next use requires a fresh sign-in + consent.
api.post('/connectors/:id/disconnect', async (req, res) => {
  try {
    const out = await disconnectConnector(req.params.id);
    if (!out) return res.status(404).json({ error: 'unknown connector' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'disconnect failed', detail: String(err?.message || err) });
  }
});
// In-app OAuth sign-in for MCP connectors: /connectors/:provider/login|callback
api.use('/connectors', connectorLoginRouter);
// In-app Microsoft 365 (Entra) delegated sign-in: /m365/login|callback
api.use('/m365', m365LoginRouter);

// O1 · Deal Sourcing — News & filings desk
api.get('/news/desk', (_req, res) => res.json(getSourcingDesk()));
// Live news search via the Bing-grounded Foundry agent (seed fallback on failure).
api.post('/news/find-more', async (req, res) => {
  try {
    const out = await searchMoreNews({ focus: req.body?.focus });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'news search failed', detail: String(err?.message || err) });
  }
});
api.post('/news/findings/:id/catalyst', (req, res) => {
  const out = setFindingCatalyst(req.params.id, req.body?.catalyst);
  if (!out) return res.status(400).json({ error: 'unknown finding or catalyst' });
  res.json(out);
});
// Live Morningstar quality check for a desk company (real MCP; graceful fallback).
api.post('/news/companies/:id/quality', async (req, res) => {
  try {
    const out = await runMorningstarQuality(req.params.id);
    if (!out) return res.status(404).json({ error: 'unknown company' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'quality check failed', detail: String(err?.message || err) });
  }
});
// Live SEC EDGAR filings pull for a desk company (real, free; private → none).
api.post('/news/companies/:id/filings', async (req, res) => {
  try {
    const out = await runFilings(req.params.id);
    if (!out) return res.status(404).json({ error: 'unknown company' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'filings pull failed', detail: String(err?.message || err) });
  }
});
// Discovery scan: recent US private-company Reg D private placements (Form D).
api.post('/news/scan-formd', async (req, res) => {
  try {
    const out = await scanFormDTargets(req.body || {});
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Form D scan failed', detail: String(err?.message || err) });
  }
});

// O1 · Deal Sourcing — Analyst reports (thesis context per discovered company)
api.get('/research', (_req, res) => res.json(getAnalystResearch()));

// O1 · Deal Sourcing — Sourcing framework (fund GATE · themes GUIDE · screens RANK)
api.get('/framework', (_req, res) => res.json(getFramework()));
api.get('/targets/scored', (_req, res) => res.json(getScoredTargets()));

// Expandable ranked-target detail: real SEC filings + Morningstar quality (if
// public) + a generated analyst report. Works for desk and CxO-signal targets.
api.post('/targets/:id/detail', async (req, res) => {
  try {
    const detail = await getTargetDetail(req.params.id, { force: !!req.body?.force });
    if (!detail) return res.status(404).json({ error: 'target not found' });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: 'target detail failed', detail: String(err?.message || err) });
  }
});

// Retry ONLY the Morningstar quality pull for a target (in-panel retry button).
// Transient MCP "fetch failed" errors are retried inside the pull; this re-runs
// it on demand and refreshes the cached detail.
api.post('/targets/:id/quality', async (req, res) => {
  try {
    const out = await retryTargetQuality(req.params.id);
    if (!out) return res.status(404).json({ error: 'target not found' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'quality retry failed', detail: String(err?.message || err) });
  }
});

// Pull the ENTIRE filing down (every document in the EDGAR accession) and save
// it to the deal room's own blob store, returning a manifest of saved objects.
api.post('/targets/:id/filings/:filingId/save', async (req, res) => {
  try {
    const out = await saveFilingArchive(req.params.id, req.params.filingId);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'filing save failed', detail: String(err?.message || err) });
  }
});

// Known saved-filing manifest for a target's filing (in-memory; blobs persist).
api.get('/targets/:id/filings/:filingId/saved', (req, res) => {
  const m = getSavedFilingManifest(req.params.id, req.params.filingId);
  if (!m) return res.status(404).json({ error: 'not saved' });
  res.json({ targetId: req.params.id, filingId: req.params.filingId, ...m });
});

// Stream a saved filing document back from our own store (path is allow-listed).
api.get('/filings/download', async (req, res) => {
  try {
    const blobPath = String(req.query.path || '');
    const file = await getSavedFilingFile(blobPath);
    if (!file) return res.status(404).json({ error: 'file not found' });
    const name = String(req.query.name || blobPath.split('/').pop() || 'filing');
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.send(file.buffer);
  } catch (err) {
    res.status(500).json({ error: 'download failed', detail: String(err?.message || err) });
  }
});

// ---- Fabric OneLake filing archive (Files/Filings) --------------------------
// Auto-download a sourced deal's SEC filings and write them into the Fabric
// lakehouse's Files/Filings folder. Honest status + explicit errors (the app's
// managed identity must hold a workspace role that permits OneLake writes).
api.get('/onelake', async (_req, res) => res.json(await oneLakeProbe()));
api.get('/onelake/filings', async (req, res) => {
  const files = await listOneLakeFilings(String(req.query.subfolder || ''));
  res.json({ path: oneLakeStatus().filingsPath, count: files.length, files });
});
api.post('/deals/:id/filings/onelake', async (req, res) => {
  try {
    const out = await archiveDealFilingsToOneLake(req.params.id, { limit: Number(req.body?.limit) || 4 });
    if (out.error === 'not-found') return res.status(404).json(out);
    if (out.error === 'onelake-not-configured') return res.status(503).json(out);
    if (out.error) return res.status(502).json(out); // edgar/onelake write failure — surfaced, not hidden
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'onelake-archive-failed', detail: String(err?.message || err) });
  }
});
api.post('/filings/onelake/backfill', async (req, res) => {
  try {
    const out = await backfillOneLakeFilings({ limit: Number(req.body?.limit) || 3 });
    if (out.error) return res.status(503).json(out);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'onelake-backfill-failed', detail: String(err?.message || err) });
  }
});

api.post('/screens/:id/select', (req, res) => {
  const s = setScreenSelected(req.params.id, req.body?.selected);
  if (!s) return res.status(404).json({ error: 'screen not found' });
  res.json(s);
});

api.post('/themes/:id/select', (req, res) => {
  const r = setThemeSelected(req.params.id, req.body?.selected);
  res.json(r);
});

api.patch('/screens/:id', (req, res) => {
  const r = updateScreen(req.params.id, req.body || {});
  if (r.error === 'not-found') return res.status(404).json({ error: 'screen not found' });
  if (r.error === 'invalid') return res.status(422).json({ error: 'invalid', errors: r.errors, warnings: r.warnings });
  res.json(r);
});

api.post('/screens', (req, res) => {
  const r = createScreen(req.body || {});
  if (r.error === 'invalid') return res.status(422).json({ error: 'invalid', errors: r.errors, warnings: r.warnings });
  res.status(201).json(r);
});

api.get('/deals/:id', (req, res) => {
  const deal = getDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: 'deal not found' });
  res.json(deal);
});

api.get('/sourcing', (_req, res) => res.json(listSourcing()));

api.post('/sourcing/:id/promote', (req, res) => {
  const item = promoteSourcing(req.params.id);
  if (!item) return res.status(404).json({ error: 'signal not found' });
  res.json(item);
});

api.post('/deals/:id/actions/:actionId', async (req, res) => {
  const deal = getDealRaw(req.params.id);
  if (!deal) return res.status(404).json({ error: 'deal not found' });
  const persona = personaById[req.body?.personaId];
  if (!persona) return res.status(400).json({ error: 'unknown persona' });
  const action = persona.actions.find((a) => a.id === req.params.actionId);
  if (!action) return res.status(400).json({ error: 'unknown action for persona' });
  try {
    const result = await runAction({ deal, persona, action });
    res.json({ result, deal: getDeal(deal.id) });
  } catch (err) {
    res.status(500).json({ error: 'action failed', detail: String(err?.message || err) });
  }
});

api.post('/deals/:id/chat', async (req, res) => {
  const deal = getDealRaw(req.params.id);
  if (!deal) return res.status(404).json({ error: 'deal not found' });
  const persona = personaById[req.body?.personaId] || getPersonas()[0];
  const message = (req.body?.message || '').toString().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const out = await chat({ deal, persona, message });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'chat failed', detail: String(err?.message || err) });
  }
});

// Deal Room Analyst — the Foundry agent with access to ALL deals.
api.get('/deal-agent', (_req, res) => res.json(dealAgentInfo()));

// The 5 persona agents (analyst, partner, retail-md, ai-md, supply-md).
api.get('/persona-agents', (_req, res) => res.json(personaAgentsInfo()));
// Chat with a specific persona agent. It reads the pipeline and ACTS on it through
// its persona-scoped tools (server-side persona authorization enforced on writes).
// Body: { message, dealId?, previousResponseId? }.
api.post('/persona-agents/:persona/chat', async (req, res) => {
  const message = (req.body?.message || '').toString().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message required' });
  const dealId = req.body?.dealId ? String(req.body.dealId) : undefined;
  const previousResponseId = req.body?.previousResponseId ? String(req.body.previousResponseId) : undefined;
  // ---- RBAC (requesting user) ----
  const identity = requestingIdentity(req);
  const access = accessFor(identity);
  if (dealId) {
    const d = getDeal(dealId);
    const gate = authorizeDealAccess(identity, d?.stage || d?.stageName);
    if (!gate.ok) return res.status(403).json({ reply: gate.reason, denied: true, role: access.role });
  }
  // Read-only users (analyst / member roles) never reach the write-capable persona
  // agents — answer via the read-only deal analyst instead.
  if (!access.canWrite) {
    try {
      const out = await chatDealAgent({ message, dealId, scope: dealId ? 'deal' : 'portfolio' });
      return res.json({ ...out, role: access.role, readOnly: true });
    } catch (err) {
      return res.status(500).json({ error: 'chat failed', detail: String(err?.message || err) });
    }
  }
  // Authorise the requested persona for this user (downgrade to analyst if not).
  const authz = authorizePersona(identity, req.params.persona);
  if (!authz.ok) {
    try {
      const out = await chatDealAgent({ message, dealId, scope: dealId ? 'deal' : 'portfolio' });
      return res.json({ reply: `${authz.reason}\n\n${out.reply || ''}`.trim(), downgraded: true, role: access.role });
    } catch (err) {
      return res.status(500).json({ error: 'chat failed', detail: String(err?.message || err) });
    }
  }
  try {
    const out = await chatPersonaAgent({ persona: authz.persona, message, dealId, previousResponseId });
    if (out?.error) return res.status(400).json(out);
    res.json({ ...out, role: access.role });
  } catch (err) {
    res.status(500).json({ error: 'persona-agent chat failed', detail: String(err?.message || err) });
  }
});

// Portfolio-wide or single-deal-scoped chat with the analyst agent.
// Body: { message, dealId?, scope? ('portfolio'|'deal'), previousResponseId? }.
// Pass a dealId (or scope:'deal') to LOCK the conversation to one deal.
api.post('/deal-agent/chat', async (req, res) => {
  const message = (req.body?.message || '').toString().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message required' });
  const dealId = req.body?.dealId ? String(req.body.dealId) : undefined;
  const scope = req.body?.scope === 'deal' || req.body?.scope === 'portfolio' ? req.body.scope : undefined;
  const previousResponseId = req.body?.previousResponseId ? String(req.body.previousResponseId) : undefined;
  // ---- RBAC: gate Stage-2 deal access by the requesting user's role ----
  const identity = requestingIdentity(req);
  if (dealId) {
    const d = getDeal(dealId);
    const gate = authorizeDealAccess(identity, d?.stage || d?.stageName);
    if (!gate.ok) return res.status(403).json({ reply: gate.reason, denied: true, role: gate.access.role });
  }
  try {
    const out = await chatDealAgent({ message, dealId, scope, previousResponseId });
    if (out?.error) return res.status(400).json(out);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'deal-agent chat failed', detail: String(err?.message || err) });
  }
});

api.post('/deals/:id/steps/:stepKey/run', async (req, res) => {
  try {
    const out = await runStep(req.params.id, req.params.stepKey);
    if (!out) return res.status(404).json({ error: 'deal or step not found' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'step run failed', detail: String(err?.message || err) });
  }
});

api.post('/deals/:id/advance', async (req, res) => {
  const { overrideReason } = req.body || {};
  const r = await advanceDeal(req.params.id, { overrideReason });
  if (r && r.error === 'not-found') return res.status(404).json({ error: 'deal not found' });
  if (r && r.error) return res.status(409).json(r); // ic-not-ready / override-forbidden
  res.json(r);
});

// Stage-2 deal artifact — the real PE deliverable for a diligence step:
// D1 Diligence Plan · D2 Findings/Red-Flag Report · D3 Final IC Memo ·
// D4 Execution Pack · D5 Close-out & 100-Day Plan.
api.post('/deals/:id/artifact/:step', async (req, res) => {
  try {
    const out = await getDealArtifact(req.params.id, req.params.step, { force: !!req.body?.force });
    if (!out) return res.status(404).json({ error: 'deal not found' });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'deal artifact failed', detail: String(err?.message || err) });
  }
});

api.post('/deals/:id/back', async (req, res) => {
  const deal = await regressDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: 'deal not found' });
  res.json(deal);
});

app.use('/api', api);

// ---- Deal MCP server (for Copilot Studio) ----
// Entra-guarded, separate from the anonymous /api and SPA. Streamable HTTP over POST;
// GET/DELETE aren't used in stateless mode. The auth middleware enforces Entra on
// access to this endpoint only — the rest of the app stays anonymous by design.
app.post('/mcp', mcpAuthMiddleware, dealMcpHandler);
app.get('/mcp', mcpAuthMiddleware, dealMcpMethodNotAllowed);
app.delete('/mcp', mcpAuthMiddleware, dealMcpMethodNotAllowed);

// Read-only MCP surface for Foundry-hosted agents (published to Teams). Authenticated
// by a static read-only key (or a valid Entra token); exposes ONLY the read tools so
// a hosted agent can research the pipeline but never mutate it. This is what lets the
// persona agents work through the Teams channel, where Foundry executes the MCP tool
// server-side and there is no client to run the app's function-tool loop.
app.post('/mcp-ro', mcpReadonlyAuthMiddleware, dealMcpReadonlyHandler);
app.get('/mcp-ro', mcpReadonlyAuthMiddleware, dealMcpMethodNotAllowed);
app.delete('/mcp-ro', mcpReadonlyAuthMiddleware, dealMcpMethodNotAllowed);

// ---- Static client ----
const clientDist = join(__dirname, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(200)
      .send('<h1>The Deal Room API</h1><p>Client not built yet. Run <code>npm run build:client</code>.</p>')
  );
}

const port = config.server.port;

// Rehydrate persisted state from Cosmos before accepting traffic (P1/P5).
hydrate()
  .then((h) => console.log(`Datastore: ${h.mode} — ${h.companies ?? 0} companies, ${h.deals ?? 0} deals, ${h.signals ?? 0} signals`))
  .catch((e) => console.log(`Datastore init issue: ${String(e?.message || e)}`))
  .finally(() => {
    app.listen(port, () => {
      const info = getModelInfo();
      console.log(`The Deal Room listening on :${port} — AI mode: ${info.mode} (${info.model})`);
    });
  });
