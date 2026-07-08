// Release history for The Deal Room. Each entry corresponds to an actual
// deployment to Azure Container Apps (image tag + revision), newest first.

export interface ChangelogEntry {
  version: string;
  date: string;
  image: string;
  revision: string;
  title: string;
  tag: 'feature' | 'improvement' | 'release';
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v0.34.0',
    date: '2026-07-08',
    image: 'dealroom-app:v56',
    revision: 'ca-dealroom-orch-dev-swc--0000052',
    title: 'Persona agents work in Microsoft Teams — server-executed (MCP) research tools',
    tag: 'improvement',
    highlights: [
      'Fixed the “No tool output found for function call” error when calling a persona agent published to Teams. The agents were prompt agents with client-side function tools, which only work when the app’s backend runs the tool loop — Foundry’s Teams channel invokes the agent directly with no client, so every tool call failed. The agents now use a single hosted MCP tool that Foundry executes server-side, so they work through Teams.',
      'Added a read-only MCP surface (/mcp-ro) exposing only the research/read tools (list/get deals, pipeline, companies, IC readiness, market intelligence, citation audit) and authenticated by a static read-only key or a valid Entra token. The write/action tools stay Entra-guarded on /mcp — a Teams agent can research the pipeline but never mutate it.',
      'Re-provisioned all five persona agents (analyst, partner, retail/AI/supply MDs) to research via the hosted tool and give lane-specific analysis and recommendations as text; formal actions (contributions, advancing, approvals) continue to be recorded in the Deal Room app. Verified end-to-end: Foundry executed the tools server-side (search_deals → get_deal → get_ic_readiness → get_market_intel) with zero errors and returned a grounded Allbirds briefing — the exact path the Teams channel uses.',
      'Also restored Cosmos DB connectivity after its public network access had drifted to Disabled (with no private endpoint/VNet, that made the datastore unreachable and forced an in-memory fallback); re-enabled it to the deployed bicep’s intended state, keeping the data plane protected by managed-identity RBAC (local auth stays disabled).'
    ]
  },
  {
    version: 'v0.33.0',
    date: '2026-07-07',
    image: 'dealroom-app:v54',
    revision: 'ca-dealroom-orch-dev-swc--0000050',
    title: 'Auto-archive SEC filings into Fabric OneLake for sourced deals',
    tag: 'feature',
    highlights: [
      'Sourced deals now have their SEC filings automatically pulled from EDGAR and written into the Fabric lakehouse’s Files/Filings folder — organized by company and filing (e.g. National CineMedia Inc / 10-Q_2026-05-12_.../ …), the complete document set per accession. Analysts see the real regulatory source documents in Fabric right next to the market-intelligence tables.',
      'OneLake is written through its ADLS Gen2 DFS API using the app’s identity; a new panel on the deal workspace shows what was archived (form, date, doc count, size), a live connectivity status and an “Open in Fabric” link. Endpoints: POST /api/deals/:id/filings/onelake, POST /api/filings/onelake/backfill, GET /api/onelake, GET /api/onelake/filings, plus onelake status in /api/config.',
      'Honest by design: writes use the managed identity at runtime and fail loudly with the real reason when it isn’t yet authorized — writing to this workspace needs a one-time Contributor/Member grant to the app identity, surfaced clearly in the panel until it lands. The current sourced deals were backfilled for real (National CineMedia and XBP Global; Sound United and Allbirds have no SEC coverage).',
      'Fixed a company-resolution bug this surfaced: the EDGAR name matcher could resolve a company on a single generic shared word (it once matched “Sound United” to IBM on “business”). Resolution now requires a genuine multi-token overlap (or a distinctive single-token full-name match), so a weak match reports “no coverage” instead of archiving the wrong company’s filings.'
    ]
  },
  {
    version: 'v0.32.0',
    date: '2026-07-07',
    image: 'dealroom-app:v53',
    revision: 'ca-dealroom-orch-dev-swc--0000049',
    title: 'Production hardening — Cosmos-authoritative writes, IC gates, live Fabric, first-class lanes, citations & canonical company model',
    tag: 'improvement',
    highlights: [
      'Cosmos is now the authoritative datastore. Deal writes use optimistic-concurrency read-modify-write on the document _etag, so with multiple replicas (the UI and the five persona agents all writing) a stale in-memory copy can never clobber a newer one — verified with 10 concurrent writes landing with zero lost updates. Writes are durable (retried, never silently swallowed), every replica re-reads from Cosmos on a short interval, and a mis-configured datastore now fails loudly instead of silently degrading. Container Apps max replicas raised from 1 to 3.',
      'IC-readiness gates are enforced. Entering IC approval (D3→D4) and the IC approval itself (D4→D5) are blocked when the readiness verdict is NOT-READY — only the Partner may override, and only with a written reason that is recorded as an audit event and surfaced on the cockpit. The dashboard shows a partner-override modal; the agents get the same gate through the MCP tools.',
      'Financial/QoE, Legal, Tax and ESG are now first-class diligence lanes — full workstreams and workspace swimlanes (each with its owner and typical advisor: EY QoE, Kirkland legal, PwC tax, ERM ESG), not just issue-log lanes. Existing deals are backfilled automatically, so every deal now runs all seven lanes through the cockpit.',
      'Source-citation validation. Every numeric claim in the IC materials (key figures and memo sections) is mapped to a source fact or cited document; unsourced figures are flagged with a 0–100 citation score on the cockpit and a full audit at /api/deals/:id/citations and via a new agent tool.',
      'Live Fabric mode. The app now queries the Fabric lakehouse SQL endpoint directly (live) in addition to the materialized OneLake snapshot, boots fast on the snapshot and upgrades to live in the background, and shows data freshness (as-of) and full table-level lineage in the cockpit — degrading honestly to the snapshot with an explicit reason when a live query is not available.',
      'Canonical Company model. The news/filings desk, the screening-funnel candidates and the CxO signals are now unified into one entity-resolved governed record per real company (deduped by domain → registry → name), exposed at /api/companies, in the pipeline’s new “governed model” strip, and to the agents — resolving the duplicate feed records into a single company profile with merged provenance and funnel state.'
    ]
  },
  {
    version: 'v0.31.0',
    date: '2026-07-07',
    image: 'dealroom-app:v52',
    revision: 'ca-dealroom-orch-dev-swc--0000048',
    title: 'IC Readiness cockpit + real Fabric / OneLake market intelligence',
    tag: 'feature',
    highlights: [
      'New IC Readiness cockpit on every diligence step (D2–D4) turns “readiness” from a completion percentage into a decision-grade board that answers the seven questions an Investment Committee actually asks: are the required artifacts complete, which workstreams are blocking, which assumptions changed since the last IC draft, which risks are unresolved, what supports the recommendation, what is the exact IC ask, and which conditions need approval — with an overall READY / CONDITIONAL / NOT-READY verdict derived from real gating facts, not an averaged progress bar.',
      'Grounded in the fund’s real market data in Microsoft Fabric / OneLake (workspace “Deal Room”, lakehouse deal_room_starter). The cockpit and a new Market-intelligence panel surface real comparable & historical deals (deal type, implied valuation, outcome), IC voting precedents (decision, votes, conditions), benchmark diligence findings across all five workstreams (Commercial / Financial / Legal / Operational / Tax with severity mix), and real SEC filing financials — so valuation, diligence scoping and IC conditions are grounded in real data, and Fabric comparables count as supporting sources for the recommendation.',
      'Operational diligence made real: an issue log with severity, owner, resolution path and due date (add / mitigate / resolve inline), IC conditions with an owner and a proposed → accepted → satisfied lifecycle, and assumption snapshots so the cockpit shows exactly what changed since the last IC draft. Every mutation persists to the governed deal record and writes an audit event.',
      'Exposed to the agents too: the Deal MCP server grew from 19 to 25 tools — get_ic_readiness and get_market_intel (reads) plus record_issue, resolve_issue, set_condition and snapshot_assumptions (persona-governed writes) — and the five Foundry persona agents were re-provisioned so they can read the cockpit, ground answers in Fabric comparables/precedents, and log issues on their own lane (sector MDs) or set IC conditions (partner) under the same server-side authorization.'
    ]
  },
  {
    version: 'v0.30.0',
    date: '2026-07-06',
    image: 'dealroom-app:v43',
    revision: 'ca-dealroom-orch-dev-swc--0000039',
    title: 'Deal workspace links fixed — no more 404s on Teams channels or SharePoint folders',
    tag: 'improvement',
    highlights: [
      'Fixed the Launch Orchestration workspace 404s. Every Teams and SharePoint link was previously a constructed placeholder deep-link; when the underlying resource wasn’t really provisioned yet, clicking it 404’d. Every link is now gated on real provisioning — the app never navigates to a placeholder URL.',
      'Teams channels now open the real deal team. A team is created per deal at launch (the standard template provisions a single General channel), so every workstream chip — and each swimlane’s Teams button — opens that real deal team. Existing deals self-heal at boot: fabricated “&channel=…” links are repaired to the real team automatically.',
      'Per-workstream Teams channels are honestly represented. Creating distinct channels per workstream (Commercial DD, Financial/QoE, Legal, Tech/AI, Operations, Tax, IC Prep) requires the admin-consent-gated Channel.Create permission, which this tenant restricts — so workstream discussion runs in the deal team and each workstream’s documents live in its own SharePoint folder. The UI states this clearly.',
      'SharePoint folders provision on demand. If the data room isn’t live yet, clicking a folder (or “Provision SharePoint”) provisions it in place when Microsoft 365 is connected, then opens the real folder — otherwise it shows an actionable note to connect/reconnect M365 on the Home page (the folder taxonomy uses the user-consentable Files.ReadWrite.All scope).'
    ]
  },
  {
    version: 'v0.29.0',
    date: '2026-07-06',
    image: 'dealroom-app:v42',
    revision: 'ca-dealroom-orch-dev-swc--0000038',
    title: 'Real SharePoint data room — the deal’s VDR folders are now provisioned for real',
    tag: 'feature',
    highlights: [
      'Launching a deal now provisions a real SharePoint data room, not just a link. Every Teams deal space is backed by a SharePoint document library; at launch the app resolves that library and creates the full standard VDR folder taxonomy inside it, so the “SharePoint” button opens an actual indexed data room.',
      'Reviewed the folder taxonomy against standard M&A practice (Datasite/Ansarada-style indexes) and completed it: added a dedicated Insurance folder — the one standard section that was missing — for a clean 14-folder index (Administration, Corporate & Legal, Financials, Commercial & Sales, Tax, IP, Real Property & Assets, Contracts, Employment & HR, IT & Technology, Operations, Insurance, Environmental & Regulatory, IC Materials).',
      'Provisioning is idempotent (existing folders are reused, never duplicated) and best-effort — it never blocks the Teams provisioning or the deal launch. The real folder URLs replace the previously-constructed deep links across the workspace map, the folder chips and each swimlane’s SharePoint folder.',
      'Uses the user-consentable Files.ReadWrite.All delegated scope (no tenant-admin approval needed). Existing M365 connections should re-connect once on the Home page to grant the new scope; after that, launching (or the workspace Teams button) creates the folders live.'
    ]
  },
  {
    version: 'v0.28.0',
    date: '2026-07-06',
    image: 'dealroom-app:v41',
    revision: 'ca-dealroom-orch-dev-swc--0000037',
    title: 'Agent enablement — the 5 persona agents can now see everything and move deals forward',
    tag: 'feature',
    highlights: [
      'The Deal MCP server (what the Copilot Studio persona agents connect to) grew from 3 read-only tools to 18: agents can now see the whole Stage-1 funnel (list_pipeline, get_candidate) and every step deliverable (get_candidate_artifact for the O2/O3/O4 scorecards & memos, get_deal_artifact for the D1–D5 plan/findings/IC-memo/execution/100-day-plan) — the same artifacts the dashboard renders.',
      'Agents can now ACT: send_to_screening, screen/triage/gate_candidate, launch_deal, advance_deal, approve_ic, run_step, assign_lane and record_finding move deals forward through the pipeline — reusing the exact store logic the dashboard uses.',
      'Every action is governed by a per-persona policy that mirrors the real fund’s separation of duties: only the Partner may PURSUE at the Screening Gate (O4) and approve at the IC (D4); each Sector MD may only record findings in its own diligence lane; the Analyst runs the top of the funnel. A get_next_actions tool tells each agent exactly what it’s allowed to do at the deal’s current stage.',
      'The persona is resolved through a single seam (Option 1: the agent declares its persona; upgradeable to per-agent app-registration or delegated-user identity with no tool changes) and can be gated behind a dedicated deals.act write scope. The store is pinned to a single replica so the agents and the dashboard stay a consistent single-writer.'
    ]
  },
  {
    version: 'v0.27.0',
    date: '2026-07-06',
    image: 'dealroom-app:v40',
    revision: 'ca-dealroom-orch-dev-swc--0000036',
    title: 'Stage 2 built out — the full diligence-to-close deal room (D1–D5)',
    tag: 'feature',
    highlights: [
      'The five Stage-2 diligence steps are no longer empty shells — each now expands to the real deliverable a US mid-market PE firm produces, grounded in fresh research across 235 findings from 100 practitioner sources (Big-4 DD guides, Bain/BCG commercial DD, Wall Street Prep, CFI, M&I/Multiple Expansion, law-firm SPA guides, ILPA, Datasite/Ansarada).',
      'D1 Launch → a Diligence Plan: eight confirmatory workstreams (financial/QoE, commercial, legal, tax, operational, tech/cyber, HR, ESG) scoped and prioritized from the deal’s own screening-memo risks, each with the adviser a firm engages, a DD budget breakdown and a 7–9 week exclusivity timeline.',
      'D2 Diligence → a Findings / Red-Flag Report: severity-rated findings per workstream (deal-stopper / price-adjuster / closing-condition / post-close) rolled into a go/no-go read — QoE EBITDA haircut, customer concentration, change-of-control consents, Phase I ESA and more.',
      'D3 Synthesis → the Final IC Memo: a diligence-backed memo with returns off QoE-adjusted EBITDA (base/upside/downside MOIC & IRR vs the fund hurdle), thesis, value-creation plan, a findings-synthesis grid by workstream, key risks, exit analysis and the exact IC authorization sought.',
      'D4 Approval → an Execution Pack (IC decision, SPA key terms, R&W insurance, conditions precedent incl. HSR, and a sources-&-uses funds flow) and D5 Archive → a Close-out & 100-Day Plan (value-creation levers, the 3-phase 100-day plan, governance/MIP/reporting, and records/audit). Deterministic and grounded first, with an AI narrative layer on D2/D3.'
    ]
  },
  {
    version: 'v0.26.0',
    date: '2026-07-06',
    image: 'dealroom-app:v39',
    revision: 'ca-dealroom-orch-dev-swc--0000035',
    title: 'Auto Screen, Triage & Screening Gate — real PE artifacts, grounded in research',
    tag: 'feature',
    highlights: [
      'The three pre-gate funnel steps are no longer thin advance/pass shells — each candidate row now expands to the real deliverable a US mid-market PE firm produces at that step, grounded in research across 235 findings from 86 practitioner sources (Wall Street Prep, CFI, M&I/Multiple Expansion, Grata, Sourcescrub, DealCloud/Affinity, Axial, SPS/Bain).',
      'O2 Auto Screen → an Investment-Criteria Scorecard: a pass/flag/fail knockout matrix over the fund’s binding criteria — sector/mandate fit, geography, EV band, positive-EBITDA (LBO viability), implied entry-multiple sanity, ESG exclusions — plus soft flags (margin/model, growth quality, ownership/actionability). Advances only when nothing fails.',
      'O3 Triage → a weighted Triage Scorecard: six scored dimensions (investment-thesis fit, asset quality, value-creation angle, deal actionability, valuation attractiveness, competitive dynamics) roll up to a composite score and an A/B/C tier (A pursue, B monitor, C pass), with an AI value-creation angle & why-now brief.',
      'O4 Screening Gate → an IC Pre-Screen Memo: a back-of-envelope paper LBO (entry multiple, 5x leverage, 5-yr hold) with base/upside/downside MOIC & IRR against the fund’s ≥2.0x / ≥20% hurdle, plus sourcing angle, investment thesis, key risks & mitigants, diligence priorities, proposed deal team and the precise IC ask.',
      'Each artifact is grounded and deterministic first (real numbers from the record), with an AI narrative layer on top; the whole panel loads lazily on expand and is cached per candidate. Also fixed an id-sequence bug where a freshly booted container could mint a candidate/deal id that collided with an existing record.'
    ]
  },
  {
    version: 'v0.25.0',
    date: '2026-07-06',
    image: 'dealroom-app:v38',
    revision: 'ca-dealroom-orch-dev-swc--0000034',
    title: 'Resilient Morningstar pull + in-panel Retry on ranked targets',
    tag: 'improvement',
    highlights: [
      'Fixed the intermittent “Morningstar read failed: fetch failed” on a ranked target’s expanded view. The cause was a transient network hiccup on the Morningstar MCP tool call that then got stuck in the cached detail — so re-opening the row kept showing the stale failure with no way to recover.',
      'The Morningstar quality pull is now resilient: transient network failures (dropped sockets, DNS blips, connection resets) are automatically retried with a fresh MCP session and backoff, so a one-off failure self-heals instead of surfacing to the desk. Auth failures still surface immediately so you know to re-connect.',
      'Added a “↻ Retry” button right in the Morningstar panel of the expanded target. It re-pulls only the Morningstar read (no filings re-fetch, no analyst-report regeneration), updates the panel in place, and refreshes the server-side cached detail so the fresh rating sticks when you re-open the row.',
      'Hardened the OAuth token store so a Morningstar (or LSEG/Moody’s) login survives redeploys: rotated single-use refresh tokens are now persisted durably to Cosmos before use, concurrent refreshes are coalesced, and an already-rotated token self-heals from the durable copy — eliminating the “refresh token does not exist” failures after a restart. When a sign-in genuinely expires, the panel now tells you to re-connect on Home instead of implying a retry will help.'
    ]
  },
  {
    version: 'v0.24.0',
    date: '2026-07-06',
    image: 'dealroom-app:v36',
    revision: 'ca-dealroom-orch-dev-swc--0000032',
    title: 'Save the entire filing — full EDGAR documents pulled into the deal room',
    tag: 'feature',
    highlights: [
      'Every filing on a ranked target’s detail panel now has a “Save entire filing” action: instead of only linking out to SEC.gov, the deal room pulls down the complete EDGAR accession — the primary document, every exhibit, the XBRL data and the full submission text — and saves them as a durable, self-contained copy.',
      'Saved documents are persisted to the deal room’s own Azure Blob storage (the ADLS Gen2 data account, written by the app’s managed identity) and served back from our store, so the source filings survive even if the SEC link ever moves. Works for both public 10-K/10-Q/8-K filings and private-company Reg D Form D notices.',
      'The row shows a saved badge (document count + total size), an “Open saved primary” link, and an expandable list of every saved document with individual download links. Downloads are served through a tight allow-listed path so only saved SEC documents are ever exposed.',
      'Pulls are paced and size-capped to respect SEC EDGAR’s fair-access guidance; a local on-disk store keeps the feature fully testable in development.'
    ]
  },
  {
    version: 'v0.23.0',
    date: '2026-07-06',
    image: 'dealroom-app:v35',
    revision: 'ca-dealroom-orch-dev-swc--0000031',
    title: 'News Signals · filings + Morningstar + analyst report on ranked targets',
    tag: 'feature',
    highlights: [
      'The News & Filings desk is now News Signals — restructured to mirror CxO Signals: a live news feed on the left (with tabs per source/publisher) and the companies extracted from that news on the right, each expandable to its grouped catalysts. Cleaner, signal-first, and consistent with the CxO explorer.',
      'Filings and the Morningstar quality read have moved onto the Deal Sourcing page: every ranked target row is now expandable to a detail panel with three sections — SEC filings (10-K/10-Q/8-K for public names, Reg D Form D for private), the Morningstar rating (shown only for public tickers; private names say “no public coverage”), and a generated analyst report.',
      'The analyst report is AI-generated and grounded in what the desk actually knows about the target — sector, EV, ownership, the live news catalysts, its filings and (for public names) the Morningstar read — producing a why-now thesis, sector outlook, competitive read, key risks and a recommendation. Falls back to a grounded deterministic note if the model is momentarily unavailable.',
      'It works for both news-sourced and CxO-signal targets, loads lazily on expand (cached), and keeps the catalyst re-classification control on each news item.'
    ]
  },
  {
    version: 'v0.22.0',
    date: '2026-07-06',
    image: 'dealroom-app:v28',
    revision: 'ca-dealroom-orch-dev-swc--0000024',
    title: 'M365 sign-in needs no admin approval · a Team per deal',
    tag: 'improvement',
    highlights: [
      'Connecting M365 no longer hits Entra’s “Need admin approval” wall: the app now requests only user-consentable Graph scopes, so you can sign in and consent yourself (no tenant-admin needed).',
      'To make that possible, each deal now gets its OWN Microsoft Teams team (“Deal - <company>”), created with the user-consentable Team.Create permission — instead of a channel in a shared team, which required the admin-only Channel.Create. The workspace “Microsoft Teams” button opens that deal’s Team (its channel).',
      'The deal’s Team is still provisioned at launch (off the Screening Gate) when M365 is connected, and on demand from the workspace button otherwise — idempotent, so re-opening always returns the same Team rather than creating duplicates.',
      'Scopes are now: User.Read, Team.ReadBasic.All, Team.Create (+ offline_access/openid/profile/email) — all self-consentable; Channel.Create and ChannelMessage.Send were removed.'
    ]
  },
  {
    version: 'v0.21.0',
    date: '2026-07-06',
    image: 'dealroom-app:v27',
    revision: 'ca-dealhub-orch-dev-swc--0000023',
    title: 'M365 login connector · real Teams channel per deal',
    tag: 'feature',
    highlights: [
      'New “M365 Login” connector at the top of the Home Data-source connectivity panel (above Web): a real Microsoft Entra delegated sign-in. The dashboard stays open as an admin/monitoring UI — connecting M365 is opt-in and does not put the app behind a login. Its connectivity test shows who you’re signed in as (real Graph /me).',
      'The single M365 connection is reused by every M365-powered step. First use: Launch Orchestration now provisions a REAL Microsoft Teams channel for each deal — created via Graph when the deal is launched off the Screening Gate — so the “Microsoft Teams” button on the deal workspace map opens that deal’s live channel (one channel per deal, under a shared “The Deal Room” team).',
      'Idempotent and resilient: the channel is created once at launch and reused (no duplicates); if a deal was launched while M365 was disconnected, the Teams button provisions it on demand once you connect. If M365 isn’t connected, the button prompts you to connect on the Home page rather than failing.',
      'Delegated Graph token (offline_access) is captured server-side via authorization-code + PKCE and never reaches the browser; the client secret is stored as a Container App secret. Scopes: User.Read, Team.ReadBasic.All, Team.Create, Channel.Create, ChannelMessage.Send.'
    ]
  },
  {
    version: 'v0.20.0',
    date: '2026-07-06',
    image: 'dealroom-app:v26',
    revision: 'ca-dealhub-orch-dev-swc--0000022',
    title: 'Deal MCP server — Entra-secured, for Copilot Studio',
    tag: 'feature',
    highlights: [
      'New Model Context Protocol (MCP) server at /mcp that exposes the fund’s deals — list_deals, get_deal and search_deals — to Copilot Studio, so a teammate can build a partner-MD decision agent grounded in live deal data (thesis, key figures, diligence, memo, compliance and risks).',
      'The three MCP tools reuse the in-app analyst’s exact contracts (refactored into a shared lib/dealTools.js), so the Copilot Studio agent and the in-app Foundry analyst return identical, size-bounded deal views — both reading from the same Cosmos DB store via managed identity.',
      'Entra ID secures access to the MCP endpoint only — the rest of the app (SPA and /api) stays anonymous. Every request’s bearer token is validated against the tenant (signature via JWKS, issuer, audience, tenant, and an optional required scope/role); it’s fail-closed, returning 401/403/503 rather than ever serving deals unauthenticated.',
      'Uses the Streamable HTTP transport (the only transport Copilot Studio supports) in stateless mode, so it scales across replicas. Ships with an OpenAPI spec and a step-by-step Copilot Studio connection guide (mcp/), plus a registered Entra app exposing a deals.read scope.'
    ]
  },
  {
    version: 'v0.19.0',
    date: '2026-07-06',
    image: 'dealroom-app:v25',
    revision: 'ca-dealhub-orch-dev-swc--0000021',
    title: 'Deal Room Analyst — a Foundry agent with all-deals access',
    tag: 'feature',
    highlights: [
      'New Foundry Agent Service agent “deal-room-analyst” (gpt-5-mini) that can answer questions about the fund’s deals — either portfolio-wide (list, search and compare every deal) or locked to a single deal for a focused conversation.',
      'The agent reaches the deals through three function tools — list_deals, get_deal and search_deals — that the app executes against its live Cosmos DB datastore and returns as JSON. So the agent has real, current access to all deals without ever touching the database directly: data-plane access stays scoped to the app’s managed identity.',
      'Per-deal scoping is enforced server-side, not just by prompt: in single-deal mode every tool is hard-filtered to the focused deal, so no other deal’s data can leak into the conversation — even if asked directly. Portfolio mode unlocks cross-deal comparison.',
      'Quota-efficient by design: the focused deal (or the portfolio summary) is pre-loaded into the first turn, so the common question is answered in a single model call, with the tool loop reserved for drill-down and multi-deal compare. Falls back cleanly to a direct read of the pipeline if the model is momentarily rate-limited.',
      'The deals themselves live in Azure Cosmos DB for NoSQL (container “deals”); three real US targets (Allbirds, Dart Transit Group, National CineMedia) were advanced through the gate into launched diligence deals so the analyst has a live portfolio to reason over.'
    ]
  },
  {
    version: 'v0.18.0',
    date: '2026-07-05',
    image: 'dealroom-app:v24',
    revision: 'ca-dealhub-orch-dev-swc--0000020',
    title: 'CxO targets in Ranked Targets · public take-private news',
    tag: 'feature',
    highlights: [
      'Companies discovered through your CxO signals (e.g. Peloton, Allbirds, Fairway) now flow into Ranked Targets on the Deal Sourcing page, scored against the fund mandate and screens alongside news-sourced companies — each tagged with its origin (CxO / News). Previously CxO signal companies lived in a separate store and never reached the ranked list.',
      'CxO-sourced targets are now fully pursuable: “Send to screening” works end-to-end for a company that originated from a CxO signal, materialising it as a screened candidate with the right sector, region and source lineage.',
      'The live news scout now also surfaces publicly-listed US companies that meet the acquisition threshold — small/micro-cap and orphaned public names whose market cap / enterprise value sits inside the fund’s EV band and that are plausible take-private candidates — and captures their ticker so the Morningstar quality check and SEC EDGAR filings resolve cleanly.',
      'Fixed a geography-gate bug: US companies returned with a state-level region (e.g. “California”) were being wrongly excluded when the mandate lists “United States”. The gate is now US-wide-aware, so legitimate domestic targets pass geography and are only gated on genuine mandate breaches (e.g. EV above the $800M cap).'
    ]
  },
  {
    version: 'v0.17.0',
    date: '2026-07-04',
    image: 'dealroom-app:v22',
    revision: 'ca-dealhub-orch-dev-swc--0000018',
    title: 'SEC Form D — free private-company deal signals',
    tag: 'feature',
    highlights: [
      'Private companies now get real filings too: when a desk target isn’t a public SEC filer, the Quantify-with-Filings step falls through to its SEC Form D — the free Regulation D private-placement notice — surfacing the raise size, minimum check, industry and named principals with a clickable SEC.gov link.',
      'New “Scan Form D” sourcing action on the News desk: pulls recent US private companies that just filed a Reg D private placement, ranked into the fund’s permitted sectors and filtered to meaningful raises (≥ $10M) so micro-SPVs don’t clutter the desk — a genuinely new, free private-deal origination signal.',
      'Form D is a capital-event SIGNAL (who is raising money, how much, and who’s behind it), not financial statements — so it powers sourcing of private US targets, complementing the public-company 10-K/10-Q path.',
      'All via SEC EDGAR’s free, keyless APIs (full-text search + submissions), with pacing to respect SEC rate limits and graceful degradation when a query returns nothing.'
    ]
  },
  {
    version: 'v0.16.0',
    date: '2026-07-04',
    image: 'dealroom-app:v21',
    revision: 'ca-dealhub-orch-dev-swc--0000017',
    title: 'US fund mandate · CxO targets on desk · live SEC filings',
    tag: 'feature',
    highlights: [
      'The fund mandate is now a US mid-market buyout fund (USD enterprise-value bands, US geographies) — aligning the gate, screens and news scout with the US targets the desk actually sources. All € figures across the UI are now $.',
      'The Deal Sourcing CxO Signals card now surfaces the actual target companies identified from your M365 signals (name, sector and signal count with an intent dot), not just aggregate counts.',
      'Live SEC EDGAR filings: the “Quantify with Filings” step now pulls REAL 10-K / 10-Q / 8-K / proxy filings from the SEC’s free official API (with clickable SEC.gov links) for public companies, and honestly reports “no public filings — private company” for private targets. SEC EDGAR is added to the Home connectivity panel as a real, free, keyless connector.',
      'Fixed empty CxO & news signals: Cosmos public network access had been disabled (governance reset), so the app had fallen back to empty in-memory mode — re-enabled and re-hydrated; the persisted signals and companies are back.'
    ]
  },
  {
    version: 'v0.15.0',
    date: '2026-07-04',
    image: 'dealroom-app:v20',
    revision: 'ca-dealhub-orch-dev-swc--0000016',
    title: 'Connect MCP data sources from the website',
    tag: 'feature',
    highlights: [
      'You can now connect a provider MCP data source directly from the website — no terminal script. Each connectable source shows a \u201cConnect\u201d button that runs the OAuth sign-in (authorization_code + PKCE) in your browser and stores the refresh token server-side; the token never touches the browser.',
      'Morningstar supports fully self-service in-app sign-in (open dynamic client registration). LSEG and Moody\u2019s require a client pre-registered with the vendor (their sign-in registration is closed) \u2014 the Connect flow now detects this and tells you exactly which redirect URI to register and which env vars to set, then works identically once configured.',
      'Connector tokens are persisted durably in Cosmos (connectors container) and re-materialized on container start, so a captured or rotated refresh token survives restarts and cold starts.',
      'Discovery handles all three providers\u2019 OAuth styles: Morningstar (RFC 8414), LSEG (RFC 9728 \u2192 Refinitiv CIAM) and Moody\u2019s (protected-resource metadata) \u2014 all verified against the live servers.'
    ]
  },
  {
    version: 'v0.14.0',
    date: '2026-07-04',
    image: 'dealroom-app:v19',
    revision: 'ca-dealhub-orch-dev-swc--0000015',
    title: 'Data-source connectivity panel on Home · real tests',
    tag: 'feature',
    highlights: [
      'The data-source connectivity table now lives on the Home page (above the changelog) as a live status panel, instead of being buried in the News & Filings desk.',
      'Test connectivity is now REAL, not faked: Web runs an actual reachability probe of the Bing-grounded agent endpoint, and Morningstar runs a real OAuth token refresh + MCP session handshake — each returning a true connection status, measured latency, and last-sync time. The panel auto-tests on load.',
      'Unwired vendor sources (PitchBook, FactSet, Capital IQ) now honestly report Disconnected instead of a fabricated \u201cConnected\u201d, and LSEG / Moody\u2019s appear as connectable MCP sources awaiting sign-in.',
      'New /api/connectors endpoints back the panel; the old fake per-source latency/last-sync generator was removed.'
    ]
  },
  {
    version: 'v0.13.0',
    date: '2026-07-04',
    image: 'dealroom-app:v18',
    revision: 'ca-dealhub-orch-dev-swc--0000014',
    title: 'Live Morningstar quality check via MCP',
    tag: 'feature',
    highlights: [
      'The O1 \u201cMorningstar quality check\u201d is now REAL: the app calls Morningstar\u2019s MCP server over an OAuth 2.1 (authorization_code + PKCE + refresh_token) connection and returns each target\u2019s live economic-moat, star rating, fair value, financial-health and valuation signals \u2014 no longer a placeholder.',
      'For every identified company the check auto-runs once and the result (rating, 0\u201310 score, trend, risk flags, note) persists to Cosmos. Verified live: Peloton (4-star, no moat, $8.98 fair value, undervalued), Allbirds (no moat, weak financial health).',
      'Entity-match guard: a company only resolves to a Morningstar security on an exact ticker or a confident name match \u2014 otherwise it reports \u201cNo public coverage\u201d rather than risk wrong-company data (e.g. \u201cDenny\u2019s\u201d never resolves to \u201cAvery Dennison\u201d). Private mid-market targets correctly show no public coverage.',
      'New reusable MCP access layer (lib/mcp): OAuth client with a headless refresh-token seam, an MCP Streamable-HTTP JSON-RPC client, and one-time login + verify scripts. The same seam extends to LSEG and Moody\u2019s. /api/config now reports the Morningstar connection state.'
    ]
  },
  {
    version: 'v0.12.0',
    date: '2026-07-04',
    image: 'dealroom-app:v17',
    revision: 'ca-dealhub-orch-dev-swc--0000013',
    title: 'US refocus · live CxO signal ingestion from M365',
    tag: 'feature',
    highlights: [
      'CxO Signals (O1) now ingests REAL executive emails from the analyst\u2019s M365 mailbox and persists them to Cosmos \u2014 grouped by company, with the signatory, title, and intent parsed from each message. All seeded/fake emails, chats, and meeting notes were removed; the explorer starts empty and fills only from real signals.',
      'Seeded three live US targets from CxO outreach \u2014 Peloton, Allbirds, and Fairway Market \u2014 each with two executive emails (CEO/CFO/COO) signalling take-private, growth-partner, or recapitalization/succession intent.',
      'The live news scout was refocused on the United States: the Bing-grounded agent (v4) and query now target US-headquartered mid-market companies covered in US business media (WSJ, Bloomberg, CNBC, Reuters US, Axios, PE Hub), returning USD enterprise values. Verified live (e.g. Denny\u2019s take-private interest, a BMC Helix carve-out, Resonant Clinical Solutions).',
      'New ingestion seam: lib/ingest/signals.js (message\u2192signal transform) + a dedicated signals Cosmos container + a reusable ingest script, all over the managed-identity repository. The news desk was reset to an empty, US-first start.'
    ]
  },
  {
    version: 'v0.11.0',
    date: '2026-07-04',
    image: 'dealroom-app:v16',
    revision: 'ca-dealhub-orch-dev-swc--0000012',
    title: 'Real datastore · empty-start · durable pipeline',
    tag: 'feature',
    highlights: [
      'The app no longer ships with seeded companies or deals — it starts empty and fills up only with real targets discovered by the sourcing methods. All prior demo data was archived to retrievable JSON.',
      'A canonical Company profile is now persisted in Azure Cosmos DB for NoSQL (serverless), reached over managed identity with no keys. Companies discovered by the live news agent, plus deals and a workflow event log, are written through a repository seam and survive restarts and replica cycling.',
      'The live news scout runs on its own dedicated gpt-5-mini deployment (gpt-5-mini-news, 300K TPM) so Bing-grounded, reasoning-heavy searches no longer contend with the interactive app model; the invocation timeout was raised to 150s to accommodate multi-round Bing grounding.',
      'Entity resolution de-duplicates discovered targets by a normalized key (dropping legal suffixes, aliases and punctuation) so re-searching the same company merges into one profile instead of creating duplicates.',
      'Verified end-to-end: an empty boot discovers real European mid-market targets (e.g. Spire Healthcare, Louis Dreyfus Armateurs) via Bing grounding, persists them to Cosmos, and reloads them on the next restart. /api/config now reports the active datastore (cosmos) and news-agent (live) modes.'
    ]
  },
  {
    version: 'v0.10.0',
    date: '2026-07-03',
    image: 'dealroom-app:v14',
    revision: 'ca-dealhub-orch-dev-swc--0000010',
    title: 'Live news search · Bing-grounded Foundry agent',
    tag: 'feature',
    highlights: [
      '“Find more news” is now backed by a standalone Foundry Agent Service agent (deal-room-news-scout) that uses Grounding with Bing Search to find REAL, recent M&A catalysts about actual European mid-market companies matching the fund mandate — no longer a scripted reveal of seeded data.',
      'Discovered companies are injected into the O1 desk with real headlines and clickable source links (e.g. swissinfo.ch, dw.com, grantthornton.co.uk), tagged LIVE; financials are flagged as estimates pending the market-data connectors.',
      'The agent runs on gpt-5-mini (gpt-4o is retired in this environment) and is invoked from the server via managed identity; if the agent is unavailable or rate-limited, the desk gracefully falls back to the seeded reveal.',
      'Groundwork for production: all demo/seed data was archived to retrievable JSON, and a phased plan was set for a real datastore, connectors, ingestion/entity-resolution, persisted workflow state, and RAG grounding.'
    ]
  },
  {
    version: 'v0.9.0',
    date: '2026-07-03',
    image: 'dealroom-app:v12',
    revision: 'ca-dealhub-orch-dev-swc--0000008',
    title: 'Deal Sourcing page rebuilt · signals-forward',
    tag: 'feature',
    highlights: [
      'Deal Sourcing (O1) is restructured: CxO Signals (left) and News & Filings (right) are now their own summary cards at the top — CxO shows email/chat/meeting-note counts and targets identified; News lists the companies in the news with filings pulled and their Morningstar rating. The old Inputs box is gone.',
      'The three-tier investment-mandate hierarchy (GATE · GUIDE · RANK) now lives in a collapsible section that starts collapsed, and the Ranked Targets moved to the bottom of the page.',
      'Analyst research is attached inline to each ranked target — expand a target to see its sector outlook, competitive rank and sell-side view (no more separate Analyst Reports page needed).',
      'News & Filings desk: “In the news” starts collapsed, the Morningstar quality check auto-runs for every identified company, and “Find more news” now auto-runs both filings and the quality check on any newly discovered company. The CxO desk’s target list also starts collapsed.'
    ]
  },
  {
    version: 'v0.8.0',
    date: '2026-07-03',
    image: 'dealroom-app:v11',
    revision: 'ca-dealhub-orch-dev-swc--0000007',
    title: 'Converse-with-agent chat + cleaner cohort desk',
    tag: 'feature',
    highlights: [
      'Each O2/O3 candidate now has a “Converse with Agent” button that opens a persistent floating chat window — dig into the recommendation, risks, comps or next-step diligence in a multi-turn conversation grounded in the candidate record; the thread is saved and resumes when reopened.',
      'Rebuilt the cohort row as a clean vertical card — the per-candidate assessment no longer overlaps adjacent rows (it was inheriting a stray global “advance” sticky style).',
      'Advance / Pass / Park are now equal-sized buttons, and the agent’s recommended action lights up in its own colour — green for advance, amber for park, red for pass.'
    ]
  },
  {
    version: 'v0.7.0',
    date: '2026-07-03',
    image: 'dealroom-app:v10',
    revision: 'ca-dealhub-orch-dev-swc--0000006',
    title: 'O2/O3 agents actually reason on every candidate',
    tag: 'feature',
    highlights: [
      'The Auto Screen (O2) and Triage (O3) agents now run a real per-candidate assessment — the Foundry model reasons against each company at that step and returns a recommended action (advance / pass / park) with a written rationale and confidence, instead of a static rules table.',
      'Assessments fire automatically when you open the desk (all candidates in parallel) and are cached per candidate, with a per-row ↻ re-assess; the recommended action is highlighted and its pass/park reason pre-selects.',
      'Grounded in the fund mandate, hard gate, quant fit score and financials; live Foundry model when configured, deterministic seeded fallback offline. The analyst still makes the final call — the recommendation is advisory.'
    ]
  },
  {
    version: 'v0.6.1',
    date: '2026-07-02',
    image: 'dealroom-app:v9',
    revision: 'ca-dealhub-orch-dev-swc--0000005',
    title: 'Cleaner left-nav: clickable stage headers',
    tag: 'improvement',
    highlights: [
      'The Stage 1 and Stage 2 headers in the left spine are now clickable — Stage 1 opens the full pipeline of Stage-1 candidates, Stage 2 opens the Deals Launched roster.',
      'Removed the redundant PURSUE box, the Pipeline sub-item, and the standalone Deals Launched item from the nav; each is now reached from its stage header.',
      'Each stage header shows a live hint (all Stage-1 candidates · N launched) and an active state when its page is open.'
    ]
  },
  {
    version: 'v0.6.0',
    date: '2026-07-02',
    image: 'dealroom-app:v8',
    revision: 'ca-dealhub-orch-dev-swc--0000004',
    title: 'Stage 1 rebuilt as a cohort funnel',
    tag: 'feature',
    highlights: [
      'Stage 1 is now a real origination funnel — a cohort of ~16 candidates flows through O2 Auto Screen → O3 Triage → O4 Screening Gate, filtered at each step (advance / pass / park) rather than walking one deal end-to-end.',
      'Per-item decisions with the agent proposing knockouts at O2 and ranking at O3; every pass or park captures a reason code (institutional memory).',
      'New Pipeline page lists every Stage-1 candidate with stage, disposition, score and pass reason; the funnel bar is now clickable and deep-links into it.',
      'O1 targets are promoted into the funnel with “Send to screening”; PURSUE at O4 creates a screened deal; Launch moved onto the gate; step 5 is now “Deals Launched”.'
    ]
  },
  {
    version: 'v0.5.0',
    date: '2026-07-01',
    image: 'dealroom-app:v6',
    revision: 'ca-dealhub-orch-dev-swc--0000006',
    title: 'Release history on the homepage',
    tag: 'improvement',
    highlights: [
      'Added this changelog to the bottom of the Home page — a collapsible release timeline (starts collapsed) covering every deployment back to the first running build.',
      'Each entry maps to a real Azure Container Apps image tag and revision.'
    ]
  },
  {
    version: 'v0.4.0',
    date: '2026-07-01',
    image: 'dealroom-app:v4',
    revision: 'ca-dealhub-orch-dev-swc--0000004',
    title: 'Launch Orchestration — the deal workspace made real',
    tag: 'feature',
    highlights: [
      'Every deal now provisions a real diligence workspace with a shapes-and-lines architecture diagram: Teams channels, a SharePoint VDR (13-folder taxonomy), the DD checklist, playbook templates, and three swimlanes — each node links out.',
      'Three diligence swimlanes (Commercial · Tech/AI · Operations) paired with the advisor a firm engages (Bain · West Monroe · AlixPartners), each with a dropdown to assign the owning MD.',
      'Interactive DD request list (Requested → Received → Reviewed) and one-click playbook templates, grounded in real PE practice.',
      'PURSUE moved into the O4 Screening Gate decision desk; "Deals Ready" now splits into Deals Screened (Launch Diligence & Approval) and Deals Launched.'
    ]
  },
  {
    version: 'v0.3.0',
    date: '2026-07-01',
    image: 'dealroom-app:v3',
    revision: 'ca-dealhub-orch-dev-swc--0000003',
    title: 'Home command centre & navigation',
    tag: 'feature',
    highlights: [
      'New Home landing page — the app lands here on refresh instead of an arbitrary deal step, with fund KPIs, the origination funnel and the deals-in-diligence roster.',
      'The active-deal selector moved from the top bar into the left navigation.',
      'New "Deals Ready" post-gate roster, plus a Stage-2 top bar showing how many deals sit in each diligence step.'
    ]
  },
  {
    version: 'v0.2.0',
    date: '2026-07-01',
    image: 'dealroom-app:v2',
    revision: 'ca-dealhub-orch-dev-swc--0000002',
    title: 'Honest, stage-aware metrics',
    tag: 'improvement',
    highlights: [
      'Replaced the arbitrary top-bar numbers with defensible KPIs derived from the live record.',
      'Stage 1 shows the origination funnel — Sourced → Mandate-fit → Triaged → Gate-ready.',
      'Stage 2 shows real deal KPIs: days to IC, diligence %, IC-memo % and IC-readiness, with a stage-local step position.'
    ]
  },
  {
    version: 'v0.1.0',
    date: '2026-07-01',
    image: 'dealroom-app:v1',
    revision: 'ca-dealhub-orch-dev-swc--0000001',
    title: 'Initial release — the running application',
    tag: 'release',
    highlights: [
      'First deployable build: React + TypeScript (Vite) client and a Node/Express API, containerized to Azure Container Apps.',
      'End-to-end deal journey from the process slide — two stages, nine steps and the PURSUE gate — with spine navigation and the Station workbench.',
      'O1 Deal Sourcing depth: CxO Signals explorer (M365 mail/chats/meetings + D365 CRM), the News & Filings sourcing desk with an AI catalyst classifier, and Analyst Reports thesis context.',
      'The sourcing framework — Fund Mandate gates · Investment Themes guide · Screens rank — with the discover-to-score loop.',
      'Live Azure AI Foundry gpt-4o via managed identity, with a seeded demo-mode fallback.'
    ]
  }
];
