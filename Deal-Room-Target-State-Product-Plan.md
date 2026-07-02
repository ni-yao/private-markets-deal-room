# The Deal Room — Target‑State Product Design & Azure Cloud Architecture

**Workload:** Private Equity Deal Room (AI‑native deal flow)
**Industry:** Financial Services — Private Markets
**Stages in scope:** Deal Origination & Screening · Due Diligence & Approval (with Close → Monitor extension)
**Author / source:** Derived from the "From Fragmented Workflows to an AI‑Native Deal Flow" deck (9 slides) and the "Deal Room Idea" strategy brief (Themes 2 & 4).
**Cloud:** Microsoft Azure · Azure AI Foundry · Microsoft Fabric · Dynamics 365 · Microsoft 365
**Default region:** Sweden Central (`swc`) · EU data residency
**Status:** Draft v1.0

> **Note on scope.** This document is a *product design and cloud resource plan*, not a deployed system. Azure resource names, SKUs, and quantities are recommended starting points to be confirmed against tenant standards, capacity quotas, and security review.

---

## 1. Executive summary

Private‑markets deal teams run on disconnected point tools. Data is re‑keyed across PitchBook, Preqin, Excel and CRM; prioritization is subjective; CIMs and financials are reviewed in silos with manual PDF extraction; the IC memo is stitched together by hand; and compliance is an after‑the‑fact scramble. Sector, AI and supply‑chain specialists are pulled in **late and sequentially**, so risk is discovered *after* time, money and goodwill are committed.

**The Deal Room** replaces that with **one governed deal record** that flows from origination → screening → diligence → IC approval → close/monitor, with **governed AI agents at every stage** and every figure **grounded and cited to source**. It is built on **four Microsoft layers**:

| Layer | Microsoft / Azure platform | Role |
|---|---|---|
| **Data** | Microsoft Fabric / OneLake | One governed deal estate — unifies Preqin · PitchBook · Morningstar · eFront · FactSet · CapIQ with internal deal history & D365 CRM |
| **AI & Intelligence** | Azure AI Foundry · Azure OpenAI · Document Intelligence · M365 Copilot | Governed agents score targets, parse documents and draft memos — grounded and cited |
| **Workflow & Process** | Dynamics 365 · Power Platform / Power Automate | Pipeline, routed approvals, task assignment, compliance checkpoints, full audit trail |
| **Collaboration** | Microsoft 365 · Teams · SharePoint · Copilot · Purview | Where the team works — deal channels, the SharePoint data room, decisions captured into the record |

**Program target outcomes** (concept targets, not a fund forecast): **70% faster screening & sourcing**, **diligence weeks → days**, **40% lower end‑to‑end cycle time**.

**What changes:** continuous AI sourcing · sector / AI / supply‑chain MDs pulled forward (*shift‑left*) · connected diligence lanes · the IC memo **drafts itself** from the live record.

---

## 2. From current state to target state

### 2.1 Current state — the deal breaks down at every stage

**Stage 1 · Deal Origination & Screening (O1 Sourcing → O2 Screen → O3 Prioritize → O4 Gate)**
- Sourcing is network‑bound & manual — narrow funnel, weeks from signal to conviction.
- Data re‑keyed across PitchBook / Preqin / Excel / CRM — no single source of truth.
- No AI scoring — prioritization is subjective and inconsistent.
- AI & Supply‑Chain MDs engaged late — tech & ops risk found after time is sunk.

**Stage 2 · Due Diligence & Approval (D1 Plan → D2 Diligence → D3 Synthesis → D4 IC Approval)**
- CIMs, financials & legal reviewed in silos; manual PDF extraction — weeks of effort.
- Four workstreams disconnected — cross‑domain risk slips through.
- IC memo stitched by hand — inconsistent numbers, version chaos.
- No shared audit trail; after‑the‑fact SFDR / ILPA compliance.

**Root cause:** No unified, AI‑driven deal flow connects origination → screening → diligence → IC in one intelligent workflow.

### 2.2 Target state — one governed record, agents across the flow

```
Origination → Screening → Diligence → IC Approval → Close → Monitor
   │             │            │            │             │
 Deal-Sourcing  Target-     Document-    IC-Memo +    Covenant-
 Signal Agent   Screening   Intelligence Compliance   Monitoring
                Agent       + Commercial Agent        Agent
                            / AI / Ops DD
```

