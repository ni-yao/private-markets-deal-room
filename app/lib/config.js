// Central configuration — the SINGLE place the app reads environment variables.
//
// Every other module imports the typed `config` object from here instead of
// touching `process.env` directly. This gives us:
//   • one documented list of settings (mirrored in app/.env.example),
//   • typed parsing + safe defaults (no scattered `|| 'default'` drift),
//   • a computed demo-mode flag, and
//   • startup validation (fail-fast for hard errors in live mode; warn otherwise).
//
// Demo mode: when neither AZURE_OPENAI_ENDPOINT nor COSMOS_ENDPOINT is set the
// app runs fully on seeded data with deterministic agents and needs no secrets.

const env = process.env;

const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
const bool = (v, d = false) => (v === undefined ? d : String(v).toLowerCase() === 'true');
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const list = (v) =>
  str(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const trimUrl = (v, d = '') => str(v, d).replace(/\/$/, '');

export const config = Object.freeze({
  server: {
    port: int(env.PORT, 8080),
    region: str(env.DEAL_ROOM_REGION, 'swedencentral'),
    appBaseUrl: trimUrl(env.APP_BASE_URL, ''),
  },
  ai: {
    endpoint: trimUrl(env.AZURE_OPENAI_ENDPOINT, ''),
    deployment: str(env.AZURE_OPENAI_DEPLOYMENT, 'gpt-5-mini'),
    apiVersion: str(env.AZURE_OPENAI_API_VERSION, '2024-12-01-preview'),
    apiKey: str(env.AZURE_OPENAI_API_KEY, ''),
  },
  foundry: {
    projectEndpoint: trimUrl(env.FOUNDRY_PROJECT_ENDPOINT, ''),
    dealAgentName: str(env.DEAL_AGENT_NAME, 'deal-room-analyst'),
    dealAgentModel: str(env.DEAL_AGENT_MODEL, 'gpt-5-mini'),
    newsAgentName: str(env.NEWS_AGENT_NAME, 'deal-room-news-scout'),
    newsAgentModel: str(env.NEWS_AGENT_MODEL, 'gpt-5-mini'),
  },
  cosmos: {
    endpoint: str(env.COSMOS_ENDPOINT, ''),
    database: str(env.COSMOS_DATABASE, 'dealroom'),
  },
  contentSafety: {
    // Azure AI Content Safety endpoint. When empty the guard is a no-op
    // (fail-open). threshold is the minimum severity (0-7) that blocks;
    // 6 blocks only egregious content and never trips on business text.
    endpoint: trimUrl(env.CONTENT_SAFETY_ENDPOINT, ''),
    threshold: int(env.CONTENT_SAFETY_THRESHOLD, 6),
  },
  mcpAuth: {
    tenantId: str(env.ENTRA_TENANT_ID, '').trim(),
    audiences: list(env.MCP_AUDIENCE),
    requiredScope: str(env.MCP_REQUIRED_SCOPE, '').trim(),
    disabled: bool(env.MCP_AUTH_DISABLED, false),
    // Static read-only MCP key for hosted callers that can't do Entra OAuth.
    // 'unset' is the inert bicep placeholder and is treated as no key.
    readonlyKey: str(env.MCP_READONLY_KEY, '').trim() === 'unset' ? '' : str(env.MCP_READONLY_KEY, '').trim(),
  },
  graph: {
    clientState: str(env.GRAPH_CLIENT_STATE, ''),
  },
  m365: {
    tenantId: str(env.M365_TENANT_ID, 'organizations'),
    clientId: str(env.M365_CLIENT_ID, ''),
    clientSecret: str(env.M365_CLIENT_SECRET, ''),
    teamName: str(env.M365_TEAM_NAME, 'The Deal Room'),
    teamId: str(env.M365_TEAM_ID, ''),
  },
  connectors: {
    morningstarMcpUrl: str(env.MORNINGSTAR_MCP_URL, 'https://mcp.morningstar.com/mcp'),
    lsegMcpUrl: str(env.LSEG_MCP_URL, 'https://api.analytics.lseg.com/lfa/mcp'),
    moodysMcpUrl: str(env.MOODYS_MCP_URL, 'https://mcp.moodys.com/genai-ready-data/mcp'),
    morningstarClientId: str(env.MORNINGSTAR_CLIENT_ID, ''),
    morningstarClientSecret: str(env.MORNINGSTAR_CLIENT_SECRET, ''),
  },
  filings: {
    secEdgarUserAgent: str(env.SEC_EDGAR_USER_AGENT, 'The Deal Room deal-room@example.com'),
  },
  workspace: {
    // Feeds every deal's SharePoint/Teams deep link. Parameterized so the
    // package carries no author-specific tenant. Override per deployment.
    tenant: str(env.WORKSPACE_TENANT, 'contoso'),
  },
  ingest: {
    signalInbox: str(env.SIGNAL_INBOX, 'signals@example.com').toLowerCase(),
  },
});

export const isAiLive = () => !!config.ai.endpoint;
export const isCosmosLive = () => !!config.cosmos.endpoint;
export const isDemoMode = () => !isAiLive() && !isCosmosLive();
export const isContentSafetyLive = () => !!config.contentSafety.endpoint;

// Validate configuration at startup. In demo mode this only logs an info line.
// In live mode it warns on soft issues and (when strict) throws on hard errors.
export function validateConfig({ strict = false, log = console } = {}) {
  const warnings = [];
  const errors = [];

  if (isDemoMode()) {
    log.info?.(
      '[config] DEMO mode — no AZURE_OPENAI_ENDPOINT or COSMOS_ENDPOINT set; ' +
        'using seeded data + deterministic agents. No secrets required.'
    );
  } else {
    if (isAiLive() && !config.ai.apiKey) {
      warnings.push(
        'AZURE_OPENAI_ENDPOINT set without AZURE_OPENAI_API_KEY — assuming managed identity / keyless auth.'
      );
    }
    if (isCosmosLive() && !config.cosmos.database) {
      errors.push('COSMOS_ENDPOINT is set but COSMOS_DATABASE is empty.');
    }
    if (!config.mcpAuth.disabled && config.mcpAuth.audiences.length && !config.mcpAuth.tenantId) {
      warnings.push('MCP_AUDIENCE set but ENTRA_TENANT_ID missing — /mcp auth cannot be enforced.');
    }
  }

  for (const w of warnings) log.warn?.(`[config] ${w}`);
  for (const e of errors) log.error?.(`[config] ${e}`);
  if (strict && errors.length) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }
  return { demoMode: isDemoMode(), warnings, errors };
}

export default config;
