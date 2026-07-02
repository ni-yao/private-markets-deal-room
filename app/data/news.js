// O1 · Deal Sourcing — the "News & filings" desk.
//
// The five sources are NOT equal — they play distinct roles in the funnel:
//   discover (Web, PitchBook)      — find things early & private
//   confirm  (FactSet, Capital IQ) — quantify & validate with filings
//   quality  (Morningstar)         — sanity-check quality / creditworthiness
//
// The desk drives a three-stage workflow over the same set of discovered
// companies:  In the News  →  Quantify with Filings  →  Check for Quality.

function hoursAgo(h) {
  const t = new Date();
  t.setHours(t.getHours() - h);
  return t.toISOString();
}
function daysAgo(d) {
  return hoursAgo(d * 24);
}

// ---- Sources (with role, connection status, latency) -----------------------
export const SOURCES = [
  { id: 'web', name: 'Web', role: 'discover', column: 1, primaryJob: 'Trade press, local news, company sites, LinkedIn', sweetSpot: 'Earliest soft signals before they hit databases', status: 'connected', latencyMs: 240, lastSyncMin: 2 },
  { id: 'pitchbook', name: 'PitchBook', role: 'discover', column: 1, primaryJob: 'Private-company fundings, PE/VC ownership, sponsor hold periods', sweetSpot: 'Finding sponsor-exit and founder-owned targets', status: 'connected', latencyMs: 360, lastSyncMin: 14 },
  { id: 'factset', name: 'FactSet', role: 'confirm', column: 2, primaryJob: 'Aggregated news + estimates + filings + ownership, wired together', sweetSpot: 'Fast public-company monitoring & alerts', status: 'connected', latencyMs: 190, lastSyncMin: 1 },
  { id: 'capitaliq', name: 'Capital IQ', role: 'confirm', column: 2, primaryJob: 'Deep financials, transaction history, filings, screening', sweetSpot: 'Comps, precedent deals, filing full-text search', status: 'degraded', latencyMs: 910, lastSyncMin: 26 },
  { id: 'morningstar', name: 'Morningstar', role: 'quality', column: 3, primaryJob: 'Fundamentals, ratings, equity research', sweetSpot: 'Quality / creditworthiness cross-check', status: 'connected', latencyMs: 280, lastSyncMin: 9 }
];

export const sourceById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// ---- Catalyst taxonomy (the decision list) ---------------------------------
export const catalysts = [
  { id: 'ownership', label: 'Ownership / succession', icon: '👤', scanning: 'Founder retiring, family-owned business, second-generation transition', actionable: 'The owner may finally sell — a clean, un-intermediated entry' },
  { id: 'sponsor-exit', label: 'Sponsor exit clock', icon: '⏱', scanning: 'A PE-owned asset nearing year 4–6 of the hold period', actionable: 'It is about to come to market' },
  { id: 'strategic-review', label: 'Strategic review / carve-out', icon: '🔀', scanning: '"Exploring strategic alternatives", divestiture, spin-off', actionable: 'A unit or company is being shopped' },
  { id: 'distress', label: 'Distress', icon: '⚠', scanning: 'Covenant pressure, refinancing wall, rating downgrade', actionable: 'A value / special-situations entry' },
  { id: 'leadership', label: 'Leadership change', icon: '🔁', scanning: 'CEO/CFO departure, new PE-friendly management', actionable: 'Disruption creates an opening' },
  { id: 'capital', label: 'Capital event', icon: '💧', scanning: 'Oversubscribed round, down round, pulled IPO', actionable: 'A need for a new partner' },
  { id: 'regulatory', label: 'Regulatory / macro', icon: '🌐', scanning: 'Tariffs, reshoring, new regulation creating winners & losers', actionable: 'A structural thesis tailwind' }
];

export const catalystById = Object.fromEntries(catalysts.map((c) => [c.id, c]));

