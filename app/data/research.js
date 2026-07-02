// O1 · Deal Sourcing — "Analyst reports" as THESIS CONTEXT (not a feed).
//
// Analyst reports differ from the other O1 inputs: they are third-party,
// already-interpreted research (sell-side notes, independent studies, expert
// calls). Rather than a chronological feed, this research is *attached to each
// discovered company* to answer "is this a good business in a good market, and
// is this the right horse?" — sector outlook, competitive rank, sell-side view.
//
// Note on coverage: most targets here are founder-owned / private, so there is
// no direct equity research on the company itself — the context is read-across
// from listed comps + sector research + expert-network calls. Verde Home is
// listed, so it carries *direct* sell-side coverage (a useful contrast).

function daysAgo(d) {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t.toISOString();
}

export const researchByCompany = {
  frostbite: {
    coverage: 'read-across',
    thesis: 'Attractive pond (structural convenience growth) and a strong horse (#2 with the biggest private-label margin gap to close).',
    sector: {
      name: 'European convenience & private-label grocery',
      market: '€310B',
      growth: '3.1% CAGR (convenience format +5.4%)',
      horizon: '5-yr',
      outlook: 'positive',
      summary: 'Convenience formats structurally outgrowing the broader grocery market; private-label penetration rising as consumers trade down.',
      sources: ['Euromonitor', 'Goldman Consumer Staples']
    },
    competitive: {
      rank: 2,
      of: 6,
      label: '#2 in DACH convenience by share',
      moat: 'Dense store network + own-brand supply chain; loyalty dataset under-monetised.',
      peers: [
        { name: 'Regional leader', note: 'Share leader · listed · 9.6x EV/EBITDA · 28% private-label', listed: true },
        { name: 'Peer A', note: 'Listed · 8.1x · slower growth', listed: true },
        { name: 'Peer B (target)', note: '#2 · private · 21% private-label — the margin-gap opportunity', listed: false }
      ]
    },
    views: [
      { firm: 'Goldman Sachs', kind: 'sell-side', rating: 'Constructive (sector)', valuation: 'Listed peers 8–10x EV/EBITDA', view: '"European Food Retail": convenience the clear structural winner; private-label the primary margin lever.', when: daysAgo(12) },
      { firm: 'Morgan Stanley', kind: 'sell-side', rating: 'Overweight (listed leader)', valuation: '9.6x EV/EBITDA', view: 'Rates the listed leader Overweight; frames the margin gap the #2 could close under new ownership.', when: daysAgo(20) },
      { firm: 'Tegus expert call', kind: 'expert', view: 'Former category buyer confirms 6–8pt gross-margin uplift is achievable by lifting own-brand mix toward the leader.', when: daysAgo(6) }
    ]
  },

  gridsense: {
    coverage: 'read-across',
    thesis: 'High-growth pond (grid modernisation) with a genuinely defensible horse (proprietary sensor data), but early-stage.',
    sector: {
      name: 'Grid-optimisation / energy-transition software',
      market: '€14B',
      growth: '18–22% CAGR',
      horizon: '5-yr',
      outlook: 'positive',
      summary: 'Grid modernisation and renewables integration driving durable demand for optimisation software; proprietary telemetry is the scarce input.',
      sources: ['Gartner', 'Morgan Stanley Energy Transition']
    },
    competitive: {
      rank: 1,
      of: 4,
      label: 'Niche leader in sensor-data grid AI',
      moat: 'Proprietary sensor network + multi-year telemetry — hard to replicate; not a GPT wrapper.',
      peers: [
        { name: 'Point-solution startups', note: 'Model-only, no proprietary data', listed: false },
        { name: 'Incumbent grid-software vendors', note: 'Broad but not AI-native', listed: true },
        { name: 'Hyperscaler platforms', note: 'Horizontal risk — the key watch item', listed: true }
      ]
    },
    views: [
      { firm: 'Morgan Stanley', kind: 'sell-side', rating: 'Positive (theme)', valuation: 'Listed energy-software 8–12x ARR', view: '"Energy Transition Software": structural multi-year tailwind; proprietary-data players command a premium.', when: daysAgo(9) },
      { firm: 'GLG expert call', kind: 'expert', view: 'A national-TSO buyer validates the data moat: "the sensor network is the part competitors can\'t copy."', when: daysAgo(4) },
      { firm: 'Gartner', kind: 'independent', view: 'Places the category in "emerging, high-growth"; flags hyperscaler entry as the principal risk.', when: daysAgo(30) }
    ]
  },

  meridian: {
    coverage: 'read-across',
    thesis: 'Improving pond (reshoring tailwind) and a solid niche horse; customer concentration is the one thing to underwrite.',
    sector: {
      name: 'European precision components',
      market: '€48B',
      growth: '4–6% CAGR',
      horizon: '5-yr',
      outlook: 'positive',
      summary: 'OEMs dual-sourcing away from tariff-exposed regions; DACH precision suppliers are direct beneficiaries of reshoring.',
      sources: ['Goldman Industrials', 'Trade / customs data']
    },
    competitive: {
      rank: 3,
      of: 8,
      label: '#3–4 regionally, strong niche',
      moat: 'Qualified supplier status with sticky OEM relationships; hard to switch mid-programme.',
      peers: [
        { name: 'Large diversified suppliers', note: 'Listed · 8–9x · broader but less specialised', listed: true },
        { name: 'Regional specialists', note: 'Private · comparable niche', listed: false }
      ]
    },
    views: [
      { firm: 'Goldman Sachs', kind: 'sell-side', rating: 'Constructive (theme)', valuation: 'Listed comps 8–9x EV/EBITDA', view: '"Reshoring Winners": DACH precision suppliers among the clearest beneficiaries of supply-chain de-risking.', when: daysAgo(14) },
      { firm: 'AlphaSights expert call', kind: 'expert', view: 'An OEM procurement lead confirms an active dual-sourcing shift toward European suppliers — durable, not cyclical.', when: daysAgo(5) }
    ]
  },

  alpine: {
    coverage: 'read-across',
    thesis: 'Scarce-capacity pond with pricing power; sponsor-era leverage is the underwriting question, not the demand.',
    sector: {
      name: 'Temperature-controlled logistics (cold-chain 3PL)',
      market: '€26B',
      growth: '6–8% CAGR',
      horizon: '5-yr',
      outlook: 'positive',
      summary: 'Pharma cold-chain and grocery e-commerce driving durable demand against constrained capacity.',
      sources: ['Morgan Stanley Logistics', 'Independent 3PL study']
    },
    competitive: {
      rank: 2,
      of: 5,
      label: 'Regional #2 by capacity',
      moat: 'Scarce temperature-controlled capacity in key catchments — hard to replicate quickly.',
      peers: [
        { name: 'Listed 3PLs', note: 'Listed · 10–12x EV/EBITDA', listed: true },
        { name: 'Regional cold-chain operators', note: 'Private · sub-scale', listed: false }
      ]
    },
    views: [
      { firm: 'Morgan Stanley', kind: 'sell-side', rating: 'Positive (sub-sector)', valuation: 'Listed 3PLs 10–12x EV/EBITDA', view: '"Logistics": cold chain commands a premium to ambient on scarcity and pricing power.', when: daysAgo(11) },
      { firm: 'Tegus expert call', kind: 'expert', view: 'An ex-operator notes utilisation is high and new-build lead times are long — supportive of pricing.', when: daysAgo(7) }
    ]
  },

  verde: {
    coverage: 'direct',
    thesis: 'Weakening pond (DTC normalisation) and a losing horse — this is a special-situations / value case, not a quality compounder.',
    sector: {
      name: 'DTC home goods',
      market: '€90B',
      growth: '0–1% CAGR (post-COVID normalisation)',
      horizon: '3-yr',
      outlook: 'caution',
      summary: 'Demand pulled forward during COVID is unwinding; category soft with elevated customer-acquisition costs.',
      sources: ['Morningstar', 'Goldman Consumer Discretionary']
    },
    competitive: {
      rank: 5,
      of: 7,
      label: 'Mid-tier, losing share',
      moat: 'Brand + loyalty data, but eroding under CAC pressure.',
      peers: [
        { name: 'Category leaders', note: 'Listed · scale advantage', listed: true },
        { name: 'Marketplace platforms', note: 'Structural share gainers', listed: true }
      ]
    },
    views: [
      { firm: 'Goldman Sachs', kind: 'sell-side', rating: 'Sell → PT cut', valuation: 'PT lowered; below-consensus estimates', view: 'Direct coverage: downgraded on covenant risk and weakening trading; flags liquidity as the binding constraint.', when: daysAgo(3) },
      { firm: 'Morgan Stanley', kind: 'sell-side', rating: 'Underweight', valuation: 'Trades at distressed multiple', view: 'Direct coverage: sees a strategic-review / take-private path as the most likely resolution.', when: daysAgo(6) }
    ]
  },

  brauhaus: {
    coverage: 'read-across',
    thesis: 'Flat-to-soft pond (beer volumes) offset by a strong regional-brand horse; premiumisation is the value lever.',
    sector: {
      name: 'European beer & regional brewing',
      market: '€120B',
      growth: '0–2% CAGR (premium segment resilient)',
      horizon: '5-yr',
      outlook: 'neutral',
      summary: 'Volume headwinds in mainstream beer offset by premium/craft resilience and strong local-brand loyalty.',
      sources: ['Morgan Stanley Beverages', 'Euromonitor']
    },
    competitive: {
      rank: 1,
      of: 4,
      label: 'Regional brand leader',
      moat: 'Entrenched local brand, cash-generative, strong regional distribution.',
      peers: [
        { name: 'Global brewers', note: 'Listed · scale but not local', listed: true },
        { name: 'Regional peers', note: 'Private · comparable', listed: false }
      ]
    },
    views: [
      { firm: 'Morgan Stanley', kind: 'sell-side', rating: 'Neutral (sector)', valuation: 'Listed brewers 9–11x EV/EBITDA', view: '"Beverages": cautious on mainstream volumes; premium and strong local brands the resilient pockets.', when: daysAgo(16) },
      { firm: 'GLG expert call', kind: 'expert', view: 'A former distributor confirms the local brand\'s pricing power and loyal on-trade base.', when: daysAgo(9) }
    ]
  },

  nordfiber: {
    coverage: 'read-across',
    thesis: 'Strong tailwind pond (plastics substitution) and an ESG-aligned, improving horse — a clean quality profile.',
    sector: {
      name: 'Sustainable fibre-based packaging',
      market: '€38B',
      growth: '7–9% CAGR',
      horizon: '5-yr',
      outlook: 'positive',
      summary: 'Regulatory push toward fibre-based packaging is a multi-year substitution tailwind.',
      sources: ['Goldman Packaging & ESG', 'Independent packaging study']
    },
    competitive: {
      rank: 2,
      of: 6,
      label: 'ESG-aligned regional #2',
      moat: 'Fibre expertise + regulatory alignment; improving margins.',
      peers: [
        { name: 'Listed packaging majors', note: 'Listed · 8–10x · plastics-heavy mix', listed: true },
        { name: 'Fibre specialists', note: 'Private · comparable', listed: false }
      ]
    },
    views: [
      { firm: 'Goldman Sachs', kind: 'sell-side', rating: 'Constructive (theme)', valuation: 'Listed packaging 8–10x EV/EBITDA', view: '"Packaging & ESG": fibre-based substitution a structural winner as regulation tightens.', when: daysAgo(13) },
      { firm: 'AlphaSights expert call', kind: 'expert', view: 'A brand-owner sustainability lead confirms accelerating switching from plastic to fibre formats.', when: daysAgo(8) }
    ]
  }
};

export function researchFor(id) {
  return researchByCompany[id] || null;
}
