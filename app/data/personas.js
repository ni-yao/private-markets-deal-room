// Persona definitions — the five PE roles the Deal Room augments.
// Each persona reframes the same governed deal record around its lane and
// exposes AI quick-actions that shorten the path to the Investment Committee.
// The end-to-end lifecycle / stages live in ./flow.js.

export const LANES = {
  commercial: { label: 'Commercial', short: 'Commercial DD' },
  techai: { label: 'Tech / AI', short: 'Tech & AI DD' },
  operations: { label: 'Operations', short: 'Operations DD' }
};

export const personas = [
  {
    id: 'analyst',
    name: 'Maya Olsen',
    title: 'Analyst — Deal Associate',
    short: 'Analyst',
    color: '#2563eb',
    lane: 'screening',
    focus: 'Sources & screens targets, finds precedents, builds models and materials on the shared record.',
    stages: ['O1', 'O2', 'O3', 'D1', 'D2', 'D3'],
    actions: [
      { id: 'draft-screen', label: 'Draft screening one-pager', target: 'memo', section: 'thesis', hours: 6, blurb: 'Cited screen from the deal estate.' },
      { id: 'gen-comps', label: 'Generate comparable companies', target: 'figures', hours: 4, blurb: 'Trading & transaction comps.' },
      { id: 'summarize-cim', label: 'Summarize the CIM', target: 'documents', hours: 5, blurb: 'Key facts + anomalies in minutes.' }
    ]
  },
  {
    id: 'retail-md',
    name: 'James Whitfield',
    title: 'Retail Sector MD — Consumer & Retail',
    short: 'Retail MD',
    color: '#0d9488',
    lane: 'commercial',
    focus: 'Owns the commercial lane — market, competitor and customer diligence into the IC decision.',
    stages: ['O3', 'D2', 'D4'],
    actions: [
      { id: 'commercial-dd', label: 'Synthesize commercial DD', target: 'lane', lane: 'commercial', hours: 12, blurb: 'Market, share & growth thesis, cited.' },
      { id: 'customer-risk', label: 'Assess customer concentration', target: 'lane', lane: 'commercial', hours: 5, blurb: 'Revenue concentration & churn risk.' }
    ]
  },
  {
    id: 'ai-md',
    name: 'Dr. Priya Nair',
    title: 'AI MD — AI & Digital Value',
    short: 'AI MD',
    color: '#7c3aed',
    lane: 'techai',
    focus: 'Owns the tech/AI lane — scores AI-readiness and shapes the value-creation plan early.',
    stages: ['O3', 'D2', 'D3', 'D4'],
    actions: [
      { id: 'ai-readiness', label: 'Score AI readiness', target: 'lane', lane: 'techai', hours: 10, blurb: 'Data, talent, stack & adoption score.' },
      { id: 'value-levers', label: 'Draft value-creation levers', target: 'lane', lane: 'techai', hours: 8, blurb: 'Quantified AI / digital EBITDA levers.' }
    ]
  },
  {
    id: 'supply-md',
    name: 'Diego Marquez',
    title: 'Supply Chain MD — Operations',
    short: 'Supply MD',
    color: '#ea580c',
    lane: 'operations',
    focus: 'Owns the operations lane — supplier mapping, COGS, tariff and concentration risk, up front.',
    stages: ['O3', 'D2', 'D3', 'D4'],
    actions: [
      { id: 'supply-risk', label: 'Map supply-chain & tariff risk', target: 'lane', lane: 'operations', hours: 11, blurb: 'Supplier map + tariff exposure.' },
      { id: 'cogs-bridge', label: 'Build COGS bridge', target: 'lane', lane: 'operations', hours: 7, blurb: 'Cost walk & margin opportunity.' }
    ]
  },
  {
    id: 'partner',
    name: 'Eleanor Bishop',
    title: 'Partner / MD — Deal Sponsor',
    short: 'Partner',
    color: '#b91c1c',
    lane: 'ic',
    focus: 'Sources & sponsors the deal, sets gate priorities, chairs the IC approval.',
    stages: ['O1', 'O4', 'D3', 'D4'],
    actions: [
      { id: 'ic-memo', label: 'Generate IC memo draft', target: 'memo', section: 'recommendation', hours: 16, blurb: 'Full cited memo from the live record.' },
      { id: 'ic-readiness', label: 'Run IC readiness check', target: 'compliance', hours: 4, blurb: 'Gaps, SFDR / ILPA & open risks.' },
      { id: 'ic-deck', label: 'Outline the IC deck', target: 'memo', section: 'recommendation', hours: 6, blurb: 'Slide spine with source-traced Q&A.' }
    ]
  }
];

export const personaById = Object.fromEntries(personas.map((p) => [p.id, p]));
