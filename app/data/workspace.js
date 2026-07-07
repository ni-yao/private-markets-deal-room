// Deal workspace factory — models what a PE firm actually stands up at the
// "Launch Orchestration" (D1) kickoff, grounded in industry practice:
//
//  • A Microsoft Teams "deal space" with one channel per diligence workstream
//    (General, Commercial DD, Financial/QoE, Legal, Tech/AI DD, Operations DD,
//    Tax, IC Prep).
//  • A SharePoint document library / VDR with the standard 13-folder taxonomy
//    (Datasite/Ansarada-style index).
//  • The firm's playbook templates instantiated for the deal (DD request list,
//    working group list, issues log, IC memo, etc.).
//  • A DD request list (checklist) organised by workstream, each item tracked
//    requested → received → reviewed.
//  • Three INTERNAL swimlanes owned by sector MDs, each paired with the external
//    advisor a firm would typically engage:
//       Commercial DD  → Bain / McKinsey / LEK        (Sector MD)
//       Tech / AI DD    → West Monroe / Mandiant       (AI MD)
//       Operations DD   → AlixPartners / A&M           (Supply-chain MD)
//
// Actual Microsoft Graph provisioning of the Team/site is gated on tenant admin
// consent; until then these are real in-app resources with correctly-formed
// deep links out to the tenant. buildWorkspace() is the single seam where live
// Graph calls would slot in.

const TENANT = 'mngenvmcap336646';

// The MDs / workstream leads a lane can be assigned to (the dropdown options).
// The first three are the sector MDs that also have a conversational Foundry
// persona agent; the four functional leads (finance / legal / tax / ESG) own the
// functional diligence lanes that are first-class to IC readiness but are managed
// by the deal team through the workspace rather than by a dedicated agent.
export const MD_OPTIONS = [
  { id: 'retail-md', name: 'James Whitfield', title: 'Retail Sector MD' },
  { id: 'ai-md', name: 'Dr. Priya Nair', title: 'AI MD' },
  { id: 'supply-md', name: 'Diego Marquez', title: 'Supply-chain MD' },
  { id: 'finance-md', name: 'Sarah Chen', title: 'Finance Director (QoE)' },
  { id: 'legal-md', name: 'Marcus Webb', title: 'General Counsel' },
  { id: 'tax-md', name: 'Ana Torres', title: 'Tax Director' },
  { id: 'esg-md', name: 'Leah Okafor', title: 'ESG Lead' },
  { id: 'partner', name: 'Eleanor Bishop', title: 'Partner / Deal Sponsor' }
];

export const mdName = (id) => (MD_OPTIONS.find((m) => m.id === id) || {}).name || 'Unassigned';

// Teams channels. A deal gets its own Team, created via the user-consentable
// Team.Create scope; the standard team template provisions exactly ONE channel:
// General. Creating additional per-workstream channels needs Channel.Create,
// which is admin-consent-gated in this tenant (users can only consent to
// low-impact scopes). Rather than present workstream channels that don't exist
// (a false impression), we surface only the real General channel — all
// workstream discussion happens in the deal team, and each workstream's
// documents live in its own SharePoint VDR folder.
const CHANNELS = [
  { name: 'General', purpose: 'Deal team — all workstream discussion, IC updates & sponsor comms' }
];

// SharePoint / VDR folder taxonomy (Datasite/Ansarada-style index). Standard
// M&A data-room sections — corporate, financials, tax, commercial, contracts, IP,
// real property, HR, IT, operations, insurance, environmental/regulatory — plus an
// internal IC-materials folder for the deal team's own workspace.
const FOLDERS = [
  '00_Administration', '01_Corporate & Legal', '02_Financial Information',
  '03_Commercial & Sales', '04_Tax', '05_Intellectual Property',
  '06_Real Property & Assets', '07_Contracts', '08_Employment & HR',
  '09_IT & Technology', '10_Operations', '11_Insurance',
  '12_Environmental & Regulatory', '13_IC Materials'
];