The deal record is created at first signal and is **continuously enriched** by agents and humans across the lifecycle. The **shared record is the unlock**: a number the Supply‑Chain MD validates is instantly visible in the AI MD's value‑creation plan, so cross‑domain risk surfaces automatically while diligence agents run in parallel.

---

## 3. Personas & stages in scope

| Persona | Role | Owns | Active stages |
|---|---|---|---|
| **Analyst** | Deal Associate | Sources & screens targets, finds precedents, builds models & materials in the shared record | O1–O3 · D1–D3 |
| **Retail Sector MD** | Consumer & Retail | Commercial lane — market, competitor, customer diligence into the IC decision | O3 · D2 · D4 |
| **AI MD** | AI & Digital Value | Tech / AI lane — scores AI‑readiness, shapes the value‑creation plan early | O3 · D2–D4 |
| **Supply Chain MD** | Operations | Operations lane — supplier mapping, COGS, tariff & concentration risk, up front | O3 · D2–D4 |
| **Partner / MD** | Deal Sponsor | Sources & sponsors the deal, sets gate priorities, chairs the IC approval | O1 · O4 · D4 |

**Design implication:** the specialist MDs are *shift‑left* — engaged at triage (O3) and diligence launch (D1) rather than at the end — and every contribution writes back to the one record.

---

## 4. Product design

### 4.1 Product principles
1. **One governed deal record** — a single source of truth from signal to monitoring; no re‑keying.
2. **Grounded & cited by default** — every agent figure traces to a source document or dataset (RAG with citations).
3. **Agents draft, humans decide** — agents do the heavy lifting (scan, parse, draft); MDs review and approve.
4. **Shift‑left expertise** — sector / AI / ops views captured at triage, not after the fact.
5. **Compliance in‑flow, not after** — SFDR / ILPA checks and audit trail embedded in the workflow (Purview).
6. **Work where the team already works** — Teams, Excel, Word, SharePoint, Copilot; no new island UI.
7. **Governed & auditable** — Entra identity, RBAC, content safety, full audit trail for a regulated industry.

### 4.2 The governed deal record (core concept)
The deal record is a **logical entity** that physically spans:
- **Dynamics 365 / Dataverse** — pipeline state, opportunity, decisions, tasks, approvals.
- **Microsoft Fabric / OneLake** — analytical deal estate (market data, financials, models, signals).
- **SharePoint data room** — documents (CIMs, financials, legal, NDAs) with sensitivity labels.
- **Microsoft Purview** — lineage, audit trail, compliance evidence across all of the above.

Agents read and write the record through governed tools/connectors so that the *same* validated number appears consistently to every persona and in every artifact (screen, model, memo, IC deck).

### 4.3 Capability modules
The product is delivered as seven capability modules mapped to the deal lifecycle.

| # | Module | Lifecycle stage | What it does | Primary agent(s) |
|---|---|---|---|---|
| M1 | **Continuous Deal Sourcing** | O1 Sourcing | Scans data sources & signals weekly; ranks & persona‑tags a target feed in Teams/Copilot; 1‑click promote to a D365 opportunity; drafts CxO outreach | Deal‑Sourcing Signal Agent (+ AI‑readiness & supply‑chain risk signal taggers) |
| M2 | **AI Screening & Triage** | O2 Screen · O3 Triage | Auto‑drafts a cited screening one‑pager from Fabric; generates comps; scores strategic fit; captures sector/AI/ops views at triage | Target‑Screening Agent · Pipeline‑Prioritization Agent |
| M3 | **Screening Gate & Handoff** | O4 Gate | On "pursue": initiates NDA, requests CIM, provisions diligence Teams workspace + SharePoint data room, assigns MD lanes; writes decision to D365 | Gate‑Orchestration Agent (Power Automate) |
| M4 | **Orchestrated Diligence** | D1 Launch · D2 Diligence | Drafts DD checklist from playbook + comparable deals; parses CIM/financials → Fabric → LBO model; runs parallel Commercial / Tech‑AI / Ops lanes on the shared record | Diligence‑Planner Agent · Document‑Intelligence Agent · Commercial‑DD · Tech/AI‑DD · Ops‑DD agents |
| M5 | **Synthesis & IC Memo** | D3 Synthesis | Drafts a cited IC memo from the live record; consistent numbers; embeds SFDR/ILPA checks as the memo assembles (Purview trail); real‑time co‑editing | IC‑Memo Agent · Compliance Agent |
| M6 | **IC Approval & Execution** | D4 IC Approval | Builds the IC deck with live, source‑traceable Q&A; routes approval; writes decision + conditions to D365; triggers next steps | Approval‑Orchestration Agent (Copilot capture + Power Automate) |
| M7 | **Close → Monitor** | Post‑close | Archives the deal with a full audit trail; monitors covenants/KPIs and flags breaches | Covenant‑Monitoring Agent |

