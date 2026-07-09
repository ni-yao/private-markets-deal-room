// Central configuration for the Teams app — the SINGLE place env is read.
//
// The Teams app owns NO data. It is a thin interface (SSO/OBO, tab hosting, bot)
// that forwards to the shared Deal Room backend (SHARED_BACKEND_URL). Demo mode
// (no SHARED_BACKEND_URL) still boots so the tab and manifest can be developed.

const env = process.env;

const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const trimUrl = (v, d = '') => str(v, d).replace(/\/$/, '');

export const config = Object.freeze({
  server: {
    port: int(env.PORT, 8090),
    appBaseUrl: trimUrl(env.APP_BASE_URL, ''),
  },
  // The single source of truth — every data read/write forwards here.
  backend: {
    url: trimUrl(env.SHARED_BACKEND_URL, ''),
  },
  entra: {
    tenantId: str(env.ENTRA_TENANT_ID, '').trim(),
    tabClientId: str(env.TEAMS_TAB_CLIENT_ID, '').trim(),
    tabClientSecret: str(env.TEAMS_TAB_CLIENT_SECRET, ''),
  },
  bot: {
    appId: str(env.BOT_APP_ID, '').trim(),
    appPassword: str(env.BOT_APP_PASSWORD, ''),
    appType: str(env.BOT_APP_TYPE, 'MultiTenant'),
    tenantId: str(env.ENTRA_TENANT_ID, '').trim(),
  },
  mcp: {
    host: str(env.MCP_HOST, '').trim(),
  },
  // Interface-level hardening (safe-by-default). See server/index.js.
  security: {
    // Shared secret required to call POST /internal/notify. When empty, the
    // endpoint is only allowed in demo mode and is disabled once a live backend
    // is configured (fails closed — see index.js).
    internalNotifySecret: str(env.INTERNAL_NOTIFY_SECRET, ''),
    // Honour the demo "view as" (?as / body.as) identity override. Off by
    // default in a live deployment so callers cannot spoof role/persona; the
    // override is always allowed in demo mode for local development.
    allowIdentityOverride: /^(1|true|yes)$/i.test(str(env.DEMO_IDENTITY_OVERRIDE, '')),
  },
});

export const isBackendLive = () => !!config.backend.url;
export const isBotConfigured = () => !!config.bot.appId && !!config.bot.appPassword;
export const isSsoConfigured = () =>
  !!config.entra.tenantId && !!config.entra.tabClientId && !!config.entra.tabClientSecret;
export const isDemoMode = () => !isBackendLive();
// The demo identity override is allowed in demo mode, or when explicitly enabled.
export const isIdentityOverrideAllowed = () => isDemoMode() || config.security.allowIdentityOverride;

export function validateConfig({ log = console } = {}) {
  const notes = [];
  if (isDemoMode()) {
    log.info?.(
      '[teams-config] DEMO mode — SHARED_BACKEND_URL not set; the tab renders but ' +
        'data calls return a hint until the shared backend is wired.'
    );
  } else {
    log.info?.(`[teams-config] shared backend: ${config.backend.url}`);
  }
  if (!isSsoConfigured()) notes.push('SSO not configured (ENTRA_TENANT_ID / TEAMS_TAB_CLIENT_ID / secret) — per-user context disabled.');
  if (!isBotConfigured()) notes.push('Bot not configured (BOT_APP_ID / BOT_APP_PASSWORD) — Adaptive Card notifications disabled.');
  for (const n of notes) log.warn?.(`[teams-config] ${n}`);
  return { demoMode: isDemoMode(), sso: isSsoConfigured(), bot: isBotConfigured(), notes };
}

export default config;