// Playbook templates instantiated at kickoff.
const TEMPLATES = [
  { id: 'ddrl', name: 'DD Request List', type: 'Excel', ext: 'xlsx', desc: 'Master information request sent to the seller, by workstream.' },
  { id: 'wgl', name: 'Working Group List', type: 'Excel', ext: 'xlsx', desc: 'Every party — firm, advisors, sell-side, management — with roles & contacts.' },
  { id: 'timeline', name: 'DD Timeline & Project Plan', type: 'Excel', ext: 'xlsx', desc: 'Workstream milestones anchored backward from the IC date.' },
  { id: 'issues', name: 'Issues Log', type: 'Excel', ext: 'xlsx', desc: 'Open items by workstream, severity and resolution owner.' },
  { id: 'contracts', name: 'Contract Review Tracker', type: 'Excel', ext: 'xlsx', desc: 'Material contracts — change-of-control, assignment, expiry.' },
  { id: 'lbo', name: 'LBO Model', type: 'Excel', ext: 'xlsx', desc: 'Leveraged-buyout model; QoE feeds the assumptions.' },
  { id: 'icmemo', name: 'IC Memo Template', type: 'Word', ext: 'docx', desc: 'Fund-standard IC memo skeleton (thesis → recommendation).' },
  { id: 'icdeck', name: 'IC Deck Template', type: 'PowerPoint', ext: 'pptx', desc: 'Committee presentation, ~15–25 slides.' }
];

// DD request-list skeleton — the sections a real firm sends the seller. Each
// item is tagged with the internal swimlane that owns follow-up (where relevant).
const CHECKLIST = [
  {
    id: 'corp', section: '1 · Corporate & Organizational',
    items: [
      { id: 'corp-1', text: 'Certificate of incorporation, articles / bylaws' },
      { id: 'corp-2', text: 'Legal org chart — all subsidiaries, jurisdictions, ownership %' },
      { id: 'corp-3', text: 'Fully-diluted capitalization table (options, warrants, converts)' },
      { id: 'corp-4', text: 'Board & shareholder minutes (last 3 years)' }
    ]
  },
  {
    id: 'fin', section: '2 · Financial Information (QoE)', lane: 'financial', workstream: 'Financial DD',
    items: [
      { id: 'fin-1', text: 'Audited financials — P&L, BS, CF (last 5 FY)' },
      { id: 'fin-2', text: 'Monthly management accounts (last 24 months)' },
      { id: 'fin-3', text: 'EBITDA bridge: reported → normalized, add-backs itemized' },
      { id: 'fin-4', text: 'Working-capital analysis (AR/AP/inventory aging)' },
      { id: 'fin-5', text: 'Debt schedule — facility, maturity, covenants' }
    ]
  },
  {
    id: 'comm', section: '3 · Commercial & Market', lane: 'commercial',
    items: [
      { id: 'comm-1', text: 'Top-50 customers by LTM revenue — tenure, contract end' },
      { id: 'comm-2', text: 'Retention / net-revenue-retention analysis (3 years)' },
      { id: 'comm-3', text: 'Pricing model & rate card' },
      { id: 'comm-4', text: 'Sales pipeline (CRM export) — stage, value, close date' }
    ]
  },
  {
    id: 'legal', section: '4 · Legal & Regulatory', lane: 'legal',
    items: [
      { id: 'legal-1', text: 'Schedule of material contracts — change-of-control flags' },
      { id: 'legal-2', text: 'IP portfolio — patents, trademarks, chain of title' },
      { id: 'legal-3', text: 'Litigation schedule — pending, threatened, settled' },
      { id: 'legal-4', text: 'Regulatory licenses & permits' }
    ]
  },
  {
    id: 'tax', section: '5 · Tax', lane: 'tax',
    items: [
      { id: 'tax-1', text: 'Corporate income tax returns (last 4 years)' },
      { id: 'tax-2', text: 'Tax audit correspondence & assessments' },
      { id: 'tax-3', text: 'Transfer-pricing documentation' }
    ]
  },
  {
    id: 'tech', section: '6 · Technology & IT', lane: 'techai',
    items: [
      { id: 'tech-1', text: 'IT architecture & core systems inventory (ERP/CRM)' },
      { id: 'tech-2', text: 'Cybersecurity posture — pen-test, SOC 2 / ISO 27001' },
      { id: 'tech-3', text: 'Data governance & GDPR readiness' },
      { id: 'tech-4', text: 'AI/ML capability & proprietary-data assessment' }
    ]
  },
  {
    id: 'ops', section: '7 · Operations & Supply Chain', lane: 'operations',
    items: [
      { id: 'ops-1', text: 'Top-20 suppliers by spend + contracts' },
      { id: 'ops-2', text: 'Manufacturing / service-delivery process docs' },
      { id: 'ops-3', text: 'COGS bridge & margin-improvement opportunities' },
      { id: 'ops-4', text: 'Logistics & distribution structure' }
    ]
  },
  {
    id: 'people', section: '8 · HR · ESG · Insurance', lane: 'esg',
    items: [
      { id: 'people-1', text: 'Org chart, management bios, key-person map' },
      { id: 'people-2', text: 'Compensation, benefits & change-of-control terms' },
      { id: 'people-3', text: 'SFDR Article 8/9 questionnaire & PAI indicators' },
      { id: 'people-4', text: 'Insurance program summary + 5-yr claims history' }
    ]
  }
];

