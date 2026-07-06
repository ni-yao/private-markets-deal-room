// In-app Microsoft 365 (Entra ID) delegated sign-in for The Deal Room.
//
// This is an OPT-IN data-source connector, not an app gate: the dashboard stays
// open (admin UI for pipeline monitoring during development). Connecting M365
// captures a delegated Microsoft Graph refresh token, stored server-side (Cosmos
// + disk via lib/mcp/oauth), which later M365-dependent steps reuse — e.g. the
// Launch Orchestration step provisioning a Teams channel per deal.
//
// Standard OAuth 2.0 authorization_code + PKCE against Microsoft's endpoints,
// confidential client (the app registration's client secret). The refresh token
// never reaches the browser.
//
// Routes (mounted at /api/m365):
//   GET /login     -> 302 to the Microsoft sign-in / consent page
//   GET /callback  -> exchange code, store tokens, 302 back to the app

import express from 'express';
import crypto from 'node:crypto';
import { pkcePair, saveTokens } from '../mcp/oauth.js';
import { config } from '../config.js';

const router = express.Router();

const TENANT = config.m365.tenantId;
const CLIENT_ID = config.m365.clientId;
const CLIENT_SECRET = config.m365.clientSecret;
const AUTHORIZE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
// Delegated Graph scopes: identity + Teams channel provisioning. offline_access
// yields the refresh token used for headless reuse by later steps.
const SCOPE = [
  'offline_access', 'openid', 'profile', 'email',
  'User.Read', 'Team.ReadBasic.All', 'Team.Create', 'Channel.Create', 'ChannelMessage.Send'
].join(' ');

// Pending authorizations keyed by state (short-lived).
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;
function reap() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_TTL_MS) pending.delete(k);
}

function baseUrl(req) {
  if (config.server.appBaseUrl) return config.server.appBaseUrl;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
function safeReturn(to) {
  return typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') ? to : '/';
}

router.get('/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(503).type('text/plain').send(
      'M365 login is not configured. Set M365_CLIENT_ID, M365_CLIENT_SECRET and M365_TENANT_ID on the app.'
    );
  }
  const returnTo = safeReturn(req.query.returnTo);
  const redirectUri = `${baseUrl(req)}/api/m365/callback`;
  const { verifier, challenge } = pkcePair();
  const state = crypto.randomBytes(16).toString('hex');
  reap();
  pending.set(state, { verifier, redirectUri, returnTo, at: Date.now() });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  res.redirect(`${AUTHORIZE}?${params.toString()}`);
});

router.get('/callback', async (req, res) => {
  const { code, state, error, error_description: errDesc } = req.query;
  const p = state && pending.get(state);
  if (error) {
    if (p) pending.delete(state);
    return res.redirect(`${safeReturn(p?.returnTo)}?connect_error=${encodeURIComponent(String(errDesc || error))}`);
  }
  if (!p) return res.status(400).type('text/plain').send('Invalid or expired sign-in state. Please try connecting again.');
  pending.delete(state);
  if (!code) return res.redirect(`${safeReturn(p.returnTo)}?connect_error=missing_code`);

  try {
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: p.redirectUri,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: p.verifier,
      scope: SCOPE
    });
    const resp = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data.toString()
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return res.redirect(`${safeReturn(p.returnTo)}?connect_error=${encodeURIComponent(t.slice(0, 160))}`);
    }
    const tok = await resp.json();
    saveTokens('m365', {
      provider: 'm365',
      token_endpoint: TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tok.refresh_token || null,
      access_token: tok.access_token || null,
      expires_at: Date.now() / 1000 + Number(tok.expires_in || 3600),
      scope: tok.scope || SCOPE
    });
    res.redirect(`${safeReturn(p.returnTo)}?connected=m365`);
  } catch (err) {
    res.redirect(`${safeReturn(p.returnTo)}?connect_error=${encodeURIComponent(String(err?.message || err).slice(0, 120))}`);
  }
});

export default router;
