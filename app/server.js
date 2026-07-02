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
  setFindingCatalyst,
  testSource,
  getAnalystResearch,
  getFramework,
  setScreenSelected,
  setThemeSelected,
  updateScreen,
  createScreen,
  getScoredTargets,
  getPipelineFunnel,
  getGateTargets,
  pursueTarget,
  launchDeal,
  getMdOptions,
  assignSwimlane,
  cycleChecklistItem,
  advanceDeal,
  regressDeal,
  runStep,
  portfolioStats
} from './lib/store.js';
import { personaById } from './data/personas.js';
import { runAction, chat } from './lib/agents.js';
import { getModelInfo } from './lib/ai.js';
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
    appName: 'The Deal Room'
  });
});

api.get('/personas', (_req, res) => res.json(getPersonas()));
api.get('/stages', (_req, res) => res.json(getStages()));
api.get('/flow', (_req, res) => res.json(getFlow()));
api.get('/deals', (_req, res) => res.json(listDeals()));
api.get('/analytics', (_req, res) => res.json(portfolioStats()));
api.get('/pipeline', (_req, res) => res.json(getPipelineFunnel()));

// O4 · Screening Gate — gate-ready targets + PURSUE decision
api.get('/gate/targets', (_req, res) => res.json(getGateTargets()));
api.post('/gate/pursue', (req, res) => {
  const r = pursueTarget(req.body?.targetId);
  if (r.error) return res.status(r.error === 'already-pursued' ? 409 : 404).json(r);
  res.status(201).json(r.deal);
});

// D1 · Launch Orchestration — workspace provisioning + swimlane / checklist ops
api.get('/md-options', (_req, res) => res.json(getMdOptions()));
api.post('/deals/:id/launch', (req, res) => {
  const r = launchDeal(req.params.id);
  if (r.error) return res.status(r.error === 'not-found' ? 404 : 409).json(r);
  res.json(r.deal);
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

// O1 · Deal Sourcing — News & filings desk
api.get('/news/desk', (_req, res) => res.json(getSourcingDesk()));
api.post('/news/find-more', (_req, res) => res.json(findMoreNews()));
api.post('/news/findings/:id/catalyst', (req, res) => {
  const out = setFindingCatalyst(req.params.id, req.body?.catalyst);
  if (!out) return res.status(400).json({ error: 'unknown finding or catalyst' });
  res.json(out);
});
api.post('/news/sources/:id/test', (req, res) => {
  const out = testSource(req.params.id);
  if (!out) return res.status(404).json({ error: 'unknown source' });
  res.json(out);
});

// O1 · Deal Sourcing — Analyst reports (thesis context per discovered company)
api.get('/research', (_req, res) => res.json(getAnalystResearch()));

// O1 · Deal Sourcing — Sourcing framework (fund GATE · themes GUIDE · screens RANK)
api.get('/framework', (_req, res) => res.json(getFramework()));
api.get('/targets/scored', (_req, res) => res.json(getScoredTargets()));

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

api.post('/deals/:id/back', (req, res) => {
  const deal = regressDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: 'deal not found' });
  res.json(deal);
});

app.use('/api', api);

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
app.listen(port, () => {
  const info = getModelInfo();
  console.log(`The Deal Room listening on :${port} — AI mode: ${info.mode} (${info.model})`);
});
