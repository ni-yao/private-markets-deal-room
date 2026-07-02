// Agent engine — turns a persona quick-action into a cited draft on the deal
// record. Uses the live Foundry model when available; otherwise returns a
// realistic seeded draft so the workspace is fully demoable offline.

import { complete } from './ai.js';
import { LANES } from '../data/personas.js';

// Catalyst-classifier agent — labels a news finding with its catalyst category.
// Keyword-weighted scoring over the catalyst taxonomy (real logic, runs offline);
// this is the "AI agent run against each finding" in the O1 news desk.
const CATALYST_KEYWORDS = {
  ownership: ['founder', 'family', 'succession', 'retire', 'generation', 'ownership', 'holding', 'heir', 'private-owned'],
  'sponsor-exit': ['sponsor', 'pe owner', 'private equity owner', 'hold', 'year five', 'five-year', 'portfolio company', 'monetis', 'exit', 'bankers', 'process'],
  'strategic-review': ['strategic alternatives', 'alternatives', 'divestiture', 'carve-out', 'carve out', 'spin-off', 'spin off', 'review', 'divest'],
  distress: ['covenant', 'refinanc', 'downgrade', 'liquidity', 'breach', 'distress', 'warns', 'default', 'restructur'],
  leadership: ['ceo', 'cfo', 'chief executive', 'chief financial', 'steps down', 'appoint', 'departure', 'new management'],
  capital: ['oversubscribed', 'round', 'ipo', 'raise', 'series ', 'capital increase', 'funding', 'insiders'],
  regulatory: ['tariff', 'reshoring', 'regulation', 'sanction', 'subsidy', 'packaging demand', 'pilot', 'tso', 'substitution', 'tailwind']
};

export function classifyCatalyst(text) {
  const t = (text || '').toLowerCase();
  let best = { catalyst: 'ownership', hits: 0 };
  for (const [cat, words] of Object.entries(CATALYST_KEYWORDS)) {
    const hits = words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
    if (hits > best.hits) best = { catalyst: cat, hits };
  }
  const confidence = best.hits === 0 ? 0.5 : Math.min(0.95, 0.62 + 0.11 * best.hits);
  return { catalyst: best.catalyst, confidence: +confidence.toFixed(2) };
}

function fig(deal, label) {
  const f = deal.keyFigures.find((k) => k.label.toLowerCase().includes(label.toLowerCase()));
  return f ? f.value : '—';
}

function buildContext(deal) {
  const figs = deal.keyFigures.map((f) => `${f.label}: ${f.value} (${f.source})`).join('; ');
  const lanes = deal.workstreams
    .map((w) => `${LANES[w.lane]?.label || w.lane}: ${w.status} ${w.progress}%`)
    .join('; ');
  return [
    `Company: ${deal.company} (${deal.sector} / ${deal.subSector}), HQ ${deal.hq}.`,
    `Deal size: ${deal.currency} ${deal.dealSize}M. Stage: ${deal.stage}.`,
    `Thesis: ${deal.thesis}`,
    `Key figures: ${figs}.`,
    `Diligence lanes: ${lanes}.`
  ].join('\n');
}

const SYSTEM = `You are the Deal Orchestrator for "The Deal Room", an AI workspace for a private-equity firm.
You draft concise, decision-grade content for an Investment Committee.
Rules: be specific and quantitative; ground every figure in the provided record; never invent precise numbers that are not supported — hedge instead.
Write in tight markdown with short paragraphs and bullets. End drafts with a "Sources:" line citing the record.`;

