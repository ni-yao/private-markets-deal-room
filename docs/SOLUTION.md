# The Deal Room ("dealhub") — Solution Documentation

An AI‑native **private‑markets deal room** delivered through **one shared backend (single source of truth)** surfaced by **many thin interfaces** — a web dashboard, a native **Microsoft Teams** app (Deals Overview / Stage 1 / Stage 2 with deep‑dive market research), per‑deal **Teams channels** with a **context‑aware conversational bot**, and a **SharePoint** virtual data room. Everything reads and writes the same governed data, so a change made once shows up identically everywhere.

> Architecture diagram: [dealhub-architecture.drawio](dealhub-architecture.drawio) — open with the **Draw.io / diagrams.net** VS Code extension (or [app.diagrams.net](https://app.diagrams.net)). (The earlier [architecture.drawio](architecture.drawio) is kept for history.)

---

## 1. Architecture principle — one backend, many interfaces

```mermaid
flowchart LR
  subgraph Clients
    web[Web browser]
    tab[Teams tab<br/>Deals / Stage 1 / Stage 2]
    chan[Per-deal Teams channels<br/>+ @deal bot]
  end
  subgraph TeamsApp[ca-dealhub-teams · thin interface — owns NO data]
    ui[React tab + theme sync]
    sso[SSO / OBO]
    bot[Bot: channel→deal resolver<br/>+ persona routing]
    proxy[/proxy → SHARED_BACKEND_URL/]
  end
  subgraph Orch[ca-dealhub-orch · SHARED BACKEND — single data source]
    api[/api]
    mcp[/mcp · Entra-secured/]
    lib[app/lib: store · deal agent · persona agents · dealTools · m365/graph · scoring]
  end
  web -->|/api| Orch
  tab --> TeamsApp
  chan --> bot
  TeamsApp -->|forwards /api, /mcp| Orch
  lib -->|managed identity AAD| cosmos[(Cosmos DB<br/>deals · companies · signals · events)]
  lib --> foundry[AI Foundry<br/>deal + 4 persona agents]
  lib --> graph[Microsoft Graph<br/>Teams channels · SharePoint VDR]
  lib --> ext[SEC EDGAR · Morningstar · Fabric/OneLake · Bing news]
```

The **orchestrator** (`ca-dealhub-orch`) is the only data/service layer: `/api` + `/mcp` + `app/lib` → Cosmos + AI. The **Teams app** (`ca-dealhub-teams`) is a thin interface — it hosts the tab, provides Teams SSO/OBO and the bot, and **proxies** everything to the shared backend (`SHARED_BACKEND_URL`). It owns **no data**.

---

## 2. Interfaces

### 2.1 Web dashboard (React)
The full origination‑to‑IC workflow served directly by the orchestrator.

### 2.2 Teams tab — "Deal Dashboard"
Native tab (React + Vite) that renders inside the Teams shell with theme sync and a docked agent chat panel. Three top‑level tabs:

| Tab | Contents |
|---|---|
| **Deals Overview** | KPIs, origination funnel, pipeline deals, live market intelligence (comps / IC precedents / benchmarks). |
| **Stage 1 — Origination** | Sub‑tabs: **Pipeline** (sourcing funnel + candidate screen/triage/gate), **Sourcing framework** (fund mandate → themes → ranked targets, each expandable to SEC filings · Morningstar · AI analyst report), **Market research** (analyst research; generated per‑company deep dives on the live pipeline), **Signals** (CxO mailbox + news/filings desk). |
| **Stage 2 — Diligence** | Per‑deal drawer with tabs: **Overview** (thesis, key figures w/ provenance, diligence lanes), **Stages & orchestration** (run/advance/back + quick‑links to Teams / SharePoint data room / market comparisons), **Workspace** (Teams + full 14‑folder SharePoint VDR, DD checklist, swimlanes, playbook templates), **Market research** (sector comps, IC precedents, benchmark findings, source‑citation audit), **IC readiness** (7‑question verdict). |

**Stage‑visibility lockdown:** Stage 1 is visible to everyone; **Stage 2 (Diligence) is restricted to the deal team** (user1–user4). Analysts (user5) see a lock. Enforced server‑side via `/api/teams/context`.

### 2.3 Per‑deal Teams channels
Every deal gets its own **channel inside the "Private Equity Deals" team** (id `1c85ef26‑…`), created in **threads (chat) layout**. Channels are auto‑published to all team members, and the **Deal Dashboard app** is installed on the team so its bot answers in every channel.

### 2.4 In‑channel conversational bot (context‑aware, login‑free)
When a user @mentions the bot in a deal channel it:
1. Reads the **channel id** from the activity (channel id first; conversation‑id `;messageid=` suffix stripped).
2. Calls `GET /api/deals/resolve-team/:id` → resolves the exact deal for that channel.
3. If the message names a persona (**AI MD**, **Retail MD**, **Supply Chain MD**, **Partner**) it routes to that Foundry **persona agent** with the deal context; otherwise the portfolio/deal analyst.
4. Answers using the app's **managed identity (SPN)** — **no user sign‑in required**.

---

## 3. Data & AI

| Source | Role |
|---|---|
| **Cosmos DB** `cosmos-dealhub-dev-p3tks` (db `dealroom`) | Governed store: `deals`, `companies` (desk + candidates), `signals`, `events`. AAD‑only (`disableLocalAuth=true`); reached via the UAMI. |
| **AI Foundry** | `deal-room-analyst` + 4 persona agents (`deal-room-partner`, `-retail-md`, `-ai-md`, `-supply-md`), model `gpt-5-mini`, Responses API + tool loop over `dealTools`. |
| **SEC EDGAR** | Real 10‑K/10‑Q/8‑K + Reg D (Form D) filings per target/deal; archived to Fabric OneLake `Files/Filings`. |
| **Morningstar (MCP)** | Public‑company quality ratings on ranked targets. |
| **Microsoft Fabric / OneLake** | Market intelligence: comparable deals, IC voting precedents, benchmark diligence findings, company financials. |
| **Microsoft Graph** | Teams channel provisioning + **SharePoint VDR** folder taxonomy (`00_Administration … 13_IC Materials`) in the team's document library. |
| **Bing‑grounded news agent** | Live news/catalyst discovery for the sourcing desk. |

---

## 4. Security & identity (tenant `301fb807‑…`)

| Purpose | App / resource | Notes |
|---|---|---|
| Runtime data/AI | **UAMI** `id-dealhub-dev-swc` | Cosmos (AAD) + Foundry via managed identity — **no keys**. |
| Tab SSO | Entra app `43ec8f74‑…` | `access_as_user`; Teams/Office clients pre‑authorized. |
| Bot | Entra app `6a48d630‑…` + Azure Bot `bot-dealhub` | MsTeams channel; login‑free in‑channel answers via managed identity. |
| M365 connector (delegated) | Entra app `2ecae299‑…` | Delegated Graph for channel + SharePoint provisioning; admin‑consented scopes incl. `Channel.Create`, `ChannelSettings.ReadWrite.All`, `Sites/Files.ReadWrite.All`, `TeamsAppInstallation.ReadWriteForTeam`. Signed in as `desaiamit@…`. |
| Copilot MCP | Entra app (MCP) | `/mcp` Entra‑secured (401 unauthenticated). |

Secrets live as **Container App secrets**, never in git.

---

## 5. Deployment

- **Registry:** `acrdealhubdevp3tks.azurecr.io`. Images: `deal-room` (orchestrator), `dealhub-teams` (Teams app).
- **Build:** `az acr build --registry acrdealhubdevp3tks --image <repo>:<ascii-tag> --file Dockerfile .` (⚠ ASCII tags only).
- **Deploy by digest:** `az containerapp update -n <app> -g rg-dealhub-app-dev-swc --image <repo>@sha256:<digest>`.
- **Orchestrator is pinned `min=max=1`** (single replica) so the in‑memory M365 delegated token survives between requests.
- **Infra:** subscription‑scoped Bicep (`infra/main.bicep`) provisions the domain resource groups (core / ai / data / app / integration / network) with least‑privilege RBAC.

---

## 6. Operations runbook

### 6.1 ⚠ Cosmos data availability (READ FIRST)
The orchestrator checks Cosmos **only at boot**; if Cosmos is unreachable it falls back to **`datastore=memory` with 0 deals** (full data outage — the data itself is safe in Cosmos).

A management‑group governance policy (`MCAPSGovDeployPolicies` → `CosmosDB_PublicNetwork_Modify`, **modify** effect) forces `publicNetworkAccess=Disabled`. The Container Apps environment is **Consumption (no VNet)**, so the orchestrator reaches Cosmos over **public internet** — which that policy blocks.

**Mitigation in place:** a reversible, resource‑scoped **policy exemption** (`dealhub-cosmos-public-dev`, targeting reference id `CosmosDBPublicNetworkModify`) lets `publicNetworkAccess=Enabled` stick.

**Rules:**
- **Never** restart/redeploy the orchestrator unless `az cosmosdb show -n cosmos-dealhub-dev-p3tks -g rg-dealhub-data-dev-swc --query publicNetworkAccess -o tsv` == `Enabled`.
- If it boots into memory mode: (1) ensure Cosmos public access is `Enabled` (re‑apply the exemption if a remediation flipped it), (2) restart the revision, (3) wait for `datastore=cosmos` and `deals=4`.
- **Never** re‑disable Cosmos public access.

### 6.2 M365 re‑login (only for provisioning new channels)
`GET /api/m365/login` → sign in as `desaiamit@…` → `/?connected=m365`. The delegated token is in‑memory (lost on redeploy) and durably mirrored to Cosmos. Only needed to provision **new** channels/VDRs — existing channel↔deal mappings persist in Cosmos, so the bot and data keep working without it.

### 6.3 Channel provisioning
`POST /api/deals/teams/ensure-all` creates/repairs a per‑deal channel in the "Private Equity Deals" team (threads layout), installs the app, publishes to members, provisions the SharePoint VDR, and **durably persists** the channel↔deal mapping via an etag‑safe write.

---

## 7. Repository layout

```
app/                     Shared backend (single data source)
  server.js              Express /api + /mcp router
  lib/                   store · dealAgent · personaAgent · dealTools · scoring
    m365/graph.js        Teams channel + SharePoint VDR provisioning (delegated Graph)
    repo/                Cosmos persistence (AAD)
  client/                Web dashboard (React)
teams-app/               Thin Teams interface (owns no data)
  server/                Express proxy · SSO/OBO · bot (channel context + persona routing)
  tab/src/               React tab: App · Dashboard · Stage1 · Stage2 · DealDetail · ChatPanel
infra/                   Subscription-scoped Bicep
docs/                    SOLUTION.md · architecture.drawio · one-pager.md · transformation-plan.md
```
