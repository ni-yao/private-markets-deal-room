// The end-to-end deal flow from Slide 5 — the single spine the whole app is
// built around: "From the screening funnel into the Deal Collaboration Hub on
// M365". Two stages joined by the PURSUE gate; nine sequential steps. Every step
// is described with the same atoms so the UI can render one uniform "station":
//   what   — what happens in this step (from the slide)
//   agent  — the orchestration agent that does the heavy lifting
//   inputs — what feeds the step
//   produces — the artifacts it hands to the next step
//   m365   — the Microsoft 365 / CRM collaboration surfaces
//   owner  — who owns the decision
//   panel  — optional deal-data panel to surface (lanes / memo / compliance / audit)

export const STAGES = [
  {
    id: 'origination',
    num: 1,
    name: 'Origination & Screening',
    tagline: 'The screening funnel',
    accent: '#2563eb',
    dataSources: [
      { group: 'External', items: ['FactSet', 'Capital IQ', 'PitchBook', 'Morningstar', 'Web', 'Analyst reports'] },
      { group: 'Internal / M365', items: ['Work IQ', 'Dynamics 365 CRM', 'Policies DB', 'Model repository', 'SharePoint'] }
    ],
    skills: ['@deal-screening', '@comps-analysis']
  },
  {
    id: 'diligence',
    num: 2,
    name: 'Diligence & Approval',
    tagline: 'The Deal Collaboration Hub',
    accent: '#c2410c',
    dataSources: [
      { group: 'Work surfaces', items: ['Teams', 'Excel', 'PowerPoint', 'Word', 'SharePoint'] },
      { group: 'Intelligence', items: ['Work IQ', 'Fabric IQ', 'Foundry IQ', 'Purview'] }
    ],
    skills: ['@diligence-planner', '@ic-memo']
  }
];

export const GATE = {
  label: 'PURSUE',
  detail: 'Power Automate spins up the deal collaboration space',
  afterStep: 'O4'
};

