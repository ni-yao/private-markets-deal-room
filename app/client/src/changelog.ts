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
