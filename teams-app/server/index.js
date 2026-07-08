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
import { personaForUser, stageAccessFor, DEMO_USERS } from './sharedLib.js';
import { initBot } from './bot.js';
import { postDealEvent } from './notifications.js';
import { siteProxy, TEAMS_BOOTSTRAP_JS, TEAMS_CONFIG_HTML } from './siteProxy.js';
import { startEventPoller } from './eventPoller.js';
void siteProxy; // dashboard is now opened via a link; kept for optional embedding

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
    backendUrl: config.backend.url || null,
    sso: isSsoConfigured(),
    bot: isBotConfigured(),
  })
);

// Per-user context: Teams SSO token -> identity -> Deal Room persona + stage access.
app.post('/api/teams/context', async (req, res) => {
  const ssoToken = req.body?.ssoToken || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const identity = identityFromSsoToken(ssoToken);
  const asOverride = String(req.body?.as || '').trim(); // demo "view as" (no SSO)
  const persona = await personaForUser(identity || {});
  const access = stageAccessFor(asOverride || identity?.upn || '');
  let graphLinked = false;
  try {
    graphLinked = !!(await exchangeOnBehalfOf(ssoToken));
  } catch {
    graphLinked = false;
  }
  res.json({
    identity, persona, graphLinked,
    role: access.role, canViewStage2: access.canViewStage2,
    viewingAs: asOverride || identity?.upn || null,
    demoUsers: DEMO_USERS,
  });
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

// Teams bootstrap injected into the embedded dashboard (theme sync + SSO notify).
app.get('/teams-bootstrap.js', (_req, res) => {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.send(TEAMS_BOOTSTRAP_JS);
});

// Channel-tab configuration page (required to add the tab to a channel).
app.get('/config', (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(TEAMS_CONFIG_HTML);
});

// The Channel/personal Tab is the NATIVE agent console (tab/dist). It talks to the
// shared backend through this origin's /api proxy (single data source). The full
// web dashboard remains one click away via the "Full dashboard" link in the tab.
const tabDist = join(__dirname, '..', 'tab', 'dist');
if (existsSync(tabDist)) {
  app.use(express.static(tabDist));
  app.get('*', (_req, res) => res.sendFile(join(tabDist, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(200)
      .send('<h1>The Deal Room — Teams</h1><p>Run <code>npm run build:tab</code> to build the native agent console.</p>')
  );
}

const port = config.server.port;
app.listen(port, () => {
  console.log(`Deal Room Teams app listening on :${port} — mode: ${isDemoMode() ? 'demo' : 'live'}`);
  if (startEventPoller()) console.log('[teams] deal-event notifier active (polling shared backend signals).');
});