### 4.4 Agent roster (responsibilities & key tools)

| Agent | Responsibility | Grounding / tools |
|---|---|---|
| **Deal‑Sourcing Signal Agent** | Continuous scan of CxO conversations, news, filings, analyst reports vs. pre‑defined mandates; ranks targets; tags AI‑readiness & supply‑chain risk | Fabric data agent, AI Search (internal deal history), Bing/web grounding, Document Intelligence (filings), D365 connector |
| **Target‑Screening Agent** | Drafts cited sector/tech/supply‑chain screen one‑pager; Copilot drafting in Excel/PowerPoint | Fabric, AI Search, Azure OpenAI, M365 Copilot |
| **Pipeline‑Prioritization Agent** | Score × strategic‑fit ranking across the live pipeline; records notes/context to CRM | Fabric, Dataverse, Azure OpenAI |
| **Gate‑Orchestration Agent** | Workflow automation on "pursue" — NDA, CIM request, workspace + data‑room provisioning, lane assignment | Power Automate, Microsoft Graph, SharePoint, Teams |
| **Diligence‑Planner Agent** | Builds DD checklist from playbook + comparable deals | AI Search (playbooks), Fabric, Azure OpenAI |
| **Document‑Intelligence Agent** | Parses CIM / financials / legal PDFs in minutes → structured data in Fabric → LBO model; flags anomalies | Azure AI Document Intelligence, Fabric, Azure OpenAI |
| **Commercial‑DD Agent** | Synthesizes market / comp / customer signals; cited commercial section | Fabric, AI Search, Azure OpenAI |
| **Tech/AI‑DD Agent** | Scores AI maturity; drafts value‑creation plan with quantified levers | Fabric, AI Search, Azure OpenAI |
| **Ops‑DD Agent** | Builds supplier map + COGS bridge; flags tariff/concentration risk | Fabric, AI Search, Azure OpenAI |
| **IC‑Memo Agent** | Drafts the IC memo from the live record — consistent, cited numbers | Fabric, AI Search, Azure OpenAI, M365 Copilot |
| **Compliance Agent** | Embeds SFDR / ILPA checks as the memo assembles; writes Purview audit trail | Purview, AI Search (policy DB), Azure OpenAI |
| **Approval‑Orchestration Agent** | Captures IC decision in Teams/Copilot; routes approval; writes conditions to D365; triggers next steps | Power Automate, Dataverse, Microsoft Graph |
| **Covenant‑Monitoring Agent** | Post‑close covenant/KPI monitoring; breach alerts | Fabric, Azure OpenAI, Power Automate, Teams |

**Orchestration pattern:** a top‑level **Deal Orchestrator** (Foundry connected‑agents / multi‑agent) routes work to specialist agents, which run **in parallel** during diligence and write back to the shared record. Human‑in‑the‑loop approval gates sit at O4 and D4.

### 4.5 User surfaces
- **Microsoft Teams** — deal channels per opportunity; agent feeds; in‑thread votes/annotations; IC meetings.
- **M365 Copilot (Excel, Word, PowerPoint, Teams)** — drafting comps, models, sections, decks; MCP connectors for the deal segment.
- **Dynamics 365 Sales** — pipeline, opportunity, decisions, approvals.
- **SharePoint** — the secure data room.
- **Power BI (Fabric)** — pipeline analytics, signal dashboards, covenant monitoring.

---

## 5. Solution architecture

### 5.1 Logical reference architecture

