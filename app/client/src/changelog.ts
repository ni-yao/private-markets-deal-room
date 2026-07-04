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
    version: 'v0.18.0',
    date: '2026-07-05',
    image: 'dealroom-app:v24',
    revision: 'ca-dealroom-orch-dev-swc--0000020',
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
    revision: 'ca-dealroom-orch-dev-swc--0000018',
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
    revision: 'ca-dealroom-orch-dev-swc--0000017',
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
    revision: 'ca-dealroom-orch-dev-swc--0000016',
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
    revision: 'ca-dealroom-orch-dev-swc--0000015',
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
    revision: 'ca-dealroom-orch-dev-swc--0000014',
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
    revision: 'ca-dealroom-orch-dev-swc--0000013',
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
    revision: 'ca-dealroom-orch-dev-swc--0000012',
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
    revision: 'ca-dealroom-orch-dev-swc--0000010',
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
    revision: 'ca-dealroom-orch-dev-swc--0000008',
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
    revision: 'ca-dealroom-orch-dev-swc--0000007',
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
    revision: 'ca-dealroom-orch-dev-swc--0000006',
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
    revision: 'ca-dealroom-orch-dev-swc--0000005',
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
    revision: 'ca-dealroom-orch-dev-swc--0000004',
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
    revision: 'ca-dealroom-orch-dev-swc--0000006',
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
    revision: 'ca-dealroom-orch-dev-swc--0000004',
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
    revision: 'ca-dealroom-orch-dev-swc--0000003',
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
    revision: 'ca-dealroom-orch-dev-swc--0000002',
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
    revision: 'ca-dealroom-orch-dev-swc--0000001',
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
