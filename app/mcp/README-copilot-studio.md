# Deal Room MCP server — connecting a Copilot Studio agent

This is the **Deal MCP server**: it exposes the fund's deals to a Copilot Studio agent
(e.g. a partner-MD decision copilot) over the Model Context Protocol, secured with
**Microsoft Entra ID**. Only the `/mcp` endpoint is Entra-protected; the rest of The
Deal Room (SPA + `/api/*`) stays anonymous by design.

## What it exposes (tools)

The three tools reuse the in-app analyst's exact contracts (`lib/dealTools.js`), so a
Copilot Studio agent sees the same bounded, size-capped views as the in-app analyst:

| Tool | Args | Returns |
|---|---|---|
| `list_deals` | — | Every deal as a compact summary (id, company, sector, stage, status, size, IC readiness, days-to-IC, thesis) |
| `get_deal` | `deal_id` (string), `sections?` (array) | One deal as a bounded analyst view: key figures, diligence workstreams + status, memo/compliance status, top risks. `sections` ⊆ `summary, financials, workstreams, memo, compliance, risks, activity` |
| `search_deals` | `query` (string) | Matching deal summaries (company / sector / thesis keyword search) |

Data lives in **Azure Cosmos DB for NoSQL** (database `dealroom`, container `deals`);
the server reads it via the Container App's managed identity (RBAC-only). The agent
never touches Cosmos directly.

## Endpoint

```
POST https://<MCP_HOST>/mcp
```

Transport: **Streamable HTTP** (`x-ms-agentic-protocol: mcp-streamable-1.0`) — the only
transport Copilot Studio supports (SSE was retired Aug 2025). Stateless: no session
affinity, so it scales across replicas.

## Entra ID app registration (create in your tenant)

| Field | Value |
|---|---|
| Application (client) ID | `<MCP_CLIENT_ID>` |
| Directory (tenant) ID | `<ENTRA_TENANT_ID>` |
| Application ID URI | `api://<MCP_CLIENT_ID>` |
| Delegated scope | `deals.read` → `api://<MCP_CLIENT_ID>/deals.read` |
| App role (app-only) | `deals.read.app` |

The server validates every bearer token against this app: signature (tenant JWKS),
issuer (`login.microsoftonline.com/<tenant>/v2.0` **or** `sts.windows.net/<tenant>/`),
audience (the client ID or the App ID URI), and tenant. If `MCP_REQUIRED_SCOPE` is set,
the token must also carry that delegated scope (`scp`) or app role (`roles`).

## Add it in Copilot Studio (MCP onboarding wizard — recommended)

1. Open your agent → **Tools** → **Add a tool** → **New tool** → **Model Context Protocol**.
2. Fill in:
   - **Server name**: `Deal Room`
   - **Server description**: `Read the fund's deals — thesis, key figures, diligence, memo, compliance and risks — to advise on a deal.`
   - **Server URL**: the `/mcp` endpoint above.
3. **Authentication** → **OAuth 2.0** → **Manual**, then supply:
   - **Client ID**: `<MCP_CLIENT_ID>`
   - **Client secret**: *(create one — see below; do not commit it)*
   - **Authorization URL**: `https://login.microsoftonline.com/<ENTRA_TENANT_ID>/oauth2/v2.0/authorize`
   - **Token URL template**: `https://login.microsoftonline.com/<ENTRA_TENANT_ID>/oauth2/v2.0/token`
   - **Refresh URL**: same as the Token URL
   - **Scopes**: `api://<MCP_CLIENT_ID>/deals.read`
4. Select **Create**. Copilot Studio shows a **callback (redirect) URL** — copy it.
5. In Entra (this app registration) → **Authentication** → add that callback URL as a
   **Web** redirect URI. (Copilot Studio's global redirect is
   `https://global.consent.azure-apim.net/redirect`; the wizard shows the exact one.)
6. Back in Copilot Studio, **Create a new connection**, sign in, consent to `deals.read`,
   then **Add to agent**. Turn on **generative orchestration** (required for MCP tools).

> Alternative (Option 2): import `mcp/deal-mcp-openapi.yaml` as a **custom connector**
> in Power Apps (Tools → Add a tool → New tool → Custom connector → Import OpenAPI file).

## Create the client secret (for the manual OAuth config)

```powershell
az ad app credential reset --id <MCP_CLIENT_ID> `
  --display-name "copilot-studio" --years 1 --query password -o tsv
```

Paste the value into the Copilot Studio **Client secret** field. Store it in Key Vault;
never commit it.

## Server config (env)

Set on the Container App (already wired in `infra/main.bicep`):

| Env | Value | Purpose |
|---|---|---|
| `ENTRA_TENANT_ID` | `<ENTRA_TENANT_ID>` | Issuer + JWKS |
| `MCP_AUDIENCE` | `<MCP_CLIENT_ID>,api://<MCP_CLIENT_ID>` | Accepted audiences |
| `MCP_REQUIRED_SCOPE` | *(optional)* `deals.read` | Extra gate: require the delegated scope |
| `MCP_AUTH_DISABLED` | *(local dev only)* `true` | Bypass validation for local testing |

Fail-closed: if auth isn't explicitly disabled and tenant/audience aren't configured,
`/mcp` returns **503** rather than serving deals unauthenticated.

## Scoping the agent to one deal

The MCP tools run in portfolio scope (any deal reachable by id) — the natural contract
for an orchestrated agent. To focus a Copilot Studio conversation on a single deal, do it
in the **agent's instructions/topic** (resolve the deal via `search_deals`/`list_deals`,
then pin `get_deal(<that id>)`). The in-app Foundry analyst's hard per-deal lock
(`lib/dealTools.js` `dispatchTool` with `scope:'deal'`) remains available for UI chat.