```
                         ┌─────────────────────────────────────────────┐
  Collaboration layer    │  Teams · SharePoint data room · M365 Copilot │  ← personas work here
                         └───────────────▲─────────────────────────────┘
                                         │ Microsoft Graph / MCP
                         ┌───────────────┴─────────────────────────────┐
  Workflow & Process     │  Dynamics 365 (Dataverse) · Power Automate   │  ← pipeline, approvals, audit
                         └───────────────▲─────────────────────────────┘
                                         │ events / connectors
                         ┌───────────────┴─────────────────────────────┐
  AI & Intelligence      │  Azure AI Foundry (Agent Service)            │
                         │   • Deal Orchestrator + 13 specialist agents │
                         │   • Azure OpenAI / Foundry model deployments │
                         │   • Azure AI Search (RAG grounding + index)  │
                         │   • Azure AI Document Intelligence           │
                         │   • Content Safety · Speech (transcripts)    │
                         │   Governed by Azure API Management AI Gateway│
                         └───────────────▲─────────────────────────────┘
                                         │ OneLake shortcuts / Fabric data agent
                         ┌───────────────┴─────────────────────────────┐
  Data layer             │  Microsoft Fabric / OneLake (Lakehouse)      │
                         │   Preqin · PitchBook · Morningstar · eFront ·│
                         │   FactSet · CapIQ · internal history · D365  │
                         └─────────────────────────────────────────────┘

  Cross-cutting:  Microsoft Entra ID (identity, Agent ID, RBAC) ·
                  Azure Key Vault · Microsoft Purview (governance/audit) ·
                  Azure Monitor / App Insights · VNet + Private Endpoints ·
                  Microsoft Defender for Cloud · Microsoft Cloud for FS
```

### 5.2 Agent orchestration (Azure AI Foundry)
- **Foundry Agent Service** hosts every agent with declarative instructions, tools, and grounding.
- **Connected agents / multi‑agent orchestration**: the Deal Orchestrator decomposes a request (e.g., "run diligence on Target X") and delegates to Commercial‑DD, Tech/AI‑DD, Ops‑DD, Document‑Intelligence agents that execute concurrently.
- **Tools exposed via MCP**: Fabric data agent, D365/Dataverse, SharePoint/Graph, Document Intelligence, AI Search — reusable, governed, and surfaced to M365 Copilot as connectors.
- **Grounding & citations**: agents retrieve from Azure AI Search (hybrid + semantic) over the OneLake/SharePoint corpus; responses carry source citations to satisfy the "every figure grounded" requirement.
- **Guardrails**: Azure AI Content Safety + prompt shields; Azure API Management as an **AI Gateway** for token limits, load balancing across model deployments, semantic caching, and centralized logging.

### 5.3 Data flow (happy path)
1. External market data + internal history land in **OneLake** (Fabric pipelines/shortcuts).
2. **Deal‑Sourcing Signal Agent** scores targets → ranked feed in Teams → 1‑click **D365** opportunity.
3. On **pursue (O4)**, **Power Automate** provisions Teams + SharePoint data room and assigns lanes.
4. CIMs uploaded → **Document Intelligence** parses → structured data to **Fabric** → LBO model.
5. Parallel **DD agents** enrich the shared record; **AI Search** grounds every claim.
6. **IC‑Memo Agent** drafts the memo; **Compliance Agent** embeds SFDR/ILPA and writes the **Purview** trail.
7. **Approval‑Orchestration Agent** captures the IC decision → conditions to **D365** → next steps triggered.
8. **Covenant‑Monitoring Agent** watches post‑close KPIs and raises alerts in Teams.

---

## 6. Azure cloud resources (bill of materials)

### 6.1 Conventions
- **Naming:** `{resource‑type}-dealroom-{env}-swc` (env ∈ `dev` | `test` | `prod`). Globally‑unique names (storage, etc.) drop separators: `stdealroom{env}swc`.
- **Region:** Sweden Central (`swc`) for all data + AI to keep EU residency; M365 / D365 follow tenant region.
- **Resource groups (dedicated, segregated by domain):**
  - `rg-dealroom-ai-prod-swc` — Foundry, OpenAI, Document Intelligence, AI Search, Content Safety, Speech.
  - `rg-dealroom-data-prod-swc` — Fabric capacity, storage, data integration.
  - `rg-dealroom-app-prod-swc` — APIM, Container Apps, Functions, Service Bus, Cosmos DB.
  - `rg-dealroom-platform-prod-swc` — Key Vault, networking, monitoring, identity.
  - (Repeat per environment: `…-dev-swc`, `…-test-swc`.)