// The internal diligence swimlanes stood up at kickoff, each owned by an MD /
// functional lead and paired with the external advisor a firm would engage. The
// three sector lanes (commercial / tech-AI / operations) plus the four functional
// lanes (financial-QoE / legal / tax / ESG) that are first-class to IC readiness.
const SWIMLANE_DEFAULTS = [
  {
    lane: 'commercial', label: 'Commercial DD', md: 'retail-md',
    advisor: 'Bain & Company', advisorType: 'Strategy consultant (CDD)',
    scope: ['Market sizing & share', 'Customer concentration & churn', 'Pricing power', '15–30 customer interviews'],
    deliverable: 'CDD report + market model'
  },
  {
    lane: 'financial', label: 'Financial / QoE', md: 'finance-md',
    advisor: 'EY (Ernst & Young)', advisorType: 'Quality of Earnings (QoE)',
    scope: ['EBITDA bridge & add-back review', 'Revenue recognition & quality', 'Net working capital & debt-like items', 'Management-accounts reliability'],
    deliverable: 'QoE report + normalized EBITDA'
  },
  {
    lane: 'legal', label: 'Legal DD', md: 'legal-md',
    advisor: 'Kirkland & Ellis', advisorType: 'Legal counsel (LDD)',
    scope: ['Material contracts & change-of-control', 'Corporate & capitalization', 'Litigation & disputes', 'Regulatory licenses & permits'],
    deliverable: 'Legal DD report + issues list'
  },
  {
    lane: 'tax', label: 'Tax DD', md: 'tax-md',
    advisor: 'PwC', advisorType: 'Tax structuring & DD',
    scope: ['Historical tax exposures', 'Transfer pricing', 'Structuring & step-plan', 'Tax attributes (NOLs, credits)'],
    deliverable: 'Tax DD report + structuring memo'
  },
  {
    lane: 'techai', label: 'Tech / AI DD', md: 'ai-md',
    advisor: 'West Monroe', advisorType: 'Tech & cyber advisory',
    scope: ['Architecture & core systems', 'Cybersecurity posture', 'Data governance', 'AI-readiness & data moat'],
    deliverable: 'Tech/AI DD report + AI scorecard'
  },
  {
    lane: 'operations', label: 'Operations DD', md: 'supply-md',
    advisor: 'AlixPartners', advisorType: 'Operations advisory (ODD)',
    scope: ['Supplier map & concentration', 'Capacity & utilisation', 'COGS bridge', 'Integration readiness'],
    deliverable: 'ODD report + supplier map'
  },
  {
    lane: 'esg', label: 'ESG / Environmental', md: 'esg-md',
    advisor: 'ERM', advisorType: 'ESG & environmental advisory',
    scope: ['SFDR Article 8/9 & PAI indicators', 'Environmental liabilities', 'Health & safety', 'Governance & DEI'],
    deliverable: 'ESG DD report + PAI baseline'
  }
];

// Lane → SharePoint VDR folder the swimlane's documents live in.
const LANE_FOLDER = {
  commercial: '03_Commercial & Sales',
  financial: '02_Financial Information',
  legal: '01_Corporate & Legal',
  tax: '04_Tax',
  techai: '09_IT & Technology',
  operations: '10_Operations',
  esg: '12_Environmental & Regulatory'
};

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Distribute checklist statuses so a more-advanced deal looks further along.
function seedChecklist(maturity) {
  const cycle = ['requested', 'received', 'reviewed'];
  return CHECKLIST.map((sec) => ({
    ...sec,
    items: sec.items.map((it, i) => {
      // deterministic pseudo-progress based on maturity (0..1)
      const r = (i + 1) / (sec.items.length + 1);
      let status = 'requested';
      if (maturity >= r + 0.15) status = 'reviewed';
      else if (maturity >= r - 0.15) status = 'received';
      return { ...it, status: cycle.includes(status) ? status : 'requested' };
    })
  }));
}

