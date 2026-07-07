# The Deal Room ("dealhub") — Solution One-Pager

**What it is.** An AI-native private-equity deal-flow workspace delivered through **one shared backend (single source of truth)** with **multiple interfaces** — a web app, a **Microsoft Teams** experience (embedded dashboard, Adaptive Card notifications, M365 Copilot agent), all reading the same data. Runs **demo-mode with no secrets**; goes live with managed identity. Packaged as **customer-deployable Bicep** with zero author-specific IDs.

> Architecture diagram: [architecture.drawio](architecture.drawio) (open with the Draw.io / diagrams.net VS Code extension).

```mermaid
flowchart LR
  web[Web browser] -->|/api| BE
  tab[Teams channel tab] --> TEAMS
  cards[Adaptive Cards] --- TEAMS
  cop[M365 Copilot agent] -->|/mcp OAuth| BE
  subgraph TEAMS[ca-dealhub-teams · thin interface]
    proxy[Embedded dashboard + SSO/OBO + bot]
  end
  TEAMS -->|forwards /api,/mcp| BE
  subgraph BE[ca-dealhub-orch · SHARED BACKEND]
    api[/api] --- mcp[/mcp Entra] --- lib[app/lib: agents, tools, store]
  end
  lib -->|managed identity| cosmos[(Cosmos DB)]
  lib --> foundry[AI Foundry + deal agent]
```

## Architecture principle
The `app` backend (`/api` + `/mcp` + `app/lib` → Cosmos/seed) is the **only** data/service layer. Web, Teams, and Copilot are **thin, interchangeable interfaces**. `teams-app` owns **no data** — it adds Teams glue (SSO/OBO, tab hosting, bot, `/config`) and forwards to the shared backend. Change a deal once → identical everywhere.

## Infrastructure (subscription-scoped Bicep, Sweden Central)
`infra/main.bicep` (targetScope `subscription`) creates **6 domain resource groups** and calls a module each, with co-located least-privilege RBAC for the core UAMI:

| RG | Contents |
|---|---|
| `rg-dealhub-core` | UAMI · Log Analytics · App Insights · Key Vault |
| `rg-dealhub-ai` | Foundry + `deal-room-analyst` agent · models · Doc Intelligence · Content Safety · Speech · AI Search |
| `rg-dealhub-data` | Cosmos DB · ADLS Gen2 · (Fabric optional) |
| `rg-dealhub-app` | ACR · Container Apps env · **ca-dealhub-orch** (backend) · **ca-dealhub-teams** · Functions |
| `rg-dealhub-integration` | Service Bus · Event Grid · (APIM optional) |
| `rg-dealhub-network` | VNet + optional Private Endpoints/DNS |

**Deploy:** `az stack sub create --location swedencentral -f infra/main.bicep -p infra/main.<env>.bicepparam` → then build/push images (`az acr build`) and roll out **by digest** (`az containerapp update --image …@sha256`). Existing `rg-dealroom-*` is left untouched.

## Live endpoints (dev)
- **Backend (single source):** `https://ca-dealhub-orch-dev-swc.…azurecontainerapps.io` — `mode: live`, `dealAgent: live`, `/mcp` Entra-secured.
- **Teams app:** `https://ca-dealhub-teams-dev-swc.…azurecontainerapps.io` — embedded dashboard + `/config` + bot.
- **Sideload package:** `deal-room-teams.zip` (tab + bot + SSO). Rebuild: `python3 teams-app/scripts/build_manifest.py --host <teams-host> --sso-client-id <id> --bot-id <id>`.

## Identity & registrations (tenant `301fb807…`)
| Purpose | App / resource | Notes |
|---|---|---|
| Tab SSO | Entra app `43ec8f74…` | `access_as_user`, 7 Teams/Office clients pre-authorized → `sso=true` |
| Notifications | Entra app `6a48d630…` + Azure Bot `bot-dealhub` | MsTeams channel enabled → `bot=true`, notifier active |
| Copilot MCP | Entra app `043b18b9…` | `deals.read`; backend `/mcp` enforces (`401` unauthenticated) |
| Runtime | Core **UAMI** | Cross-RG RBAC; Cosmos/Foundry via managed identity (no keys) |

Secrets are stored as **Container App secrets** (never in git).

## Surface status
- ✅ **Web dashboard** — live.
- ✅ **Teams channel tab** — embedded dashboard, theme sync (light/dark/contrast), per-channel deal scoping via `/config`.
- ✅ **Adaptive Card notifications** — bot + event notifier active.
- ✅ **Tab SSO** — plumbing live (`sso=true`); *per-user data scoping in the dashboard is a follow-up (backend serves deals anonymously today)*.
- 🟡 **M365 Copilot declarative agent** — backend `/mcp` secured + MCP app reg done. **Remaining (you):** in **Teams Developer Portal**, create an **OAuth client registration** (client id `043b18b9…`, secret you generate, authorize/token URLs `https://login.microsoftonline.com/301fb807…/oauth2/v2.0/{authorize,token}`, scope `api://043b18b9…/deals.read`), then put its **reference id** into `teams-app/declarative-agent/apiPlugin.json` and add `copilotAgents` to the manifest.

## Repo & delivery
- Fork `amitdesai08/private-markets-deal-room`, branch `feat/teams-dealhub` (upstream push disabled; synced with upstream `ni-yao/main`).
- App: `app/` (backend + React client). Teams: `teams-app/` (thin interface). Infra: `infra/` (Bicep). Config centralized in `app/lib/config.js` + `.env.example`.
- CI/CD: `.github/workflows/deal-room-infra.yml` (subscription stack) + `deal-room-app.yml` (ACR build + rollout).