// ---- Discovered companies (each flows through the three stages) -------------
// visible=true are shown initially; the rest are revealed by "Find more news".
export const deskCompanies = [
  {
    id: 'frostbite', name: 'Frostbite Foods', sector: 'Consumer & Retail', region: 'DACH', country: 'Germany', dealSize: 280, ownership: 'founder', keywords: ['convenience', 'private-label', 'bolt-on', 'loyalty'], sources: ['cxo', 'news'], revenue: 420, ebitda: 34, ebitdaMargin: 8.1, growth: 4, visible: true,
    news: [
      { id: 'fn1', source: 'web', when: hoursAgo(6), headline: 'Frostbite family said to weigh outside capital for the first time', detail: 'Regional trade press: the founding family is testing appetite for a minority growth partner ahead of a possible process.', catalyst: 'ownership', confidence: 0.88 },
      { id: 'fn2', source: 'pitchbook', when: daysAgo(9), headline: 'PitchBook: Frostbite is founder-owned with no PE sponsor on the cap table', detail: 'Ownership record confirms 100% family ownership — a clean entry with no intermediary.', catalyst: 'ownership', confidence: 0.8 }
    ],
    filings: [
      { id: 'ff1', source: 'capitaliq', filingType: 'Handelsregister (DE)', when: daysAgo(4), headline: 'Shareholder resolution — new share class created', confirms: 'ownership', detail: 'Commercial-register filing shows a new share class and amended articles — consistent with preparing for external capital.' },
      { id: 'ff2', source: 'factset', filingType: 'Ownership record', when: daysAgo(5), headline: 'Aggregated ownership: 100% family, no institutional holders', confirms: 'ownership', detail: 'FactSet ownership panel corroborates the founder-owned structure.' }
    ],
    quality: { rating: 'BB / Stable', score: 7.4, trend: 'stable', flags: ['Moderate leverage'], note: 'Healthy private-label margins; conservative balance sheet. Quality supports a control deal.' }
  },
  {
    id: 'gridsense', name: 'GridSense AI', sector: 'Software', region: 'Nordics', country: 'Denmark', dealSize: 240, ownership: 'founder', keywords: ['AI', 'sensor data', 'proprietary data', 'energy'], sources: ['cxo', 'news'], revenue: 58, ebitda: 6, ebitdaMargin: 10, growth: 41, visible: true,
    news: [
      { id: 'gn1', source: 'pitchbook', when: daysAgo(1), headline: 'GridSense Series C oversubscribed; insiders leading the round', detail: 'Round is oversubscribed; the company is said to prefer a strategic partner who understands energy infrastructure.', catalyst: 'capital', confidence: 0.86 },
      { id: 'gn2', source: 'web', when: daysAgo(6), headline: 'GridSense signs grid-optimisation pilot with a national TSO', detail: 'Commercial validation of the sensor-data platform; grid-modernisation tailwind supports demand.', catalyst: 'regulatory', confidence: 0.62 }
    ],
    filings: [
      { id: 'gf1', source: 'capitaliq', filingType: 'CVR (DK) capital increase', when: daysAgo(3), headline: 'Registered capital increase confirmed', confirms: 'capital', detail: 'Danish business-register filing confirms the round is real and closing.' },
      { id: 'gf2', source: 'factset', filingType: 'Estimate revision', when: daysAgo(2), headline: 'Consensus revenue estimates revised upward', confirms: 'capital', detail: 'Post-pilot estimate revisions support the growth trajectory.' }
    ],
    quality: { rating: 'B+ / Improving', score: 6.1, trend: 'improving', flags: ['Early-stage', 'Cash burn'], note: 'Strong ARR growth and a genuine data moat, but pre-scale — quality is improving, not yet proven.' }
  },
  {
    id: 'meridian', name: 'Meridian Components', sector: 'Industrials', region: 'DACH', country: 'Germany', dealSize: 190, ownership: 'founder', keywords: ['reshoring', 'precision', 'succession', 'bolt-on'], sources: ['cxo', 'news'], revenue: 210, ebitda: 25, ebitdaMargin: 11.9, growth: 6, visible: true,
    news: [
      { id: 'mn1', source: 'web', when: daysAgo(3), headline: 'Reshoring lifts European precision-component order books', detail: 'OEMs dual-sourcing away from tariff-exposed regions; DACH precision suppliers are direct beneficiaries.', catalyst: 'regulatory', confidence: 0.78 },
      { id: 'mn2', source: 'pitchbook', when: daysAgo(7), headline: 'PitchBook: Ober family holding — succession note flagged', detail: 'Ownership record flags a holding restructuring consistent with founder succession planning.', catalyst: 'ownership', confidence: 0.74 }
    ],
    filings: [
      { id: 'mf1', source: 'capitaliq', filingType: 'Handelsregister (DE)', when: daysAgo(7), headline: 'Ober family holding restructuring filed', confirms: 'ownership', detail: 'Register update consistent with founder succession planning.' },
      { id: 'mf2', source: 'factset', filingType: 'Customs / trade data', when: daysAgo(5), headline: 'Shipment volumes up ~40% YoY', confirms: 'regulatory', detail: 'Customs data quantifies the reshoring-driven order surge.' }
    ],
    quality: { rating: 'BB- / Stable', score: 7.0, trend: 'stable', flags: ['Customer concentration'], note: 'Solid margins and a reshoring tailwind; top-customer concentration is the one quality watch item.' }
  },
  {
    id: 'alpine', name: 'Alpine Cold Chain', sector: 'Industrials', region: 'DACH', country: 'Austria', dealSize: 360, ownership: 'sponsor', keywords: ['cold chain', '3PL', 'logistics', 'bolt-on'], sources: ['news'], revenue: 288, ebitda: 46, ebitdaMargin: 16, growth: 7, visible: false,
    news: [
      { id: 'an1', source: 'pitchbook', when: daysAgo(2), headline: "Alpine's PE owner enters year five of the hold", detail: 'Ownership timeline suggests the sponsor is approaching a monetisation window for the cold-chain platform.', catalyst: 'sponsor-exit', confidence: 0.9 },
      { id: 'an2', source: 'web', when: daysAgo(10), headline: 'Bankers said to be pitching the Alpine cold-chain platform', detail: 'Advisor chatter indicates a process is being prepared, not yet launched — an early look.', catalyst: 'sponsor-exit', confidence: 0.72 }
    ],
    filings: [
      { id: 'af1', source: 'capitaliq', filingType: 'Credit agreement / syndication', when: daysAgo(4), headline: 'Refinancing / lender syndication filing surfaces', confirms: 'sponsor-exit', detail: 'A refinancing often precedes a sale — the sponsor is tidying the capital structure.' }
    ],
    quality: { rating: 'B / Stable', score: 6.6, trend: 'stable', flags: ['High leverage'], note: 'Scarce cold-chain capacity with pricing power, but sponsor-era leverage is elevated.' }
  },
  {
    id: 'verde', name: 'Verde Home', sector: 'Consumer & Retail', region: 'UK', country: 'United Kingdom', dealSize: 150, ownership: 'public', keywords: ['DTC', 'loyalty', 'home', 'distress'], sources: ['news'], revenue: 240, ebitda: 12, ebitdaMargin: 5, growth: -3, visible: false,
    news: [
      { id: 'vn1', source: 'web', when: daysAgo(1), headline: 'Verde Home warns on covenants amid DTC slowdown', detail: 'Trading update flags covenant headroom pressure as direct-to-consumer demand softens.', catalyst: 'distress', confidence: 0.85 },
      { id: 'vn2', source: 'web', when: daysAgo(4), headline: 'Verde board said to be reviewing strategic alternatives', detail: 'Press reports a formal review — the company may be sold or taken private.', catalyst: 'strategic-review', confidence: 0.7 }
    ],
    filings: [
      { id: 'vf1', source: 'capitaliq', filingType: '8-K · Item 2.04', when: daysAgo(2), headline: 'Covenant breach disclosed', confirms: 'distress', detail: 'The 8-K confirms an actual covenant breach and acceleration risk — a hard, dated distress signal.' },
      { id: 'vf2', source: 'capitaliq', filingType: 'DEF 14A', when: daysAgo(6), headline: 'Board to review strategic alternatives', confirms: 'strategic-review', detail: 'Proxy discloses a formal strategic-review process.' }
    ],
    quality: { rating: 'CCC / Weakening', score: 3.8, trend: 'weakening', flags: ['Liquidity risk', 'Covenant breach'], note: 'Deteriorating fundamentals — a special-situations entry, not a quality compounder.' }
  },
  {
    id: 'brauhaus', name: 'Brauhaus Group', sector: 'Consumer & Retail', region: 'DACH', country: 'Germany', dealSize: 320, ownership: 'family', keywords: ['convenience', 'private-label', 'loyalty', 'bolt-on'], sources: ['news'], revenue: 380, ebitda: 42, ebitdaMargin: 11, growth: 1, visible: false,
    news: [
      { id: 'bn1', source: 'web', when: hoursAgo(20), headline: 'Third-generation family said to explore sale of regional brewer', detail: 'Local press: the family is quietly weighing a partial sale amid a generational transition.', catalyst: 'ownership', confidence: 0.83 },
      { id: 'bn2', source: 'pitchbook', when: daysAgo(5), headline: 'PitchBook: no institutional capital on the Brauhaus cap table', detail: 'Family-owned with no prior PE — a clean, proprietary origination.', catalyst: 'ownership', confidence: 0.79 }
    ],
    filings: [
      { id: 'bf1', source: 'capitaliq', filingType: 'Handelsregister (DE)', when: daysAgo(6), headline: 'Holding reorganization filed', confirms: 'ownership', detail: 'Register filing consistent with pre-transaction reorganization.' }
    ],
    quality: { rating: 'BB / Stable', score: 6.9, trend: 'stable', flags: ['Category headwinds'], note: 'Strong regional brand and cash generation; beer-category volume headwinds are the watch item.' }
  },
  {
    id: 'nordfiber', name: 'NordFiber', sector: 'Industrials', region: 'Nordics', country: 'Sweden', dealSize: 210, ownership: 'sponsor', keywords: ['reshoring', 'bolt-on', 'succession', 'precision'], sources: ['news'], revenue: 190, ebitda: 24, ebitdaMargin: 12.6, growth: 8, visible: false,
    news: [
      { id: 'nn1', source: 'pitchbook', when: hoursAgo(30), headline: 'Sponsor exploring exit of NordFiber after five-year hold', detail: 'PitchBook hold-period data shows the owner is past the typical monetisation window.', catalyst: 'sponsor-exit', confidence: 0.87 },
      { id: 'nn2', source: 'web', when: daysAgo(3), headline: 'Sustainable-packaging demand surges on plastics substitution', detail: 'Regulatory push toward fibre-based packaging is a multi-year tailwind for the sector.', catalyst: 'regulatory', confidence: 0.68 }
    ],
    filings: [
      { id: 'nf1', source: 'factset', filingType: 'Refinancing', when: daysAgo(4), headline: 'Refinancing filing surfaces ahead of a likely process', confirms: 'sponsor-exit', detail: 'Capital-structure tidy-up typically precedes a sponsor sale.' }
    ],
    quality: { rating: 'BB- / Improving', score: 7.1, trend: 'improving', flags: [], note: 'ESG-aligned demand and improving margins; a clean quality profile.' }
  }
];