export function buildWorkspace(deal, opts = {}) {
  const slug = slugify(deal.id || deal.company);
  const site = `DealRoom-${slug}`;
  const sharePointUrl = `https://${TENANT}.sharepoint.com/sites/${site}`;
  const teamsUrl = `https://teams.microsoft.com/l/team/19%3Adeal-${slug}%40thread.tacv2/conversations?groupId=deal-${slug}&tenantId=${TENANT}`;
  const maturity = opts.maturity ?? 0;

  // Assign each swimlane a channel + folder deep link.
  const swimlanes = SWIMLANE_DEFAULTS.map((s) => {
    const folder = LANE_FOLDER[s.lane] || '13_IC Materials';
    return {
      ...s,
      channelUrl: `${teamsUrl}&channel=${encodeURIComponent(s.label)}`,
      folderUrl: `${sharePointUrl}/Shared%20Documents/${encodeURIComponent(folder)}`
    };
  });

  return {
    createdAt: opts.createdAt || new Date().toISOString(),
    provisionedBy: 'Gate-Orchestration Agent · Power Automate',
    icDate: deal.targetICDate,
    teamsUrl,
    teamsProvisioned: false,
    teamsChannelName: null,
    sharePointUrl,
    channels: CHANNELS.map((c) => ({ ...c, url: `${teamsUrl}&channel=${encodeURIComponent(c.name)}` })),
    folders: FOLDERS.map((f) => ({ name: f, url: `${sharePointUrl}/Shared%20Documents/${encodeURIComponent(f)}` })),
    templates: TEMPLATES.map((t) => ({
      ...t,
      url: `${sharePointUrl}/Shared%20Documents/00_Administration/${encodeURIComponent(`${t.name} — ${deal.company}.${t.ext}`)}`
    })),
    checklist: seedChecklist(maturity),
    swimlanes
  };
}

export function checklistStats(workspace) {
  if (!workspace || !workspace.checklist) return { total: 0, reviewed: 0, received: 0, requested: 0, pct: 0 };
  let total = 0, reviewed = 0, received = 0, requested = 0;
  for (const sec of workspace.checklist) {
    for (const it of sec.items) {
      total++;
      if (it.status === 'reviewed') reviewed++;
      else if (it.status === 'received') received++;
      else requested++;
    }
  }
  const pct = total ? Math.round((100 * (reviewed + received * 0.5)) / total) : 0;
  return { total, reviewed, received, requested, pct };
}

// Canonical lane order (sector + functional), used to keep workstreams and
// swimlanes in a stable, readable sequence across the app.
export const LANE_ORDER = ['commercial', 'financial', 'legal', 'tax', 'techai', 'operations', 'esg'];

// The default workstreams a screened deal is created with — one per first-class
// diligence lane, each owned by its MD / functional lead. Single source of truth
// reused by makeScreenedDeal and the backfill so existing deals gain the lanes.
export const WORKSTREAM_DEFAULTS = SWIMLANE_DEFAULTS.map((s) => ({ lane: s.lane, owner: s.md }));

// Backfill: add any first-class swimlane missing from an existing workspace (for
// deals provisioned before the functional lanes became first-class), preserving
// existing swimlanes and their assignments. Returns true if it changed anything.
export function ensureWorkspaceSwimlanes(workspace, deal) {
  if (!workspace) return false;
  const slug = slugify(deal.id || deal.company);
  const sharePointUrl = workspace.sharePointUrl || `https://${TENANT}.sharepoint.com/sites/DealRoom-${slug}`;
  const teamsUrl = workspace.teamsUrl || `https://teams.microsoft.com/l/team/19%3Adeal-${slug}%40thread.tacv2/conversations?groupId=deal-${slug}&tenantId=${TENANT}`;
  const provisionedChannel = workspace.teamsProvisioned && workspace.teamsUrl ? workspace.teamsUrl : null;
  workspace.swimlanes = workspace.swimlanes || [];
  const have = new Set(workspace.swimlanes.map((s) => s.lane));
  let changed = false;
  for (const s of SWIMLANE_DEFAULTS) {
    if (have.has(s.lane)) continue;
    const folder = LANE_FOLDER[s.lane] || '13_IC Materials';
    workspace.swimlanes.push({
      ...s,
      channelUrl: provisionedChannel || `${teamsUrl}&channel=${encodeURIComponent(s.label)}`,
      folderUrl: `${sharePointUrl}/Shared%20Documents/${encodeURIComponent(folder)}`
    });
    changed = true;
  }
  if (changed) {
    const rank = (l) => { const i = LANE_ORDER.indexOf(l); return i < 0 ? 99 : i; };
    workspace.swimlanes.sort((a, b) => rank(a.lane) - rank(b.lane));
  }
  return changed;
}