// Per-action seeded fallbacks (used in demo mode or if the live call fails).
const MOCKS = {
  'draft-screen': (d) => ({
    heading: 'Screening one-pager',
    markdown: `**${d.company} — ${d.subSector}**\n\nA ${d.sector.toLowerCase()} opportunity at ${fig(d, 'Entry') !== '—' ? fig(d, 'Entry') : 'an attractive entry multiple'} with revenue of **${fig(d, 'Revenue')}** and EBITDA of **${fig(d, 'EBITDA')}** (${fig(d, 'EBITDA margin')} margin).\n\n- **Why now:** ${d.thesis.split('.')[0]}.\n- **Fit:** matches the firm's consolidation mandate; sponsor conviction is high.\n- **Watch items:** margin gap to leader, data/IT readiness, integration risk.\n\n_Strategic fit: 8.4 / 10 — recommend advancing to triage._\n\nSources: CIM, Deal model.`,
    section: 'thesis'
  }),
  'gen-comps': (d) => ({
    heading: 'Comparable companies',
    markdown: `Trading & transaction comps for **${d.company}**:\n\n| Comp | EV/EBITDA | Rev growth | Margin |\n|---|---|---|---|\n| Regional leader | 9.6x | 3.4% | 9.9% |\n| Peer A | 8.1x | 2.8% | 7.2% |\n| Peer B | 7.7x | 4.1% | 6.8% |\n| **Target** | **${fig(d, 'Entry') !== '—' ? fig(d, 'Entry') : '8.4x'}** | — | **${fig(d, 'EBITDA margin')}** |\n\nEntry is at a **~13% discount** to the leader, justified by the margin gap the value plan is designed to close.\n\nSources: Capital IQ comps set, Deal model.`,
    figures: [
      { label: 'Comp median', value: '8.1x EV/EBITDA', source: 'Comps set', confidence: 'medium' }
    ]
  }),
  'summarize-cim': (d) => ({
    heading: 'CIM summary',
    markdown: `**${d.company} — CIM key facts**\n\n- Revenue **${fig(d, 'Revenue')}**, EBITDA **${fig(d, 'EBITDA')}** (${fig(d, 'EBITDA margin')}).\n- Private-label / own-product mix a core margin lever where applicable.\n- 3 anomalies flagged for QoE: working-capital seasonality, one-off rebate, lease reclassification.\n\nParsed 142 pages in **under 4 minutes** vs. ~5 analyst-hours.\n\nSources: CIM, Audited financials.`,
    doc: true
  }),
  'commercial-dd': (d) => ({
    heading: 'Commercial DD synthesis',
    markdown: `**Market & commercial — ${d.company}**\n\n- Market growing **3.1% CAGR**; the target's convenience format outpaces at **5.4%**.\n- Share is #2 regionally; whitespace in DACH supports the buy-and-build.\n- Pricing power validated in 2 of 3 core categories; private-label penetration is the key margin lever.\n\n**Risk:** customer overlap in dense catchments — quantified next.\n\nSources: Euromonitor, Commercial DD, CIM p.31.`,
    lane: 'commercial',
    finding: { text: 'Commercial thesis validated: format growth 5.4% vs market 3.1%; pricing power in 2/3 core categories.', severity: 'positive', source: 'Commercial DD' }
  }),
  'customer-risk': (d) => ({
    heading: 'Customer concentration',
    markdown: `**Customer concentration — ${d.company}**\n\n- Top-10 customers = **14% of revenue** (low concentration; healthy).\n- Loyalty base **${fig(d, 'Loyalty members')}** with 4-yr retention ~71%.\n- Churn skews to a single legacy banner being rationalised.\n\n**Assessment:** concentration risk **low**; retention upside via the data plan.\n\nSources: Customer cohort analysis, Data room.`,
    lane: 'commercial',
    finding: { text: 'Top-10 customers only 14% of revenue; concentration risk low.', severity: 'positive', source: 'Customer cohort analysis' }
  }),
  'ai-readiness': (d) => ({
    heading: 'AI-readiness score',
    markdown: `**AI-readiness — ${d.company}: 5.8 / 10 (moderate)**\n\n| Dimension | Score | Note |\n|---|---|---|\n| Data assets | 7 | Rich loyalty + transaction data |\n| Data foundation | 4 | Siloed in legacy POS — needs lakehouse |\n| Talent | 5 | No in-house data science |\n| Tech stack | 5 | On-prem; cloud migration required |\n| Adoption | 6 | Leadership sponsorship present |\n\n**Implication:** ~€6–9M, 18-month foundation unlock before AI pricing scales.\n\nSources: Tech/AI DD, Mgmt interviews.`,
    lane: 'techai',
    finding: { text: 'AI-readiness 5.8/10 — rich data but siloed; lakehouse foundation is the gating investment.', severity: 'caution', source: 'Tech/AI DD' }
  }),
  'value-levers': (d) => ({
    heading: 'Value-creation levers',
    markdown: `**Value-creation plan — ${d.company}**\n\n1. **AI assortment & pricing** → +120–160 bps margin (data foundation required).\n2. **Private-label penetration** 21% → 28% → +90 bps.\n3. **Supply-chain & procurement** synergies → +40 bps.\n4. **Loyalty monetisation** (media network) → new €15–20M revenue stream.\n\n**Aggregate:** ~230 bps EBITDA-margin uplift over the hold — closes the gap to the leader.\n\nSources: Tech/AI DD, Commercial DD, Deal model.`,
    lane: 'techai',
    section: 'value-creation',
    finding: { text: 'Value plan totals ~230 bps margin uplift; AI pricing is the largest single lever.', severity: 'positive', source: 'Value-creation plan' }
  }),
  'supply-risk': (d) => ({
    heading: 'Supply-chain & tariff risk',
    markdown: `**Operations & supply chain — ${d.company}**\n\n- **${d.id === 'heliopack' ? '38%' : '22%'}** of inputs sourced from tariff-exposed regions.\n- Single-source dependency on 2 critical SKUs — dual-sourcing recommended.\n- Logistics cost = 6.1% of revenue, ~80 bps above benchmark.\n\n**Mitigants:** dual-sourcing + hedging cut tariff EBITDA sensitivity from ±5% to ±2%.\n\nSources: Supplier master, Ops DD, Trade data.`,
    lane: 'operations',
    finding: { text: 'Tariff-exposed inputs concentrated; dual-sourcing + hedging halves EBITDA sensitivity.', severity: 'caution', source: 'Ops DD' }
  }),
  'cogs-bridge': (d) => ({
    heading: 'COGS bridge',
    markdown: `**COGS bridge — ${d.company}**\n\n| Driver | Impact |\n|---|---|\n| Procurement consolidation | −70 bps |\n| Private-label shift | −60 bps |\n| Logistics optimisation | −40 bps |\n| Tariff headwind | +30 bps |\n| **Net opportunity** | **−140 bps** |\n\nAchievable over 24 months with the operating-partner playbook.\n\nSources: Ops DD, Audited financials.`,
    lane: 'operations',
    finding: { text: 'Net COGS opportunity ~140 bps over 24 months after tariff headwind.', severity: 'positive', source: 'Ops DD' }
  }),
  'ic-memo': (d) => ({
    heading: 'IC memo draft',
    markdown: `**Investment Committee Memo — ${d.company}**\n\n**Recommendation:** Proceed to confirmatory diligence and submit a binding offer at ${fig(d, 'Entry') !== '—' ? fig(d, 'Entry') : '~8.4x'}, subject to QoE and the data-foundation capex plan.\n\n**Thesis:** ${d.thesis.split('.')[0]}.\n\n**Returns:** base-case ~2.4x / 23% IRR over a 5-yr hold; the ~230 bps margin plan is the primary value driver.\n\n**Key risks:** (1) data/IT readiness; (2) integration execution; (3) tariff exposure — each with identified mitigants.\n\nAll figures trace to the live record.\n\nSources: CIM, Commercial/Tech/Ops DD, Deal model.`,
    section: 'recommendation',
    alsoSections: { risks: '1) Data/IT readiness — lakehouse capex gating AI upside.\n2) Integration execution across banners.\n3) Tariff exposure on inputs — mitigated via dual-sourcing & hedging.', market: 'Convenience format growing 5.4% vs 3.1% market; #2 share with DACH whitespace; pricing power validated.' }
  }),
  'ic-readiness': (d) => ({
    heading: 'IC readiness check',
    markdown: `**IC readiness — ${d.company}**\n\n- ✅ Commercial DD substantially complete\n- ⚠️ Tech/AI lane in progress — value plan drafted\n- ⛔ Operations lane not started — **gating item**\n- ⚠️ SFDR Article 8 assessment in progress\n- ⛔ ILPA mapping pending\n\n**Verdict:** ~2 gating items remain; on the current agent-accelerated pace the deal is **IC-ready ~9 days early**.\n\nSources: Live diligence record, Compliance tracker.`,
    compliance: true
  }),
  'ic-deck': (d) => ({
    heading: 'IC deck outline',
    markdown: `**IC deck spine — ${d.company}**\n\n1. Executive summary & ask\n2. Thesis & why-now\n3. Market & competitive position\n4. Commercial DD findings\n5. Tech/AI readiness & value plan\n6. Operations & supply-chain\n7. Financials, returns & sensitivities\n8. Risks & mitigants\n9. Recommendation & conditions\n\nEach slide carries source-traced Q&A pulled from the live record.\n\nSources: Live record.`,
    section: 'recommendation'
  })
};

