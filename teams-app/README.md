# The Deal Room — Teams app

A **thin Teams interface** over the shared Deal Room backend (the single data
source). Delivers three surfaces, all reading the same `/api` + `/mcp`:

1. **Channel Tab dashboard** — reuses the existing Deal Room React UI (Phase 1).
2. **Adaptive Card notifications** — proactive deal alerts posted to a channel.
3. **M365 Copilot declarative agent** — grounded in deals via the existing MCP.

The Teams app owns **no data**. `server/proxy.js` forwards every data call to
`SHARED_BACKEND_URL` (the `ca-dealhub-orch` Container App). It only adds
Teams-specific glue: SSO/OBO, tab hosting, the bot, and persona mapping.

## Structure

```
teams-app/
  server/          Express: tab host + /api proxy + SSO/OBO + bot endpoint
    config.js        single env source (mirrors .env.example)
    proxy.js         forwards /api/* to the shared backend
    sso.js           Teams SSO -> OBO (Graph) token exchange
    sharedLib.js     guarded bridge to ../app/data (persona mapping only)
    bot.js           Bot Framework adapter + proactive Adaptive Cards
    notifications.js deal-event -> Adaptive Card
    index.js         entrypoint (port 8090)
  tab/             React + Vite channel tab (@microsoft/teams-js)
  declarative-agent/  Copilot declarative agent + API plugin (-> /mcp)
  manifest/        Teams app manifest (tab + bot + copilot agent)
  Dockerfile       server + built tab
```

## Run locally (demo mode)

```bash
cd teams-app
npm install
npm run build:tab           # builds tab/dist
# Point at a running shared backend (or leave unset for demo):
SHARED_BACKEND_URL=http://localhost:8080 npm run dev
# -> Deal Room Teams app listening on :8090
```

With `SHARED_BACKEND_URL` set, `/api/*` forwards to that backend so the tab shows
live data. Unset = demo mode (tab renders; data calls return a hint).

## Configuration

All settings are documented in [.env.example](.env.example) and read in
[server/config.js](server/config.js). None are required for demo mode.

| Setting | Purpose |
|---------|---------|
| `SHARED_BACKEND_URL` | The shared Deal Room backend (`ca-dealhub-orch`). |
| `ENTRA_TENANT_ID` / `TEAMS_TAB_CLIENT_ID` / `TEAMS_TAB_CLIENT_SECRET` | Tab SSO (OBO). |
| `BOT_APP_ID` / `BOT_APP_PASSWORD` | Adaptive Card notifications. |
| `APP_BASE_URL` | Public URL of this app (manifest + card deep links). |
| `MCP_HOST` | MCP host for manifest `validDomains`. |

## Deploy (hosted-first — Container App)

Built into the infra package: `infra/modules/app.bicep` defines
`ca-dealhub-teams` behind `deployTeamsApp`. Once this image is built and pushed:

1. Set `deployTeamsApp=true` and `teamsImage=<acr>/dealhub-teams:latest` in the
   `dev` params, then redeploy the `dealhub` stack.
2. The Teams CA gets `SHARED_BACKEND_URL` wired to the orchestrator automatically.
3. Fill the `manifest/` placeholders (`<TEAMS_HOST>`, `<TEAMS_APP_ID>`,
   `<BOT_APP_ID>`, `<TEAMS_TAB_CLIENT_ID>`, `<MCP_HOST>`), add `color.png` +
   `outline.png` icons, zip the manifest folder, and sideload to a channel.

## Status

Phase 0 (scaffold) — structure, shared-backend proxy, SSO/OBO seam, bot +
notification seam, tab skeleton (Teams init + theme sync + per-user persona),
declarative agent + manifest skeletons, Dockerfile. Phases 1–4 wire the full
dashboard, live notifications, and the packaged Copilot agent.
