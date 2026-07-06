// The Deal Room — Teams app server.
//
// A THIN interface over the shared Deal Room backend (single data source):
//   • serves the Channel Tab bundle (tab/dist),
//   • exposes per-user context (Teams SSO -> OBO -> persona),
//   • hosts the bot messaging endpoint for Adaptive Card notifications, and
//   • forwards every other /api/* call to the shared backend.
// No deal data is stored here.

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { config, validateConfig, isBackendLive, isSsoConfigured, isBotConfigured, isDemoMode } from './config.js';
import { proxyToBackend } from './proxy.js';
import { exchangeOnBehalfOf, identityFromSsoToken } from './sso.js';
import { personaForUser } from './sharedLib.js';
import { initBot } from './bot.js';
import { postDealEvent } from './notifications.js';

validateConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Teams app status (interface-level; data status comes from the shared backend).
app.get('/api/teams/config', (_req, res) =>
  res.json({
    app: 'deal-room-teams',
    demoMode: isDemoMode(),
    backend: isBackendLive() ? 'configured' : 'demo',
    sso: isSsoConfigured(),
    bot: isBotConfigured(),
  })
);

// Per-user context: Teams SSO token -> identity -> Deal Room persona.
app.post('/api/teams/context', async (req, res) => {
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = identityFromSsoToken(ssoToken);
  const persona = await personaForUser(identity || {});
  let graphLinked = false;
  try {
    graphLinked = !!(await exchangeOnBehalfOf(ssoToken));
  } catch {
    graphLinked = false;
  }
  res.json({ identity, persona, graphLinked });
});

// Internal seam to post a notification card (Phase 2 / testing).
app.post('/internal/notify', async (req, res) => {
  const result = await postDealEvent(req.body || {});
  res.json(result);
});

// Bot messaging endpoint (Adaptive Card notifications).
app.post('/api/messages', async (req, res) => {
  const b = await initBot();
  if (!b) return res.status(200).json({ note: 'bot-not-configured' });
  await b.adapter.process(req, res, (context) => b.botHandler.run(context));
});

// Everything else under /api forwards to the shared backend (single data source).
app.use('/api', proxyToBackend);

// Serve the built tab with SPA fallback.
const tabDist = join(__dirname, '..', 'tab', 'dist');
if (existsSync(tabDist)) {
  app.use(express.static(tabDist));
  app.get('*', (_req, res) => res.sendFile(join(tabDist, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(200)
      .send('<h1>The Deal Room — Teams</h1><p>Tab not built yet. Run <code>npm run build:tab</code>.</p>')
  );
}

const port = config.server.port;
app.listen(port, () => console.log(`Deal Room Teams app listening on :${port} — mode: ${isDemoMode() ? 'demo' : 'live'}`));