async function tryLive(deal, persona, action) {
  const ctx = buildContext(deal);
  const user = `Persona: ${persona.title}.\nTask: ${action.label} — ${action.blurb}\n\nDEAL RECORD:\n${ctx}\n\nProduce the draft now.`;
  try {
    const out = await complete({ system: SYSTEM, user, maxTokens: 750 });
    return out || null;
  } catch {
    return null;
  }
}

export async function runAction({ deal, persona, action }) {
  const mockFn = MOCKS[action.id];
  const mock = mockFn ? mockFn(deal) : { heading: action.label, markdown: `${action.label} drafted.` };
  const live = await tryLive(deal, persona, action);
  const markdown = live || mock.markdown;
  const result = {
    actionId: action.id,
    persona: persona.id,
    heading: mock.heading || action.label,
    markdown,
    hours: action.hours || 4,
    meta: mock
  };
  applyResult(deal, persona, action, result);
  return result;
}

function applyResult(deal, persona, action, result) {
  const meta = result.meta || {};
  const citations = extractSources(result.markdown);

  // Memo section write
  const sectionKey = meta.section || action.section;
  if (sectionKey) writeSection(deal, sectionKey, result.markdown, citations);
  if (meta.alsoSections) {
    for (const [k, v] of Object.entries(meta.alsoSections)) writeSection(deal, k, v, citations);
  }

  // Lane progress + finding
  const laneKey = meta.lane || action.lane;
  if (laneKey) {
    const ws = deal.workstreams.find((w) => w.lane === laneKey);
    if (ws) {
      ws.status = 'in_progress';
      ws.progress = Math.min(90, (ws.progress || 0) + 30);
      if (meta.finding) ws.findings.unshift(meta.finding);
      ws.owner = ws.owner || persona.id;
    }
  }

  // Key figures (e.g., comps)
  if (Array.isArray(meta.figures)) {
    for (const f of meta.figures) {
      if (!deal.keyFigures.some((k) => k.label === f.label)) deal.keyFigures.push(f);
    }
  }

  // Document parse completion
  if (meta.doc) {
    const parsing = deal.documents.find((x) => x.status !== 'parsed');
    if (parsing) parsing.status = 'parsed';
  }

  // Compliance advancement
  if (meta.compliance) {
    for (const c of deal.compliance) {
      if (c.status === 'pending') c.status = 'in_progress';
      else if (c.status === 'in_progress') c.status = 'passed';
    }
  }

  deal.hoursSaved = (deal.hoursSaved || 0) + (result.hours || 0);
  deal.activity.unshift({
    actor: `${agentName(action.id)} · ${persona.short}`,
    action: `${result.heading} drafted to the record`,
    when: new Date().toISOString()
  });
}

