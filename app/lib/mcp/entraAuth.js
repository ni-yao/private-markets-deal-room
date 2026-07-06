// Entra ID (Azure AD) bearer-token validation for the Deal MCP server.
//
// This guards ONLY the /mcp endpoint — the rest of the app (the SPA and /api/*)
// stays anonymous by design. A Copilot Studio agent connects to /mcp over OAuth 2.0
// (Entra); Copilot Studio obtains a token for this server's app registration and
// sends it as a Bearer token, which we validate here (signature via the tenant's
// JWKS, issuer, audience, tenant, and an optional required scope/role).
//
// Config (env):
//   ENTRA_TENANT_ID       tenant GUID (issuer + JWKS source)                [required to enforce]
//   MCP_AUDIENCE          comma-separated accepted audiences, e.g.
//                         "api://<clientId>,<clientId>"                     [required to enforce]
//   MCP_REQUIRED_SCOPE    optional delegated scope (scp) or app role (roles),
//                         e.g. "deals.read" — if set, the token must carry it
//   MCP_AUTH_DISABLED     "true" to bypass validation (LOCAL DEV ONLY)
//
// Fail-closed: if auth isn't explicitly disabled and the tenant/audience aren't
// configured, the endpoint returns 503 rather than serving deals unauthenticated.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

const TENANT_ID = config.mcpAuth.tenantId;
const AUDIENCES = config.mcpAuth.audiences;
const REQUIRED_SCOPE = config.mcpAuth.requiredScope;
const DISABLED = config.mcpAuth.disabled;

const ISSUERS = TENANT_ID
  ? [
      `https://login.microsoftonline.com/${TENANT_ID}/v2.0`, // v2 tokens
      `https://sts.windows.net/${TENANT_ID}/` // v1 tokens
    ]
  : [];

let jwks = null;
function getJwks() {
  if (!jwks && TENANT_ID) {
    jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));
  }
  return jwks;
}

export function mcpAuthConfigured() {
  return !!(TENANT_ID && AUDIENCES.length);
}

export function mcpAuthInfo() {
  return {
    mode: DISABLED ? 'disabled' : mcpAuthConfigured() ? 'entra' : 'unconfigured',
    tenantConfigured: !!TENANT_ID,
    audienceConfigured: AUDIENCES.length > 0,
    requiredScope: REQUIRED_SCOPE || null
  };
}

function unauthorized(res, detail) {
  res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: `Unauthorized: ${detail}` },
    id: null
  });
}

// Express middleware. On success attaches req.mcpAuth = { sub, appId, scopes, roles }.
export async function mcpAuthMiddleware(req, res, next) {
  if (DISABLED) {
    req.mcpAuth = { mode: 'disabled' };
    return next();
  }
  if (!mcpAuthConfigured()) {
    return res.status(503).json({
      jsonrpc: '2.0',
      error: { code: -32002, message: 'MCP auth not configured (set ENTRA_TENANT_ID and MCP_AUDIENCE).' },
      id: null
    });
  }

  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return unauthorized(res, 'missing Bearer token');
  const token = match[1].trim();

  let payload;
  try {
    ({ payload } = await jwtVerify(token, getJwks(), { issuer: ISSUERS, audience: AUDIENCES }));
  } catch (err) {
    return unauthorized(res, String(err?.code || err?.message || err));
  }

  // Defense in depth: the token's tenant must match the configured tenant.
  if (payload.tid && payload.tid !== TENANT_ID) {
    return unauthorized(res, 'tenant mismatch');
  }

  // Optional scope/role gate. Delegated tokens carry `scp` (space-delimited);
  // app-only tokens carry `roles` (array).
  if (REQUIRED_SCOPE) {
    const scopes = typeof payload.scp === 'string' ? payload.scp.split(' ') : [];
    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    if (!scopes.includes(REQUIRED_SCOPE) && !roles.includes(REQUIRED_SCOPE)) {
      res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${REQUIRED_SCOPE}"`);
      return res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32003, message: `Forbidden: token missing required scope/role "${REQUIRED_SCOPE}".` },
        id: null
      });
    }
  }

  req.mcpAuth = {
    mode: 'entra',
    sub: payload.sub,
    appId: payload.appid || payload.azp || null,
    name: payload.name || payload.preferred_username || null,
    scopes: typeof payload.scp === 'string' ? payload.scp.split(' ') : [],
    roles: Array.isArray(payload.roles) ? payload.roles : []
  };
  return next();
}