### 6.2 AI & Intelligence layer

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Azure AI Foundry hub | `aih-dealroom-prod-swc` | Standard | Governance, shared connections, security for AI projects |
| Azure AI Foundry project | `proj-dealroom-prod-swc` | — | Hosts agents, model deployments, evaluations |
| Foundry / Azure OpenAI deployments | `oai-dealroom-prod-swc` | Standard / Provisioned (PTU) | Hosts the models in §7 |
| Azure AI Document Intelligence | `di-dealroom-prod-swc` | S0 | Parse CIMs, financials, legal PDFs (layout + custom models) |
| Azure AI Search | `srch-dealroom-prod-swc` | Standard S1 (or S2 at scale) | Hybrid + semantic RAG index for grounding & citations |
| Azure AI Content Safety | `cs-dealroom-prod-swc` | Standard | Guardrails / prompt shields for agent I/O |
| Azure AI Speech | `spch-dealroom-prod-swc` | S0 | Transcribe CxO calls / meeting audio into the record |
| Azure AI Foundry Agent Service | (in project) | — | Hosts Deal Orchestrator + 13 specialist agents, tools, threads |

### 6.3 Data layer

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Microsoft Fabric capacity | `fab-dealroom-prod-swc` | F64 (prod) / F2–F8 (dev) | OneLake, Lakehouse, pipelines, Power BI, Fabric data agent |
| OneLake Lakehouse | `lh_dealroom_prod` | (in Fabric) | Unified deal estate (bronze/silver/gold) |
| Fabric Data Warehouse | `dw_dealroom_prod` | (in Fabric) | Curated marts for comps, models, signals |
| Azure Data Lake Storage Gen2 | `stdealroomdataprodswc` | StorageV2, GRS | Landing/staging + OneLake shortcuts target |
| Fabric Data Factory pipelines | (in Fabric) | — | Ingest Preqin · PitchBook · Morningstar · eFront · FactSet · CapIQ · D365 |

### 6.4 Workflow & Process layer

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Dynamics 365 Sales | (D365 tenant) | Enterprise | CRM pipeline, opportunities, decisions, approvals |
| Microsoft Dataverse | `dv-dealroom-prod` | (with D365/Power Platform) | Deal record system of record for workflow state |
| Power Platform environment | `env-dealroom-prod` | Production | Hosts Power Automate flows + Copilot Studio |
| Power Automate | (in environment) | Per‑flow / per‑user | Gate, launch, approval, monitoring orchestration |
| Copilot Studio | (in environment) | Tenant messages pack | Declarative copilots/agents surfaced in Teams (optional) |

### 6.5 Collaboration layer

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Microsoft 365 + Copilot | (M365 tenant) | E5 + Copilot | Teams, Word/Excel/PowerPoint Copilot, Graph |
| SharePoint Online | `Deal Room` site collection | (with M365) | Secure data room, document library, sensitivity labels |
| Microsoft Teams | per‑deal channels | (with M365) | Collaboration hub, agent feeds, IC meetings |
| Microsoft Purview | (tenant) | Compliance / DG | Audit trail, lineage, SFDR/ILPA evidence, eDiscovery, DLP |

### 6.6 Integration & compute

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Azure API Management | `apim-dealroom-prod-swc` | Standard v2 / Premium | **AI Gateway** — token limits, load balancing, semantic caching, MCP exposure, logging |
| Azure Container Apps | `ca-dealroom-orchestrator-prod-swc` | Consumption + Dedicated | Hosts custom orchestration / MCP servers / agent back‑end APIs |
| Azure Container Apps Environment | `cae-dealroom-prod-swc` | — | Managed environment for the above |
| Azure Functions | `func-dealroom-events-prod-swc` | Flex Consumption | Event‑driven glue (webhooks, enrichment, doc post‑processing) |
| Azure Service Bus | `sb-dealroom-prod-swc` | Standard | Reliable messaging between agents ↔ workflow |
| Azure Event Grid | `evgt-dealroom-prod-swc` | Basic | Event routing (doc uploaded, stage changed) |
| Azure Cosmos DB | `cosmos-dealroom-prod-swc` | Serverless / Autoscale | Agent state, conversation history, deal‑record metadata index |

