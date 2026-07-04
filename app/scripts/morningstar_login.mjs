// One-time interactive OAuth login for the Morningstar MCP server.
//
// Runs authorization_code + PKCE in your browser, captures the redirect,
// exchanges the code for tokens, and stores the refresh_token so the Deal Room
// backend can call Morningstar's MCP headlessly (see lib/mcp/oauth.js /
// lib/mcp/morningstar.js). Morningstar exposes no password grant, so this
// interactive step is required exactly once (tokens then refresh automatically).
//
// Usage:
//   node scripts/morningstar_login.mjs
//   node scripts/morningstar_login.mjs --mcp-url https://mcp.morningstar.com/mcp
//
// A pre-registered client can be supplied via MORNINGSTAR_CLIENT_ID /
// MORNINGSTAR_CLIENT_SECRET; otherwise the script self-registers one (RFC 7591).

import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  discover, registerClient, pkcePair, buildAuthorizationUrl, exchangeCode, saveTokens, hasLogin, loadTokens
} from '../lib/mcp/oauth.js';

const PROVIDER = 'morningstar';
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const CLIENT_NAME = 'The Deal Room — Morningstar Research';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const MCP_URL = arg('--mcp-url') || process.env.MORNINGSTAR_MCP_URL || 'https://mcp.morningstar.com/mcp';

function openBrowser(url) {
  // Best-effort; the URL is also printed so the user can open it manually.
  //
  // Robustness note: on Windows, `cmd /c start <url>` truncates the URL at the
  // first `&` (cmd treats it as a command separator), which drops client_id and
  // code_challenge and yields "invalid_request: Field required". To be immune to
  // any command-line parsing, we DON'T put the URL on a command line at all —
  // we write it into a tiny local HTML file that redirects to it, and open that
  // file with the default handler (the file path has no `&`). All openers below
  // are spawned directly (no shell).
  try {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const html =
      '<!doctype html><meta charset="utf-8">' +
      `<meta http-equiv="refresh" content="0;url=${esc(url)}">` +
      '<body style="font-family:sans-serif;padding:2rem">' +
      '<p>Redirecting to the Morningstar sign-in\u2026</p>' +
      `<p>If nothing happens, <a href="${esc(url)}">click here to continue</a>.</p></body>`;
    const file = path.join(os.tmpdir(), `dealroom-morningstar-login-${Date.now()}.html`);
    fs.writeFileSync(file, html, 'utf8');
    if (process.platform === 'win32') spawn('explorer.exe', [file], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* ignore — the URL is printed for manual open */ }
}

function waitForCode(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font-family:sans-serif"><h3>Login complete.</h3><p>You can close this tab and return to the terminal.</p></body></html>');
      server.close();
      if (!code) return reject(new Error('No authorization code received.'));
      if (state !== expectedState) return reject(new Error('State mismatch — possible CSRF; aborting.'));
      resolve(code);
    });
    server.on('error', reject);
    server.listen(REDIRECT_PORT, 'localhost');
  });
}

async function main() {
  if (hasLogin(PROVIDER)) {
    const rec = loadTokens(PROVIDER);
    console.log(`A stored login already exists for '${PROVIDER}' (client ${rec.client_id}). Re-running will overwrite it.`);
  }

  console.log(`Discovering OAuth metadata for ${PROVIDER} (${MCP_URL})...`);
  const meta = await discover(MCP_URL);
  console.log('  authorization:', meta.authorizationEndpoint);
  console.log('  token:        ', meta.tokenEndpoint);

  let clientId = process.env.MORNINGSTAR_CLIENT_ID || null;
  let clientSecret = process.env.MORNINGSTAR_CLIENT_SECRET || null;
  if (clientId) {
    console.log('Using pre-registered client_id:', clientId);
  } else {
    console.log('Registering client (dynamic)...');
    ({ clientId, clientSecret } = await registerClient(meta, REDIRECT_URI, CLIENT_NAME));
    console.log('  client_id:', clientId);
  }

  const { verifier, challenge } = pkcePair();
  const state = crypto.randomBytes(16).toString('hex');
  const scope = meta.scopesSupported.join(' ');
  const authUrl = buildAuthorizationUrl(meta, clientId, REDIRECT_URI, scope, state, challenge);

  console.log('\nOpening your browser to sign in with your Morningstar credentials.');
  console.log('If it does not open, paste this URL into your browser:\n');
  console.log(authUrl, '\n');
  const codePromise = waitForCode(state);
  openBrowser(authUrl);
  console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`);
  const code = await codePromise;

  console.log('Exchanging authorization code for tokens...');
  const tok = await exchangeCode(meta, clientId, clientSecret, code, REDIRECT_URI, verifier);
  if (!tok.refresh_token) {
    console.warn('WARNING: no refresh_token returned — headless refresh will not be possible. Ensure offline_access was granted.');
  }

  saveTokens(PROVIDER, {
    provider: PROVIDER,
    mcp_url: MCP_URL,
    token_endpoint: meta.tokenEndpoint,
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tok.refresh_token || null,
    access_token: tok.access_token || null,
    expires_at: Date.now() / 1000 + Number(tok.expires_in || 3600),
    scope: tok.scope || scope
  });
  console.log(`\nDone. Stored tokens for '${PROVIDER}'. The backend can now call it headlessly.`);
  console.log('Verify with:  node scripts/morningstar_verify.mjs');
}

main().catch((e) => { console.error('\nLogin failed:', e.message); process.exit(1); });