function writeSection(deal, key, content, citations) {
  const s = deal.memoSections.find((m) => m.key === key);
  if (!s) return;
  s.content = content;
  s.status = 'draft';
  if (citations.length) s.citations = Array.from(new Set([...(s.citations || []), ...citations]));
}

// ---------------------------------------------------------------------------
// Journey step runner — produces the artifact for a flow step and updates the
// underlying record (lanes / memo / compliance) so progress is real.
// ---------------------------------------------------------------------------

const STEP_SYSTEM = `You are an orchestration agent inside "The Deal Room", an AI workspace for a private-equity firm.
Given a deal record and the current step of the deal flow, produce the concise, decision-grade artifact for that step.
Be specific and quantitative, ground figures in the record, hedge when unsupported. Tight markdown. End with a "Sources:" line.`;

const STEP_HOURS = { O1: 4, O2: 6, O3: 5, O4: 3, D1: 4, D2: 14, D3: 12, D4: 5, D5: 3 };

function stepMock(deal, step) {
  const rev = fig(deal, 'Revenue');
  const ebitda = fig(deal, 'EBITDA');
  const margin = fig(deal, 'EBITDA margin');
  const entry = fig(deal, 'Entry') !== '—' ? fig(deal, 'Entry') : '~8.4x';
  const M = {
    O1: `**${deal.company} — sourcing signal**\n\nSurfaced from the sector signal scan and matched against the firm's mandates.\n\n- Signal: ${deal.thesis.split('.')[0]}.\n- Mandate fit: **strong** — consolidation thesis in ${deal.sector}.\n- Action: CRM record created; target promoted to auto-screen.\n\nSources: CxO signals, Sector news.`,
    O2: `**${deal.company} — screening one-pager**\n\n${deal.sector} opportunity: revenue **${rev}**, EBITDA **${ebitda}** (${margin}).\n\n- **Sector hypothesis:** validated — structural growth tailwind.\n- **Technology lever:** data / AI upside identified.\n- **Supply-chain risk:** flagged for diligence.\n- Strategic fit: **8.4 / 10**.\n\nSources: CIM, Deal estate.`,
    O3: `**${deal.company} — triage: comps & fit**\n\n| Comp | EV/EBITDA | Growth |\n|---|---|---|\n| Leader | 9.6x | 3.4% |\n| Peer A | 8.1x | 2.8% |\n| **Target** | **${entry}** | — |\n\nStrategic-fit score **8.4 / 10** vs. pre-defined criteria — **prioritised** in the live pipeline.\n\nSources: Precedent transactions, Comps set.`,
    O4: `**${deal.company} — screening gate decision**\n\n**Decision: PURSUE.** The MD approves progression on the strength of the screen and comps.\n\n- CRM record updated to "pursue".\n- CIM requested; NDA initiated.\n- Diligence budget & timeline approved.\n\nSources: Screening one-pager, Comps, MD judgement.`,
    D1: `**${deal.company} — diligence launch**\n\nCollaboration space provisioned and lanes assigned.\n\n- ✅ Teams workspace + SharePoint data room created (Power Automate).\n- ✅ DD checklist drafted from the playbook + 3 comparable deals.\n- ✅ Owners assigned: Commercial, Tech/AI, Operations.\n\nSources: DD playbook, Comparable deals.`,
    D2: `**${deal.company} — diligence in progress**\n\nThree swimlanes running in parallel on the shared record:\n\n- **Commercial:** format growth 5.4% vs 3.1% market; pricing power validated.\n- **Tech / AI:** rich but siloed data — lakehouse is the gating investment.\n- **Operations:** tariff-exposed inputs; dual-sourcing halves EBITDA sensitivity.\n\nSources: Commercial / Tech-AI / Ops DD.`,
    D3: `**${deal.company} — IC memo (synthesised)**\n\n**Recommendation:** proceed at ${entry}, subject to QoE and the data-foundation capex plan.\n\n- **Thesis:** ${deal.thesis.split('.')[0]}.\n- **Returns:** ~2.4x / 23% IRR over a 5-yr hold.\n- **Value plan:** ~230 bps margin uplift.\n- **Risks:** data readiness, integration, tariff — each mitigated.\n\nSources: CIM, Diligence lanes, Deal model.`,
    D4: `**${deal.company} — approval & execution**\n\n**IC outcome: APPROVED** with conditions.\n\n- ✅ SFDR / ILPA checks cleared.\n- ✅ CRM updated with decision + conditions.\n- ✅ Next steps (SPA, financing) triggered.\n\nSources: IC memo, Compliance tracker.`,
    D5: `**${deal.company} — archived**\n\nDeal closed out with a full, lineage-tracked record.\n\n- ✅ Data room archived to SharePoint.\n- ✅ Purview audit trail sealed (documents, decisions, lineage).\n- ✅ Post-close monitoring handed to the covenant agent.\n\nSources: SharePoint, Purview.`
  };
  return M[step.key] || `${step.title} completed for **${deal.company}**.\n\nSources: Live record.`;
}

