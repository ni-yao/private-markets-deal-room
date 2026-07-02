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
