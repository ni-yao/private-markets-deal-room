// Seeded deal estate — realistic private-equity opportunities at different
// lifecycle stages. The lead deal (Nordic Grocery Group) is richly populated so
// the workspace is compelling on first open; the rest show the pipeline spread.

export const seedDeals = [
  {
    id: 'nordic-grocery',
    company: 'Nordic Grocery Group',
    sector: 'Consumer & Retail',
    subSector: 'Grocery / Convenience',
    hq: 'Stockholm, Sweden',
    dealSize: 820,
    currency: 'EUR',
    stage: 'D2',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(12),
    baselineDays: 45,
    thesis:
      'Buy-and-build of a #2 Nordic convenience grocer with a proven private-label margin engine and an under-monetised loyalty dataset. Thesis: accelerate own-brand penetration and stand up an AI-driven assortment & pricing capability to close a 230 bps EBITDA-margin gap vs. the regional leader.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '€1.94B', source: 'CIM p.12', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '€148M', source: 'CIM p.14 / QoE draft', confidence: 'high' },
      { label: 'EBITDA margin', value: '7.6%', source: 'Derived', confidence: 'high' },
      { label: 'Entry multiple', value: '8.4x EV/EBITDA', source: 'Deal model v3', confidence: 'medium' },
      { label: 'Private-label mix', value: '21%', source: 'CIM p.31', confidence: 'high' },
      { label: 'Loyalty members', value: '3.1M', source: 'Data room / mgmt', confidence: 'medium' }
    ],
    workstreams: [
      {
        lane: 'commercial',
        owner: 'retail-md',
        status: 'in_progress',
        progress: 55,
        findings: [
          { text: 'Grocery market growing 3.1% CAGR; convenience format outpacing at 5.4% — tailwind supports the base case.', severity: 'positive', source: 'Euromonitor / Commercial DD' },
          { text: 'Top-10 store catchments overlap 18% with the leader; cannibalisation risk in the buy-and-build is contained.', severity: 'neutral', source: 'Geospatial analysis' }
        ]
      },
      {
        lane: 'techai',
        owner: 'ai-md',
        status: 'in_progress',
        progress: 40,
        findings: [
          { text: 'Loyalty data is rich (3.1M members, 4yr history) but siloed in legacy POS; needs a lakehouse before AI pricing is viable.', severity: 'caution', source: 'Tech/AI DD' }
        ]
      },
      {
        lane: 'operations',
        owner: 'supply-md',
        status: 'not_started',
        progress: 0,
        findings: []
      }
    ],
    documents: [
      { name: 'Confidential Information Memorandum.pdf', type: 'CIM', pages: 142, status: 'parsed' },
      { name: 'Audited Financials 2021-2024.xlsx', type: 'Financials', pages: 0, status: 'parsed' },
      { name: 'Customer Cohort Analysis.pdf', type: 'Commercial', pages: 38, status: 'parsing' },
      { name: 'Supplier Master & Contracts.zip', type: 'Operations', pages: 0, status: 'uploaded' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Convenience-led consolidation play with a private-label and data-monetisation upside. (Draft — run the screening agent to refresh from the live record.)', citations: ['CIM p.12', 'Deal model v3'] },
      { key: 'market', title: 'Market & commercial', status: 'in_progress', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'in_progress' },
      { check: 'ILPA reporting template mapping', framework: 'ILPA', status: 'pending' },
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'Data-room sensitivity labelling', framework: 'Purview', status: 'passed' }
    ],
    activity: [
      { actor: 'Document-Intelligence Agent', action: 'Parsed CIM (142 pp) → termsheet + 11 KPIs to Fabric', when: hoursAgo(20) },
      { actor: 'James Whitfield', action: 'Opened Commercial DD lane', when: hoursAgo(18) },
      { actor: 'Diligence-Planner Agent', action: 'Drafted DD checklist from 3 comparable deals', when: hoursAgo(17) }
    ],
    hoursSaved: 26
  },
  {
    id: 'heliopack',
    company: 'HelioPack Sustainable Packaging',
    sector: 'Industrials',
    subSector: 'Sustainable Packaging',
    hq: 'Rotterdam, Netherlands',
    dealSize: 410,
    currency: 'EUR',
    stage: 'D1',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(26),
    baselineDays: 45,
    thesis:
      'Carve-out of a fibre-based packaging leader riding the plastics-substitution regulatory wave. Thesis: consolidate fragmented EU converters and re-rate on ESG-aligned demand, with tariff-exposed input costs the central diligence question.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '€512M', source: 'Teaser', confidence: 'medium' },
      { label: 'EBITDA (LTM)', value: '€61M', source: 'Teaser', confidence: 'medium' },
      { label: 'EBITDA margin', value: '11.9%', source: 'Derived', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'techai', owner: 'ai-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'in_progress', progress: 25, findings: [
        { text: 'Pulp inputs 38% sourced from tariff-exposed regions; hedging and dual-sourcing are the swing factor on margin.', severity: 'caution', source: 'Ops DD (prelim)' }
      ] }
    ],
    documents: [
      { name: 'Teaser & Process Letter.pdf', type: 'Teaser', pages: 18, status: 'parsed' },
      { name: 'Management Presentation.pdf', type: 'CIM', pages: 76, status: 'parsing' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Plastics-substitution consolidation play. (Draft.)', citations: ['Teaser'] },
      { key: 'market', title: 'Market & commercial', status: 'empty', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'SFDR Article 9 candidate review', framework: 'SFDR', status: 'pending' },
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'in_progress' }
    ],
    activity: [
      { actor: 'Gate-Orchestration Agent', action: 'Provisioned diligence workspace + data room', when: hoursAgo(40) },
      { actor: 'Diego Marquez', action: 'Flagged tariff exposure for early review', when: hoursAgo(30) }
    ],
    hoursSaved: 9
  },
  {
    id: 'lumen-analytics',
    company: 'Lumen Analytics',
    sector: 'Software',
    subSector: 'Vertical SaaS / Data',
    hq: 'Dublin, Ireland',
    dealSize: 240,
    currency: 'EUR',
    stage: 'D3',
    sponsorPersona: 'ai-md',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(9),
    baselineDays: 45,
    thesis:
      'High-growth vertical-SaaS provider with an emerging AI product line. Thesis: a platform asset to anchor a digital value-creation roadmap; diligence confirmed net-revenue retention and proprietary-data defensibility — now synthesising the IC memo.',
    keyFigures: [
      { label: 'ARR', value: '€58M', source: 'QoE', confidence: 'high' },
      { label: 'Growth (YoY)', value: '41%', source: 'QoE', confidence: 'high' },
      { label: 'NRR', value: '118%', source: 'Commercial DD', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'NRR of 118% verified against cohort data; land-and-expand motion is durable.', severity: 'positive', source: 'Commercial DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'in_progress', progress: 80, findings: [
        { text: 'Proprietary training data (7yr labelled corpus) gives a real moat beyond the GPT layer.', severity: 'positive', source: 'Tech/AI DD' }
      ] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [] }
    ],
    documents: [
      { name: 'Investment Screen.pdf', type: 'Screen', pages: 6, status: 'parsed' },
      { name: 'Quality of Earnings.pdf', type: 'Financials', pages: 44, status: 'parsed' },
      { name: 'Tech & Data DD.pdf', type: 'Tech', pages: 52, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Vertical SaaS platform with a defensible proprietary-data moat and 41% growth.', citations: ['QoE', 'Tech/AI DD'] },
      { key: 'market', title: 'Market & commercial', status: 'approved', content: 'NRR 118%; durable land-and-expand.', citations: ['Commercial DD'] },
      { key: 'value-creation', title: 'Value creation plan', status: 'in_progress', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'draft', content: 'Model-cost inflation; founder key-person.', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'passed' },
      { check: 'AI Act risk classification', framework: 'EU AI Act', status: 'in_progress' }
    ],
    activity: [
      { actor: 'IC-Memo Agent', action: 'Drafted thesis & market sections from the live record', when: hoursAgo(14) },
      { actor: 'Priya Nair', action: 'Approved the commercial synthesis', when: hoursAgo(9) }
    ],
    hoursSaved: 19
  },
  {
    id: 'atlas-coldchain',
    company: 'Atlas Cold Chain Logistics',
    sector: 'Logistics',
    subSector: 'Temperature-controlled 3PL',
    hq: 'Hamburg, Germany',
    dealSize: 360,
    currency: 'EUR',
    stage: 'D4',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(4),
    baselineDays: 45,
    thesis:
      'Temperature-controlled logistics roll-up benefiting from pharma & grocery e-commerce. Thesis: scarce cold-chain capacity with proven pricing power and resilient utilisation — memo complete, routing to IC for approval.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '€288M', source: 'QoE', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '€46M', source: 'QoE', confidence: 'high' },
      { label: 'EBITDA margin', value: '16.0%', source: 'QoE', confidence: 'high' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Utilisation resilient at 87% through the cycle; pricing power validated across pharma contracts.', severity: 'positive', source: 'Commercial DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [
        { text: 'Energy-cost exposure hedged via long-dated PPAs; margin downside contained.', severity: 'positive', source: 'Ops DD' }
      ] }
    ],
    documents: [
      { name: 'Confidential Information Memorandum.pdf', type: 'CIM', pages: 118, status: 'parsed' },
      { name: 'Quality of Earnings.pdf', type: 'Financials', pages: 51, status: 'parsed' },
      { name: 'IC Memo v2.docx', type: 'Memo', pages: 22, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Scarce cold-chain capacity with pricing power.', citations: ['CIM', 'QoE'] },
      { key: 'market', title: 'Market & commercial', status: 'approved', content: 'Utilisation 87%; pharma tailwind.', citations: ['Commercial DD'] },
      { key: 'value-creation', title: 'Value creation plan', status: 'approved', content: 'Buy-and-build; energy hedging.', citations: ['Ops DD'] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'approved', content: 'Energy costs hedged via PPAs.', citations: ['Ops DD'] },
      { key: 'recommendation', title: 'Recommendation', status: 'in_progress', content: 'Recommend proceed at 9.2x subject to final IC conditions.', citations: ['Deal model'] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'passed' },
      { check: 'ILPA reporting template mapping', framework: 'ILPA', status: 'passed' }
    ],
    activity: [
      { actor: 'Approval-Orchestration Agent', action: 'Assembled IC pack and circulated to committee', when: hoursAgo(10) },
      { actor: 'Eleanor Bishop', action: 'Scheduled IC review', when: hoursAgo(6) }
    ],
    hoursSaved: 31
  },
  {
    id: 'baltic-precision',
    company: 'Baltic Precision Components',
    sector: 'Industrials',
    subSector: 'Precision Components',
    hq: 'Tallinn, Estonia',
    dealSize: 195,
    currency: 'EUR',
    stage: 'D5',
    sponsorPersona: 'partner',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(-6),
    baselineDays: 45,
    thesis:
      'Founder-succession buyout of a precision-components supplier riding reshoring demand. IC approved; deal archived with a full lineage-tracked record.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '€162M', source: 'QoE', confidence: 'high' },
      { label: 'EBITDA (LTM)', value: '€27M', source: 'QoE', confidence: 'high' },
      { label: 'Entry multiple', value: '7.1x EV/EBITDA', source: 'Deal model', confidence: 'high' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'complete', progress: 100, findings: [
        { text: 'Reshoring driving dual-sourcing wins; order book +22% YoY.', severity: 'positive', source: 'Commercial DD' }
      ] },
      { lane: 'techai', owner: 'ai-md', status: 'complete', progress: 100, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'complete', progress: 100, findings: [] }
    ],
    documents: [
      { name: 'IC Memo (Approved).docx', type: 'Memo', pages: 24, status: 'parsed' },
      { name: 'Signed SPA.pdf', type: 'Legal', pages: 88, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'approved', content: 'Reshoring-led precision components consolidation.', citations: ['QoE'] },
      { key: 'market', title: 'Market & commercial', status: 'approved', content: 'Order book +22% YoY.', citations: ['Commercial DD'] },
      { key: 'value-creation', title: 'Value creation plan', status: 'approved', content: 'Buy-and-build; footprint optimisation.', citations: ['Ops DD'] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'approved', content: 'Customer concentration mitigated by contract terms.', citations: ['Commercial DD'] },
      { key: 'recommendation', title: 'Recommendation', status: 'approved', content: 'Approved at IC; proceed to signing.', citations: ['IC minutes'] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'passed' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'passed' },
      { check: 'ILPA reporting template mapping', framework: 'ILPA', status: 'passed' },
      { check: 'Data-room sensitivity labelling', framework: 'Purview', status: 'passed' }
    ],
    activity: [
      { actor: 'Records & Compliance Agent', action: 'Archived data room with Purview audit trail', when: hoursAgo(50) },
      { actor: 'Investment Committee', action: 'Approved the transaction', when: hoursAgo(72) }
    ],
    hoursSaved: 38
  },
  {
    id: 'frostbite-foods',
    company: 'Frostbite Foods',
    sector: 'Consumer & Retail',
    subSector: 'Convenience / Private-label',
    hq: 'Munich, Germany',
    dealSize: 280,
    currency: 'EUR',
    stage: 'SCR',
    status: 'screened',
    screenedAt: hoursAgo(20),
    sponsorPersona: 'retail-md',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(38),
    baselineDays: 45,
    thesis:
      'Founder-led convenience grocer with three bolt-ons available in DACH. Passed the Screening Gate on a private-label margin thesis; awaiting diligence launch.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '€420M', source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA (LTM)', value: '€34M', source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA margin', value: '8.1%', source: 'Derived', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'techai', owner: 'ai-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'not_started', progress: 0, findings: [] }
    ],
    documents: [
      { name: 'Investment Screen.pdf', type: 'Screen', pages: 6, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Convenience consolidation with private-label upside. (Screen.)', citations: ['Screen'] },
      { key: 'market', title: 'Market & commercial', status: 'empty', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' },
      { check: 'SFDR Article 8 alignment assessment', framework: 'SFDR', status: 'pending' }
    ],
    activity: [
      { actor: 'Eleanor Bishop', action: 'PURSUE recorded at the Screening Gate', when: hoursAgo(20) }
    ],
    hoursSaved: 0
  },
  {
    id: 'meridian-components',
    company: 'Meridian Components',
    sector: 'Industrials',
    subSector: 'Precision Components',
    hq: 'Stuttgart, Germany',
    dealSize: 190,
    currency: 'EUR',
    stage: 'SCR',
    status: 'screened',
    screenedAt: hoursAgo(8),
    sponsorPersona: 'supply-md',
    leadAnalyst: 'analyst',
    targetICDate: daysFromNow(44),
    baselineDays: 45,
    thesis:
      'Founder-succession buyout of a precision-components supplier riding reshoring demand. Cleared the gate on a buy-and-build thesis; awaiting diligence launch.',
    keyFigures: [
      { label: 'Revenue (LTM)', value: '€210M', source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA (LTM)', value: '€25M', source: 'Screen', confidence: 'medium' },
      { label: 'EBITDA margin', value: '11.9%', source: 'Derived', confidence: 'medium' }
    ],
    workstreams: [
      { lane: 'commercial', owner: 'retail-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'techai', owner: 'ai-md', status: 'not_started', progress: 0, findings: [] },
      { lane: 'operations', owner: 'supply-md', status: 'not_started', progress: 0, findings: [] }
    ],
    documents: [
      { name: 'Investment Screen.pdf', type: 'Screen', pages: 5, status: 'parsed' }
    ],
    memoSections: [
      { key: 'thesis', title: 'Investment thesis', status: 'draft', content: 'Reshoring-led precision-components consolidation. (Screen.)', citations: ['Screen'] },
      { key: 'market', title: 'Market & commercial', status: 'empty', content: '', citations: [] },
      { key: 'value-creation', title: 'Value creation plan', status: 'empty', content: '', citations: [] },
      { key: 'risks', title: 'Key risks & mitigants', status: 'empty', content: '', citations: [] },
      { key: 'recommendation', title: 'Recommendation', status: 'empty', content: '', citations: [] }
    ],
    compliance: [
      { check: 'Sanctions / UBO screening', framework: 'KYC', status: 'pending' }
    ],
    activity: [
      { actor: 'Diego Marquez', action: 'PURSUE recorded at the Screening Gate', when: hoursAgo(8) }
    ],
    hoursSaved: 0
  }
];

export const seedSourcing = [
  {
    id: 'src-1',
    company: 'Frostbite Foods',
    sector: 'Consumer & Retail',
    signal: 'Founder CxO interview signals openness to a growth partner; 3 bolt-ons available in DACH.',
    score: 91,
    tags: ['retail-md', 'analyst'],
    rationale: 'Matches convenience-grocery mandate; adjacency to Nordic Grocery thesis.',
    source: 'CxO interview · Sector news',
    promoted: false
  },
  {
    id: 'src-2',
    company: 'GridSense AI',
    sector: 'Software',
    signal: 'Series C insider round oversubscribed; energy-grid AI with proprietary sensor data.',
    score: 87,
    tags: ['ai-md', 'analyst'],
    rationale: 'Defensible data moat; strong AI-readiness profile.',
    source: 'Filings · Analyst report',
    promoted: false
  },
  {
    id: 'src-3',
    company: 'Meridian Components',
    sector: 'Industrials',
    signal: 'Tariff reshoring tailwind; founder retirement creates succession window.',
    score: 78,
    tags: ['supply-md', 'analyst'],
    rationale: 'Supplier-base consolidation angle; tariff-resilient sourcing.',
    source: 'News · Trade data',
    promoted: false
  },
  {
    id: 'src-4',
    company: 'Verda Home',
    sector: 'Consumer & Retail',
    signal: 'DTC home brand with strong loyalty data; growth slowing, valuation reset.',
    score: 72,
    tags: ['retail-md', 'ai-md'],
    rationale: 'Loyalty-data monetisation parallels the Nordic Grocery playbook.',
    source: 'Web grounding · Internal history',
    promoted: false
  }
];

function daysFromNow(d) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toISOString();
}
function hoursAgo(h) {
  const t = new Date();
  t.setHours(t.getHours() - h);
  return t.toISOString();
}