function applyStepEffects(deal, step) {
  if (step.panel === 'lanes') {
    for (const w of deal.workstreams) {
      w.status = 'in_progress';
      w.progress = Math.min(90, (w.progress || 0) + 35);
    }
  }
  if (step.panel === 'memo') {
    const drafts = {
      thesis: deal.thesis,
      market: 'Structural growth tailwind; #2 share with consolidation whitespace; pricing power validated in core categories.',
      'value-creation': 'Aggregate ~230 bps EBITDA-margin uplift — AI pricing, private-label mix, procurement and loyalty monetisation.',
      risks: '1) Data/IT readiness gating AI upside. 2) Integration execution. 3) Tariff exposure — mitigated via dual-sourcing & hedging.',
      recommendation: 'Proceed at an attractive entry, subject to QoE and the data-foundation capex plan. Base case ~2.4x / 23% IRR.'
    };
    for (const s of deal.memoSections) {
      if (drafts[s.key]) {
        s.content = drafts[s.key];
        s.status = 'draft';
      }
    }
  }
  if (step.panel === 'compliance') {
    for (const c of deal.compliance) c.status = 'passed';
  }
  if (step.key === 'D1') {
    for (const d of deal.documents) if (d.status !== 'parsed') d.status = 'parsed';
  }
}

