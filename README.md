# The Deal Room

An **AI-native private-equity deal-flow workspace** on Azure. The app *is* the
deal process — you move a deal **stage to stage** from the screening funnel into
the Deal Collaboration Hub on Microsoft 365, and at each step an orchestration
agent does the work, grounded in the live deal record.

Built on **Azure AI Foundry** (live model inference via managed identity) with a
subscription-agnostic **Bicep** infrastructure definition, containerized to
**Azure Container Apps**.

![deal journey](app/docs/deal-journey.png)

> **📘 Solution documentation:** [docs/SOLUTION.md](docs/SOLUTION.md) — architecture, Teams app & channel model, context-aware bot, security/identity, deployment and the operations runbook. Architecture diagram: [docs/dealhub-architecture.drawio](docs/dealhub-architecture.drawio) (Draw.io).

## The flow (the canonical process)

Two stages joined by the **PURSUE** gate, nine sequential steps:

```
Stage 1 · Origination & Screening   (the screening funnel)
  O1 Deal Sourcing → O2 Auto Screen → O3 Triage → O4 Screening Gate
        ⚡ PURSUE — Power Automate spins up the deal collaboration space
Stage 2 · Diligence & Approval      (the Deal Collaboration Hub on M365)
  D1 Launch → D2 Diligence → D3 Synthesis → D4 Approval & Execution → D5 Archive
```

## Highlights

- **Home command centre** — fund KPIs, the live origination funnel, and the
  deals-in-diligence roster; the app lands here on refresh.
- **O1 Deal Sourcing depth** — a CxO Signals explorer (M365 mail/chats/meetings +
  Dynamics 365 CRM), a News & Filings sourcing desk with an AI catalyst
  classifier, and Analyst Reports thesis context.
- **Sourcing framework** — Fund Mandate *gates* · Investment Themes *guide* ·
  Screens *rank*, with a discover-to-score loop.
- **Screening Gate** — a decision desk where the MD records **PURSUE** on the
  gate-ready shortlist, creating screened deals.
- **Launch Orchestration** — every deal provisions a real diligence workspace
  with a shapes-and-lines architecture diagram (Teams channels, a SharePoint VDR,
  the DD checklist, playbook templates, and three advisor-paired swimlanes), each
  node linking out.
- **Live Azure AI** — calls the deployed Foundry model via `DefaultAzureCredential`
  (no keys), with a seeded demo-mode fallback so the app is fully usable offline.

![sourcing framework](app/docs/sourcing-framework.png)
![launch workspace](app/docs/launch-workspace-diagram.png)

## The Microsoft Teams experience

The deal process doesn't live in a separate portal that partners have to remember
to open — it lives **where deal teams already work: Microsoft Teams**. The Deal
Room surfaces the same live deal record inside Teams as a **native channel tab**
and an **@mentionable conversational agent**, with a real Teams channel and a
SharePoint virtual data room provisioned per deal.

### One backend, two surfaces (not two copies of the app)

There is a single application and a single source of truth. It is presented
through two complementary tiers that run side by side in the resource group:

| Tier | Container app | Role |
|---|---|---|
| **Deal Room (web + API + data)** | `ca-dealhub-orch-*` (image `deal-room`) | The full browser SPA **and** the API/data plane — Cosmos DB, the MCP server, Foundry agents, and Microsoft Graph provisioning. **The only tier that holds data.** |
| **Teams interface** | `ca-dealhub-teams-*` (image `dealhub-teams`) | A thin Teams-native front end — the channel tab + the conversational bot. Holds **no data**; every read/write forwards to the orchestrator over `/api`. |

> **Two web apps, by design — not a duplicated version.** The Teams tier is a
> lightweight, Teams-optimised console; it proxies all data to the one backend
> (`SHARED_BACKEND_URL`), so there is a single data source and no state to keep in
> sync. Browser users get the full dashboard; Teams users get a channel-native view
> of the *same* deal record, one click from the full dashboard.

### Features in Teams

- **Native channel tab (the agent console).** An Entra-SSO tab that renders the
  deal workspace right inside the channel — Home, the Stage 1 screening funnel,
  Stage 2 diligence, per-deal detail, and an inline chat panel. Signed-in user
  context flows through, so the tab knows *who* is looking.
- **Conversational agent — `@Deal Room Assistant`.** @mention the bot in any deal
  channel and it answers **grounded in that deal**. The bot infers the deal from
  the **channel context** (channel↔deal map, with a company-name fallback), so you
  never have to restate which company or deal you mean.