### 6.7 Security, identity & networking

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Microsoft Entra ID | (tenant) | P2 | Identity, conditional access, PIM; **Entra Agent ID** for agent identities |
| User‑assigned managed identity | `id-dealroom-prod-swc` | — | Passwordless access from agents/apps to Azure resources |
| Azure Key Vault | `kv-dealroom-prod-swc` | Standard (Premium for HSM) | Secrets, keys, certs; customer‑managed keys (CMK) |
| Virtual Network | `vnet-dealroom-prod-swc` | — | Private network for AI/data/app subnets |
| Private Endpoints + Private DNS | `pe-*-dealroom-prod-swc` | — | Private access to OpenAI, Search, Storage, Key Vault, Cosmos, etc. |
| Microsoft Defender for Cloud | (subscription) | Defender plans | CSPM + workload protection (AI, storage, containers) |
| Azure Policy | (subscription) | — | Guardrails — region lock to `swc`, CMK, private‑endpoint enforcement |

### 6.8 Observability

| Resource | Recommended name | SKU / tier | Purpose |
|---|---|---|---|
| Log Analytics workspace | `log-dealroom-prod-swc` | Pay‑as‑you‑go | Central logs/metrics |
| Application Insights | `appi-dealroom-prod-swc` | Workspace‑based | App + agent tracing, latency, token telemetry |
| Azure Monitor + Workbooks | (in subscription) | — | Dashboards, alerts, cost/usage of AI gateway |
| Foundry tracing & evaluations | (in project) | — | Agent traces, groundedness/quality evaluations |

---

## 7. Foundry models & AI services selection

### 7.1 Model deployments (Azure AI Foundry / Azure OpenAI)

| Model (deployment) | Where used | Why | Initial capacity |
|---|---|---|---|
| **GPT‑4.1** (or GPT‑4o) | Screening one‑pagers, IC memo, IC deck, MD Q&A | Strong long‑context reasoning + drafting quality | Standard, 50–100K TPM (scale via PTU for prod) |
| **o‑series reasoning (o3 / o4‑mini)** | Cross‑domain risk synthesis, anomaly detection, value‑creation levers | Deeper multi‑step reasoning for complex diligence | Standard, start small, scale on use |
| **GPT‑4.1‑mini / GPT‑4o‑mini** | High‑volume sourcing scan (10,000+ targets/week), tagging, classification | Cost/latency‑efficient at scale | Standard, high TPM |
| **text‑embedding‑3‑large** | Vector index for Azure AI Search (RAG grounding) | Best retrieval quality for citations | Standard |
| **Document Intelligence (prebuilt layout + custom)** | CIM / financials / legal extraction | Tables, key‑value, structure from PDFs | S0 |
| *(Optional)* **Phi small models** | Edge/cheap classification, routing | Cost control for simple tasks | Managed compute |

> Use **Provisioned Throughput (PTU)** for production‑critical paths (sourcing scan, IC memo) to guarantee latency/cost; keep Standard for burst/dev. Govern all traffic through the APIM **AI Gateway**.

### 7.2 MCP connectors (for the target segment — Slide 9 winning point)
- **Fabric / OneLake data agent** — query the governed deal estate.
- **Dynamics 365 / Dataverse** — read/write opportunities, decisions.
- **SharePoint / Microsoft Graph** — data room documents, provisioning.
- **Document Intelligence** — parse on demand.
- **Azure AI Search** — grounded retrieval with citations.
- Surface these to **M365 Copilot in Excel/Word/Teams** (aligns with "Copilot in Excel for Frontier Finance" and "trusted data in the flow of work").

### 7.3 Skills / declarative agents
- `@deal-screening` — screening one‑pager + strategic‑fit score.
- `@comps-analysis` — comparable‑company / precedent generation.
- Additional declarative agents per persona lane (Commercial, Tech/AI, Ops).

---

## 8. Security, compliance & governance (FSI)

