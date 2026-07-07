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
  getPipelineFunnel,
  getStage1Funnel,
  getCohort,
  getPipeline,
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
  getMdOptions,
  assignSwimlane,
  cycleChecklistItem,
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
import { dealMcpHandler, dealMcpMethodNotAllowed, dealMcpInfo } from './lib/mcp/dealServer.js';
import { mcpAuthMiddleware, mcpAuthInfo } from './lib/mcp/entraAuth.js';
import { listConnectors, testConnector, disconnectConnector } from './lib/connectors.js';
import connectorLoginRouter from './lib/mcp/loginRoutes.js';
import m365LoginRouter from './lib/m365/loginRoutes.js';
import { m365Configured, m365Connected, m365FilesScope } from './lib/m365/graph.js';
import { repoMode } from './lib/repo/index.js';
import graphRouter from './lib/graph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

// ---- API ----
const api = express.Router();

api.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Microsoft Graph mailbox change-notifications (O1 Deal-Sourcing signals)
api.use('/graph', graphRouter);

api.get('/config', (_req, res) => {
  const info = getModelInfo();
  res.json({
    ...info,
    region: process.env.DEAL_ROOM_REGION || 'swedencentral',
    appName: 'The Deal Room',
    newsAgent: newsAgentConfigured() ? 'live' : 'demo',
    dealAgent: dealAgentInfo().configured ? 'live' : 'demo',
    dealMcp: { ...dealMcpInfo(), auth: mcpAuthInfo() },
    m365: { configured: m365Configured(), connected: m365Connected(), files: m365FilesScope() },
    morningstar: morningstarReady() ? 'live' : 'demo',
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
api.patch('/deals/:id/swimlanes/:lane', (req, res) => {
  const r = assignSwimlane(req.params.id, req.params.lane, req.body?.md);
  if (r.error) return res.status(r.error === 'invalid-md' ? 422 : 404).json(r);
  res.json(r.deal);
});
api.post('/deals/:id/checklist/:itemId/cycle', (req, res) => {
  const r = cycleChecklistItem(req.params.id, req.params.itemId);
  if (r.error) return res.status(404).json(r);
  res.json(r.deal);
});

// O1 · Deal Sourcing — CxO signals explorer
api.get('/signals/mailbox', (_req, res) => res.json(getMailbox()));
api.get('/signals/companies', (_req, res) => res.json(getSignalCompanies()));
api.get('/signals/companies/:id/crm', (req, res) => {
  const crm = getCrm(req.params.id);
  if (!crm) return res.status(404).json({ error: 'company not found' });
  res.json(crm);
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

// Portfolio-wide or single-deal-scoped chat with the analyst agent.
// Body: { message, dealId?, scope? ('portfolio'|'deal'), previousResponseId? }.
// Pass a dealId (or scope:'deal') to LOCK the conversation to one deal.
api.post('/deal-agent/chat', async (req, res) => {
  const message = (req.body?.message || '').toString().slice(0, 2000);
  if (!message) return res.status(400).json({ error: 'message required' });
  const dealId = req.body?.dealId ? String(req.body.dealId) : undefined;
  const scope = req.body?.scope === 'deal' || req.body?.scope === 'portfolio' ? req.body.scope : undefined;
  const previousResponseId = req.body?.previousResponseId ? String(req.body.previousResponseId) : undefined;
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

api.post('/deals/:id/advance', (req, res) => {
  const deal = advanceDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: 'deal not found' });
  res.json(deal);
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

api.post('/deals/:id/back', (req, res) => {
  const deal = regressDeal(req.params.id);
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

const port = process.env.PORT || 8080;

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