export const STEPS = [
  {
    key: 'O1',
    stage: 'origination',
    code: 'O1',
    title: 'Deal Sourcing',
    what: 'The analyst evaluates CxO conversations, emails, key relationships, news, conference notes and financial statements — assessing each signal against pre-defined investment mandates.',
    agent: 'Deal-Sourcing Signal Agent',
    inputs: ['CxO signals', 'News & filings', 'Analyst reports', 'Investment mandates'],
    produces: ['CRM record created', 'Mandate-fit assessment'],
    m365: ['Dynamics 365 CRM'],
    m365Action: 'Create the CRM record as the target moves to auto-screen',
    owner: 'Analyst',
    actionLabel: 'Scan signals & open CRM record'
  },
  {
    key: 'O2',
    stage: 'origination',
    code: 'O2',
    title: 'Auto Screen',
    what: 'The team reviews and validates the sector, technology-lever and supply-chain-risk hypotheses the agents generated — turning raw signals into a cited screening one-pager.',
    agent: 'Target-Screening Agent',
    inputs: ['CRM record', 'Deal estate (Fabric)', 'Internal deal history'],
    produces: ['Screening one-pager (cited)', 'Validated hypotheses'],
    m365: ['Teams', 'Outlook', 'Excel Copilot', 'PowerPoint Copilot'],
    m365Action: 'Collaborate over Teams & email — internally and with target CxOs',
    owner: 'Analyst + Team',
    actionLabel: 'Draft the screening one-pager'
  },
  {
    key: 'O3',
    stage: 'origination',
    code: 'O3',
    title: 'Triage',
    what: 'Precedents are identified and used to generate high-level comps. A strategic-fit assessment against pre-defined criteria is run by the agents and reviewed by the team.',
    agent: 'Pipeline-Prioritization Agent',
    inputs: ['Screening one-pager', 'Precedent transactions', 'Strategic-fit criteria'],
    produces: ['Comparable companies', 'Strategic-fit score'],
    m365: ['Teams', 'Excel Copilot', 'PowerPoint Copilot'],
    m365Action: 'Collaborate over Teams & email — internally and with target CxOs',
    owner: 'Analyst + Team',
    actionLabel: 'Generate comps & strategic-fit score'
  },
  {
    key: 'O4',
    stage: 'origination',
    code: 'O4',
    title: 'Screening Gate',
    what: 'The MD decides based on the inputs. The CRM record is updated to move the deal forward, and the CIM / NDA process is initiated.',
    agent: 'Gateway Orchestration',
    inputs: ['Screening one-pager', 'Comps & fit score', 'MD judgement'],
    produces: ['Screening decision', 'CIM requested', 'NDA initiated', 'CRM updated'],
    m365: ['Teams', 'Outlook', 'Dynamics 365 CRM'],
    m365Action: 'Collaborate over Teams & email — internally and with target CxOs',
    owner: 'Partner / MD',
    actionLabel: 'Record decision · initiate CIM / NDA',
    isGate: true
  },
  {
    key: 'D1',
    stage: 'diligence',
    code: 1,
    title: 'Launch Orchestration',
    what: 'On "pursue", the deal lead requests the deal workspace, prepares templates and assigns ownership across the diligence swimlanes.',
    agent: 'Diligence-Planner Agent',
    inputs: ['Screening decision', 'DD playbook', 'Comparable deals'],
    produces: ['Deal workspace (Teams + SharePoint)', 'DD checklist & templates', 'Lane owners assigned'],
    m365: ['Teams', 'SharePoint', 'Power Automate'],
    m365Action: 'Event-triggered Teams + SharePoint creation',
    owner: 'Partner / MD',
    actionLabel: 'Provision workspace & assign owners'
  },
  {
    key: 'D2',
    stage: 'diligence',
    code: 2,
    title: 'Diligence',
    what: 'The team conducts diligence in their swimlanes — commercial, tech / AI and operations — in parallel, each supported by its own orchestrated agents on the shared record.',
    agent: 'Orchestrated agents (per swimlane)',
    inputs: ['CIM & financials', 'Data room', 'Deal estate (Fabric)'],
    produces: ['Commercial findings', 'Tech / AI findings', 'Operations findings'],
    m365: ['Excel', 'PowerPoint', 'Work IQ', 'Fabric IQ', 'Foundry IQ'],
    m365Action: 'Swimlane collaboration across Teams, Excel & PowerPoint',
    owner: 'Lead MD',
    actionLabel: 'Run the parallel diligence lanes',
    panel: 'lanes'
  },
  {
    key: 'D3',
    stage: 'diligence',
    code: 3,
    title: 'Synthesis',
    what: 'The team synthesizes the diligence findings into an IC memo, collaborating in real time with consistent, cited figures pulled from the live record.',
    agent: 'IC-Memo Agent',
    inputs: ['Diligence findings', 'Deal model', 'Live record'],
    produces: ['IC memo (cited)'],
    m365: ['Word', 'Excel', 'PowerPoint', 'Work IQ'],
    m365Action: 'Real-time co-authoring in Word, Excel & PowerPoint',
    owner: 'Analyst',
    actionLabel: 'Synthesize the IC memo',
    panel: 'memo'
  },
  {
    key: 'D4',
    stage: 'diligence',
    code: 4,
    title: 'Approval & Execution',
    what: 'The IC reviews and approves the memo. Compliance checks clear, the CRM and other records are updated, and next steps are triggered.',
    agent: 'Approval-Orchestration Agent',
    inputs: ['IC memo', 'Compliance checks', 'IC decision'],
    produces: ['IC decision', 'CRM & records updated'],
    m365: ['Teams Copilot', 'Dynamics 365 CRM', 'SharePoint'],
    m365Action: 'Capture the decision in Teams; write conditions back to CRM',
    owner: 'Analyst + MDs',
    actionLabel: 'Route approval & update records',
    panel: 'compliance'
  },
  {
    key: 'D5',
    stage: 'diligence',
    code: 5,
    title: 'Archive',
    what: 'The team archives the deal documents with a full, lineage-tracked audit trail for the regulated record.',
    agent: 'Records & Compliance agents',
    inputs: ['Approved memo', 'All deal artifacts'],
    produces: ['Archived data room', 'Purview audit trail'],
    m365: ['SharePoint', 'Purview'],
    m365Action: 'Archive to SharePoint with a Purview audit trail',
    owner: 'Analyst',
    actionLabel: 'Archive with full audit trail',
    panel: 'audit'
  }
];

export const STEP_KEYS = STEPS.map((s) => s.key);

export function stepIndex(key) {
  return STEP_KEYS.indexOf(key);
}

export function stepByKey(key) {
  return STEPS.find((s) => s.key === key) || null;
}

export function stageById(id) {
  return STAGES.find((s) => s.id === id) || null;
}

// Backwards-compatible lifecycle list used by any legacy consumers.
export const STAGE_ORDER = STEPS.map((s) => ({ key: s.key, label: s.title, phase: s.stage }));

export const FLOW = { stages: STAGES, steps: STEPS, gate: GATE };