- **Data residency:** all AI + data resources in **Sweden Central**; Azure Policy enforces region + private‑endpoint + CMK.
- **Microsoft Cloud for Financial Services** baseline + **Microsoft Purview** for lineage, audit trail, sensitivity labels, DLP, and **SFDR / ILPA** evidence generated *in‑flow* (Compliance Agent) — not after the fact.
- **Identity:** Entra ID with Conditional Access + PIM; **Entra Agent ID** gives each agent a governed identity; least‑privilege **RBAC**; managed identities (no secrets in code).
- **Network isolation:** VNet + Private Endpoints for OpenAI, Search, Storage, Cosmos, Key Vault; no public data plane.
- **Responsible AI:** Content Safety + prompt shields; groundedness checks and citations on every agent output; Foundry evaluations + human‑in‑the‑loop at O4/D4 approval gates.
- **Auditability:** full, immutable audit trail across Dataverse, SharePoint, OneLake unified in Purview; the "fully compliant, auditable pattern" demanded by the deck.
- **Keys & secrets:** Key Vault with CMK; rotation policies; Defender for Cloud monitoring.

---

## 9. Delivery roadmap

| Phase | Outcome | Key resources stood up |
|---|---|---|
| **Phase 0 — Foundations (Weeks 1–4)** | Landing zone, identity, networking, governance | Resource groups, Entra/RBAC, Key Vault, VNet + Private Endpoints, Log Analytics, Azure Policy, Defender |
| **Phase 1 — MVP demo spine (Weeks 5–10)** | Prove the loop: **O1–O2** sourcing+screening feed and **D2–D3** CIM→memo (see §10) | Fabric capacity, OneLake lakehouse, AI Search, Foundry project + GPT‑4.1 & embeddings, Document Intelligence, Deal‑Sourcing + Target‑Screening + Document‑Intelligence + IC‑Memo agents, Teams/Copilot surfaces, APIM gateway |
| **Phase 2 — Full Stage 1 (Weeks 11–16)** | Complete Origination & Screening incl. triage, scoring, gate handoff | Pipeline‑Prioritization + Gate‑Orchestration agents, Power Automate flows, D365 opportunity write‑back, SharePoint/Teams provisioning |
| **Phase 3 — Full Stage 2 (Weeks 17–24)** | Connected diligence lanes + IC approval + compliance | Diligence‑Planner, Commercial/Tech‑AI/Ops‑DD, Compliance, Approval‑Orchestration agents; Purview SFDR/ILPA; o‑series reasoning model |
| **Phase 4 — Close → Monitor & scale (Weeks 25+)** | Post‑close monitoring, PTU hardening, multi‑deal scale | Covenant‑Monitoring agent, PTU model capacity, Cosmos/Service Bus scale, cost optimization |

---

## 10. Recommended demo spine (prove it fast)

| Demo | Flow | Proves |
|---|---|---|
| **Stage 1 · O1–O2** | Sourcing‑Signal + Screening agents on Fabric surface a ranked, persona‑tagged feed in Teams/Copilot, with one‑click promote to a D365 opportunity | **70% faster screening** · shift‑left for AI & SC MDs |
| **Stage 2 · D2–D3** | Document Intelligence parses a sample CIM → connected agent lanes → IC‑Memo Agent drafts a cited memo from the live record | **diligence weeks → days** · one source of truth |

**Three winning points to land:**
1. **MCP connectors** relevant to the target segment (Copilot in Excel for Frontier Finance; trusted data in the flow of work).
2. **Disjointed workflows + collaboration** unified into one experience across **M365 + CRM**.
3. **Unified intelligence across Work, Fabric and Foundry** as the game‑changer for faster, more insightful decisions in a **fully compliant, auditable** pattern.

---

## 11. Success metrics (KPIs)

| KPI | Target | Measurement |
|---|---|---|
| Screening & sourcing speed | **70% faster** | Time from signal → qualified opportunity |
| Diligence cycle | **weeks → days** | CIM received → IC‑ready memo |
| End‑to‑end cycle time | **40% lower** | Origination → IC decision |
| Re‑keying / manual effort | Near‑zero | Manual data‑entry touchpoints per deal |
| Groundedness | ≥ 95% cited | % agent figures with valid source citation |
| Compliance | 100% in‑flow | SFDR/ILPA checks completed before IC; full Purview audit |

> KPIs reflect **program target outcomes from the Deal Room concept & prototype proposal — not a forecast for a specific fund.**

---