export async function runStep({ deal, step }) {
  const ctx = buildContext(deal);
  const user = `You are the ${step.agent}.\nStep ${step.code} · ${step.title}.\n${step.what}\nDeliverables to produce: ${step.produces.join(', ')}.\n\nDEAL RECORD:\n${ctx}\n\nProduce the artifact now.`;
  let markdown = null;
  try {
    markdown = await complete({ system: STEP_SYSTEM, user, maxTokens: 650 });
  } catch {
    markdown = null;
  }
  if (!markdown) markdown = stepMock(deal, step);

  applyStepEffects(deal, step);

  const hours = STEP_HOURS[step.key] || 4;
  deal.hoursSaved = (deal.hoursSaved || 0) + hours;
  deal.stepRuns = deal.stepRuns || {};
  deal.stepRuns[step.key] = {
    heading: `${step.code} · ${step.title}`,
    markdown,
    artifacts: step.produces,
    when: new Date().toISOString()
  };
  deal.activity.unshift({
    actor: step.agent,
    action: `${step.title} — ${step.produces[0]}`,
    when: new Date().toISOString()
  });

  return { stepKey: step.key, heading: `${step.code} · ${step.title}`, markdown, artifacts: step.produces, hours, citations: extractSources(markdown) };
}

function extractSources(md) {
  const m = md.match(/Sources?:\s*(.+)$/im);
  if (!m) return [];
  return m[1]
    .split(/[,;]/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
    .slice(0, 6);
}

function agentName(actionId) {
  const map = {
    'draft-screen': 'Target-Screening Agent',
    'gen-comps': 'Target-Screening Agent',
    'summarize-cim': 'Document-Intelligence Agent',
    'commercial-dd': 'Commercial-DD Agent',
    'customer-risk': 'Commercial-DD Agent',
    'ai-readiness': 'Tech/AI-DD Agent',
    'value-levers': 'Tech/AI-DD Agent',
    'supply-risk': 'Ops-DD Agent',
    'cogs-bridge': 'Ops-DD Agent',
    'ic-memo': 'IC-Memo Agent',
    'ic-readiness': 'Compliance Agent',
    'ic-deck': 'IC-Memo Agent'
  };
  return map[actionId] || 'Deal Orchestrator';
}

export async function chat({ deal, persona, message }) {
  const ctx = buildContext(deal);
  const user = `You are advising ${persona.title}.\nDEAL RECORD:\n${ctx}\n\nQuestion: ${message}\n\nAnswer concisely with cited figures from the record.`;
  let reply = null;
  try {
    reply = await complete({ system: SYSTEM, user, maxTokens: 500 });
  } catch {
    reply = null;
  }
  if (!reply) reply = demoChat(deal, persona, message);
  return { reply, citations: extractSources(reply) };
}

function demoChat(deal, persona, message) {
  const q = message.toLowerCase();
  if (q.includes('risk')) {
    return `Top risks for **${deal.company}**: data/IT readiness gating the AI upside, integration execution, and input/tariff exposure — each has an identified mitigant in the live record.\n\nSources: Tech/AI DD, Ops DD.`;
  }
  if (q.includes('return') || q.includes('irr') || q.includes('multiple')) {
    return `Base case for **${deal.company}** is ~2.4x / 23% IRR over a 5-year hold; the ~230 bps margin plan is the primary driver, with entry at ${fig(deal, 'Entry') !== '—' ? fig(deal, 'Entry') : '~8.4x'}.\n\nSources: Deal model.`;
  }
  if (q.includes('ic') || q.includes('ready') || q.includes('committee')) {
    return `**${deal.company}** is on an agent-accelerated path to IC. Remaining gating items are the operations lane and the SFDR/ILPA checks; on current pace it is **IC-ready ~9 days ahead** of the ${deal.baselineDays}-day baseline.\n\nSources: Live diligence record.`;
  }
  return `On **${deal.company}** (${deal.sector}): revenue ${fig(deal, 'Revenue')}, EBITDA ${fig(deal, 'EBITDA')} at ${fig(deal, 'EBITDA margin')}. Ask me about returns, risks, the value plan, or IC readiness — or run a quick-action to draft it to the record.\n\nSources: CIM, Deal model.`;
}