- **Persona-aware orchestration.** A single bot routes to the right specialist
  lens — analyst, retail MD, supply-chain MD, AI MD, or partner — framing its
  answer from that persona while drawing on the live deal tools (`get_deal`,
  financials, diligence, signals).
- **Identity-aware access (RBAC).** What the agent will do depends on **who is
  asking**, resolved from the Teams user's identity:

  | Role | Personas | Stage-2 deal data | Write actions |
  |---|---|---|---|
  | **Partner** | all specialists | ✓ | ✓ |
  | **Deal team** | analyst + all MDs | ✓ | ✓ |
  | **Analyst / member** | analyst only | — (denied) | — (read-only) |

  Unauthorised persona requests are transparently **downgraded** to a read-only
  analyst view rather than refused outright, and Stage-2 (diligence/approval) deal
  data is gated for read-only roles.
- **Proactive Adaptive Cards.** Deal events post as cards into the deal's channel
  with a deep link straight back to the tab — the channel becomes the deal's
  activity feed.
- **A channel + a data room per deal.** Hitting **PURSUE** provisions a real Teams
  **channel** and a **SharePoint VDR** for the deal (via delegated Microsoft
  Graph), with a durable channel↔deal mapping so context resolution stays correct
  even as deals scale.

### Teams platform capabilities used

Entra **SSO** (tab per-user context) · **Bot Framework** conversational bot
(single-tenant) with Teams channel · **channel tabs** (configurable/static) ·
**Adaptive Cards** proactive messaging · **deep links** back to the tab ·
**org app catalog** distribution & install · per-deal **Teams channels** +
**SharePoint** document libraries · an **MCP** endpoint that lets **M365 Copilot**
and hosted agents call the same grounded deal tools.

### Business value

- **Zero context-switching.** Diligence, Q&A, and approvals happen in the channel
  where the deal team already collaborates — adoption doesn't depend on anyone
  opening a separate app.
- **Every answer is grounded and current.** The bot and tab read the live deal
  record through one backend, so there's no stale copy and no "which version?"
  ambiguity.
- **Governed by identity, least-privilege by default.** Access to specialists,
  Stage-2 data, and write actions is scoped to the requester's role — a partner
  and an analyst asking the same question get appropriately different answers.
- **Auditable deal spaces.** Each deal gets its own channel + SharePoint VDR, so
  conversations and documents are captured in a governed, per-deal workspace.
- **Portable accelerator.** The whole experience is parameterised Bicep — a new
  tenant stands it up from app registrations + a handful of parameters.

## Repository layout

```
.
├── app/                    The running application (React + Vite client, Node/Express API)
│   ├── client/             React + TypeScript UI
│   ├── lib/                AI client, agents, in-memory store, Graph webhook
│   ├── data/               Flow, personas, deals, sourcing framework, workspace factory
│   ├── graph/              Microsoft Graph subscription helpers (mailbox signals)
│   ├── docs/               Screenshots
│   └── Dockerfile          Multi-stage build (client → server → runtime)
├── teams-app/              The Teams interface tier (thin front end; holds no data)
│   ├── tab/                Teams-native agent console (React + Vite)
│   ├── server/             SSO/OBO, bot (Bot Framework), backend proxy, Adaptive Cards
│   ├── manifest/           Teams app manifest + build script
│   └── Dockerfile          Multi-stage build (tab → server → runtime)
├── infra/                  Azure infrastructure as code
│   ├── main.bicep          ~45 resources in a single resource group
│   └── main.{dev,test,prod}.bicepparam
└── .github/workflows/      OIDC CI/CD for infra and app
```

## Run locally

```powershell
cd app
npm install
npm run build --prefix client   # build the client once
$env:PORT = 8080
node server.js                  # http://localhost:8080  (demo mode without a Foundry endpoint)
```

The app runs in **demo mode** out of the box (seeded AI responses). Set
`AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_DEPLOYMENT` to point at a deployed Foundry
model for live inference.

## Deploy to Azure

The Bicep is **subscription-agnostic** — pick the subscription at deploy time.

```powershell
az group create -n rg-dealroom-dev-swc -l swedencentral
az deployment group create -g rg-dealroom-dev-swc \
    -f infra/main.bicep -p infra/main.dev.bicepparam
# then build & push the app image to the created ACR and point the Container App at it
```

See `infra/README.md` and `app/README.md` for the full details, and
`app/graph/README.md` for the Microsoft Graph mailbox-signals setup.

## Notes

- Authentication is via **managed identity** end to end — there are no secrets in
  this repository.
- Microsoft 365 / Copilot, Dynamics 365, SharePoint and Purview are SaaS /
  tenant-level and are configured via licensing / admin portals, not by Bicep.