## 12. Cost & capacity considerations
- **Fabric capacity (F‑SKU)** is the largest fixed cost — start **F8–F16** for the demo, scale to **F64** for prod; pause dev capacity off‑hours.
- **Model spend** governed by the **APIM AI Gateway** (token quotas per agent, semantic caching for repeat retrieval, routing cheap tasks to mini models). Move steady‑state paths to **PTU** for predictable cost/latency.
- **AI Search** tier scales with corpus size; start **S1**.
- **Storage/Cosmos** on serverless/autoscale to track usage.
- Tag every resource (`workload=dealroom`, `env`, `costCenter`) for **Cost Management** reporting and budgets/alerts.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hallucinated / uncited figures in a regulated workflow | Mandatory RAG grounding + citation checks; Foundry groundedness evals; human approval gates at O4/D4 |
| External data licensing (Preqin/PitchBook/FactSet/CapIQ) | Honor source licenses; ingest via approved connectors; access controls + Purview lineage |
| Data residency / privacy (EU, FSI) | Sweden Central only; Private Endpoints; CMK; Microsoft Cloud for FS baseline |
| Agent sprawl / inconsistent state | Single governed deal record; Deal Orchestrator; shared tools via MCP; Cosmos state index |
| Model cost / latency spikes | APIM gateway quotas + caching; PTU for hot paths; mini models for high‑volume scan |
| Change management (agents draft, humans decide) | Shift‑left training; review‑not‑build UX; keep MDs in approval loop |

---

## 14. Appendix — persona × stage matrices

### 14.1 Stage 1 · Deal Origination & Screening

| Persona | O1 · AI Sourcing | O2 · Auto Screen | O3 · Triage | O4 · Screening Gate |
|---|---|---|---|---|
| **Analyst** | Reviews ranked, scored target feed in Teams/Copilot; 1‑click promote to D365; drafts CxO emails | Reviews the cited screening one‑pager drafted from Fabric — reviews instead of builds | Ranks the live pipeline; Teams notes recorded to the deal record in CRM | Reviews the pack; decision + actions written to D365 |
| **Retail Sector MD** | Curates the thesis criteria the agent screens against; trains the ranking | Gets a sector‑contextual screen (category & competitive set) | Votes / annotates in‑thread on the same record | Decides with comparable prior‑deal knowledge surfaced by Copilot |
| **AI MD** | AI‑Readiness Signal tags each target on tech maturity — reviewed early | Gets an auto‑drafted AI value‑creation hypothesis with sources | Provides tech view captured at triage, not later | Answers AI‑thesis questions via Copilot |
| **Supply Chain MD** | Supply‑Chain Risk Signal tags concentration & tariff exposure up front | Gets an auto‑drafted COGS / resilience read | Provides Ops view captured at triage, not later | Answers Ops‑risk questions via Copilot |

**Handoff:** on "pursue," the Gate‑Orchestration Agent (Power Automate) initiates the NDA, requests the CIM, provisions the diligence Teams workspace + SharePoint data room, and assigns each MD a lane — the handoff into diligence is automatic.

### 14.2 Stage 2 · Due Diligence & Approval

| Persona | D1 · Orchestrated Launch | D2 · AI Diligence | D3 · Synthesis | D4 · IC & Approval |
|---|---|---|---|---|
| **Analyst** | Teams + SharePoint room auto‑provisioned; DD checklist drafted from the playbook | Document‑Intelligence Agent parses CIM/financials in minutes → Fabric → LBO model; flags anomalies | Reviews the full memo drafted from the live record — consistent, cited numbers | Reviews the IC deck; live Q&A traceable to source |
| **Retail Sector MD** | Owns a commercial lane in the shared record | Commercial‑DD Agent synthesizes market/comp/customer signals; section cited | Edits the commercial section in‑flow (Word / Copilot in Teams) | Decides in a Teams IC; decision + conditions captured |
| **AI MD** | Owns a tech / AI lane in the same record | Tech/AI‑DD Agent scores AI maturity; drafts value‑creation plan with quantified levers | Sees ops‑validated data feeding its plan — cross‑risk caught | Decision made with the full cross‑domain view intact |
| **Supply Chain MD** | Owns an ops lane in the same record | Ops‑DD Agent builds supplier map + COGS bridge; flags tariff/concentration risk | Compliance Agent embeds SFDR/ILPA checks as the memo assembles (Purview trail) | Approval routed; conditions written to D365; next steps triggered |

**The unlock:** the shared record means a number the Supply‑Chain MD validates is instantly visible to the AI MD's plan, so the cross‑domain risk the current state misses surfaces automatically — with the DD agents still running in parallel.

---

*End of plan — draft v1.0.*
