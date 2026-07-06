// Reverse proxy to the shared Deal Room backend — enforces ONE data source.
//
// Every /api/* (and /mcp) call the tab makes is forwarded here to the shared
// backend so the Teams interface never holds its own copy of deal data. An
// optional per-user bearer token (from SSO/OBO) can be attached upstream.

import { config, isBackendLive } from './config.js';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

export async function proxyToBackend(req, res) {
  if (!isBackendLive()) {
    return res.status(502).json({
      error: 'shared-backend-not-configured',
      hint: 'Set SHARED_BACKEND_URL to the Deal Room backend (e.g. the ca-dealhub-orch Container App).',
    });
  }

  const target = `${config.backend.url}${req.originalUrl}`;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }

  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }

  try {
    const upstream = await fetch(target, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'backend-unreachable', detail: String(e?.message || e) });
  }
}
