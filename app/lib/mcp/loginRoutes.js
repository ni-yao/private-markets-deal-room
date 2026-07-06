// In-app OAuth login for provider MCP servers (Morningstar, LSEG, Moody's).
//
// Lets a user connect a data source from the website — no terminal script. The
// browser is redirected through the provider's own sign-in (authorization_code
// + PKCE); the callback exchanges the code and stores the refresh_token
// server-side (Cosmos + disk via lib/mcp/oauth). The refresh_token never
// reaches the browser. Because providers support dynamic client registration,
// we register a client per (provider, redirect-uri) on the fly.
//
// Routes (mounted at /api/connectors):
//   GET /:provider/login     -> 302 to the provider authorize page
//   GET /:provider/callback  -> exchange code, store tokens, 302 back to the app

import express from 'express';
import crypto from 'node:crypto';
import {
  discover, registerClient, pkcePair, buildAuthorizationUrl, exchangeCode, saveTokens, OAuthError
} from './oauth.js';
import { mcpProviderConfig } from '../connectors.js';
import { config } from '../config.js';

const router = express.Router();

// Pending authorizations keyed by state (short-lived, single-replica app).
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;
function reap() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_TTL_MS) pending.delete(k);
}

// Cache dynamically-registered clients per (provider|redirectUri) within the process.
const clients = new Map();

function baseUrl(req) {
  if (config.server.appBaseUrl) return config.server.appBaseUrl;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function safeReturn(to) {
  // Only allow app-relative return paths (prevent open redirects).
  return typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') ? to : '/';
}

router.get('/:provider/login', async (req, res) => {
  const cfg = mcpProviderConfig(req.params.provider);
  if (!cfg) return res.status(404).send('Unknown connector.');
  const returnTo = safeReturn(req.query.returnTo);
  try {
    const redirectUri = `${baseUrl(req)}/api/connectors/${cfg.provider}/callback`;
    const meta = await discover(cfg.mcpUrl);

    const clientKey = `${cfg.provider}|${redirectUri}`;
    let client = clients.get(clientKey);
    if (!client) {
      // Some providers (LSEG, Moody's) don't allow open dynamic registration —
      // they require a client pre-registered with the vendor, with our callback
      // URL allow-listed. Use <PROVIDER>_CLIENT_ID/_SECRET when provided; else
      // attempt RFC 7591 dynamic registration (works for Morningstar).
      const envId = process.env[`${cfg.provider.toUpperCase()}_CLIENT_ID`];
      if (envId) {
        client = { clientId: envId, clientSecret: process.env[`${cfg.provider.toUpperCase()}_CLIENT_SECRET`] || null };
      } else {
        try {
          client = await registerClient(meta, redirectUri, 'The Deal Room');
        } catch (regErr) {
          const up = cfg.provider.toUpperCase();
          const providerMsg = String(regErr?.message || regErr).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
          return res.status(400).type('text/plain').send(
            `${cfg.name} does not allow open sign-in registration. It needs a client pre-registered ` +
            `with ${cfg.name} whose redirect URI is:\n\n    ${redirectUri}\n\n` +
            `Then set ${up}_CLIENT_ID (and ${up}_CLIENT_SECRET if issued) and reconnect.\n\n` +
            `Provider said: ${providerMsg}`
          );
        }
      }
      clients.set(clientKey, client);
    }

    const { verifier, challenge } = pkcePair();
    const state = crypto.randomBytes(16).toString('hex');
    const scope = meta.scopesSupported.join(' ');
    reap();
    pending.set(state, {
      provider: cfg.provider, verifier, redirectUri, returnTo,
      clientId: client.clientId, clientSecret: client.clientSecret,
      tokenEndpoint: meta.tokenEndpoint, mcpUrl: cfg.mcpUrl, scope, at: Date.now()
    });

    res.redirect(buildAuthorizationUrl(meta, client.clientId, redirectUri, scope, state, challenge));
  } catch (err) {
    const msg = err instanceof OAuthError ? err.message : String(err?.message || err);
    res.status(502).type('text/plain').send(`Could not start ${cfg.name} sign-in: ${msg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
  }
});

router.get('/:provider/callback', async (req, res) => {
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
    const meta = { tokenEndpoint: p.tokenEndpoint };
    const tok = await exchangeCode(meta, p.clientId, p.clientSecret, String(code), p.redirectUri, p.verifier);
    saveTokens(p.provider, {
      provider: p.provider,
      mcp_url: p.mcpUrl,
      token_endpoint: p.tokenEndpoint,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      refresh_token: tok.refresh_token || null,
      access_token: tok.access_token || null,
      expires_at: Date.now() / 1000 + Number(tok.expires_in || 3600),
      scope: tok.scope || p.scope
    });
    res.redirect(`${safeReturn(p.returnTo)}?connected=${encodeURIComponent(p.provider)}`);
  } catch (err) {
    const msg = err instanceof OAuthError ? err.message : String(err?.message || err);
    res.redirect(`${safeReturn(p.returnTo)}?connect_error=${encodeURIComponent(msg.slice(0, 120))}`);
  }
});

export default router;
