// The sourcing framework — three tiers that do three DIFFERENT jobs (not the
// same fields narrowing). This mirrors how PE firms actually operate:
//
//   Tier 1 · Fund Mandate (LPA)  — GATE.  Hard, binding constraints from the
//            Limited Partnership Agreement: permitted/excluded sectors,
//            geographies, EV band, concentration & leverage limits, ESG policy.
//            A target that breaches the mandate is EXCLUDED, never scored.
//            Set at fundraising; not editable by the deal team.
//
//   Tier 2 · Investment Theme    — GUIDE. A qualitative thesis / "hunting
//            ground" sponsored by a partner: why-now, sub-sector focus, the
//            value-creation playbook and the firm's right-to-win. Directional,
//            not a numeric filter.
//
//   Tier 3 · Screen              — RANK. The concrete, runnable screening
//            criteria the analyst scores against: financial thresholds
//            (revenue, EBITDA, margin, growth), a precise EV band, ownership
//            and keywords. A screen may only NARROW its theme and fund mandate.

// ---- Tier 1 · Fund Mandate (the LPA gate) ----------------------------------
export const fundMandate = {
  id: 'fund-iv',
  tier: 1,
  kind: 'fund-mandate',
  name: 'Fund IV — US Mid-Market Buyout',
  strategy: 'Control buyouts & structured minority growth',
  fundSize: '$2.6B',
  investmentPeriod: '2024–2029',
  term: '10 years + 2×1-yr extensions',
  // Binding gate constraints:
  sectorsPermitted: ['Consumer & Retail', 'Industrials', 'Software', 'Healthcare', 'Business Services'],
  sectorsExcluded: ['Defense & weapons', 'Tobacco', 'Gambling', 'Thermal coal', 'Adult entertainment'],
  geographies: ['United States', 'Northeast', 'Southeast', 'Midwest', 'Texas', 'West / California'],
  evMin: 100, // $M — hard enterprise-value band
  evMax: 800,
  maxEquityPerDeal: 15, // % of fund committed capital (concentration limit)
  maxSectorConcentration: 30, // % of fund
  leverageLimit: '6.0x net debt / EBITDA',
  esgPolicy: 'UN PRI signatory · ILPA-aligned · LPA exclusion list applies'
};

// ---- Tier 2 · Investment Themes (narrative hunting grounds) -----------------
export const seedThemes = [
  {
    id: 'theme-convenience',
    tier: 2,
    kind: 'theme',
    name: 'Founder-led Consumer & Retail',
    sponsor: 'Eleanor Bishop (Partner)',
    status: 'active',
    thesis: 'Fragmented, founder-owned consumer, specialty-retail and better-for-you food brands across the US are ripe for consolidation as generational transitions accelerate and DTC economics normalize.',
    whyNow: 'A founder-succession wave, a reset in DTC valuations, and under-monetized loyalty data are converging.',
    sector: 'Consumer & Retail',
    subSectors: ['Specialty grocery', 'Branded food', 'Connected fitness & wellness', 'DTC brands'],
    geographyFocus: ['Northeast', 'West / California'],
    valueCreation: ['Buy-and-build', 'Retail footprint rationalization', 'Loyalty-data & subscription monetization'],
    rightToWin: 'Two prior US consumer platform builds; operating-partner bench in retail & CPG.',
    evGuidance: '$150–600M'
  },
  {
    id: 'theme-industrials',
    tier: 2,
    kind: 'theme',
    name: 'US Industrials Consolidation',
    sponsor: 'James Whitfield (Managing Director)',
    status: 'active',
    thesis: 'Founder-owned precision manufacturers are structural beneficiaries of supply-chain reshoring; a buy-and-build can consolidate a fragmented supplier base into a scaled, qualified vendor.',
    whyNow: 'Reshoring and IRA/CHIPS-driven onshoring are pulling OEM sourcing back to US suppliers just as a founder-succession wave opens entries.',
    sector: 'Industrials',
    subSectors: ['Precision components', 'Sustainable packaging', 'Cold-chain logistics'],
    geographyFocus: ['Midwest', 'Southeast', 'Texas'],
    valueCreation: ['Buy-and-build', 'Procurement & footprint optimization', 'Commercial excellence'],
    rightToWin: 'Sector MD with 15 yrs in US industrials; three bolt-on pipelines identified.',
    evGuidance: '$100–500M'
  },
  {
    id: 'theme-aisoftware',
    tier: 2,
    kind: 'theme',
    name: 'AI-enabled Vertical Software',
    sponsor: 'Dr. Priya Nair (Managing Director)',
    status: 'exploratory',
    thesis: 'Vertical software with a defensible, proprietary-data moat and a genuine AI product (not a GPT wrapper) can compound through attach-rate expansion and pricing power.',
    whyNow: 'Proprietary-data players are re-rating as AI adoption separates real moats from thin wrappers.',
    sector: 'Software',
    subSectors: ['Energy-transition software', 'Industrial AI', 'Vertical SaaS'],
    geographyFocus: ['West / California', 'Northeast', 'Texas'],
    valueCreation: ['Go-to-market scaling', 'Pricing & packaging', 'M&A / data network effects'],
    rightToWin: 'AI MD + in-house data-science value-creation team.',
    evGuidance: '$100–400M'
  }
];

// ---- Tier 3 · Screens (the scored, runnable criteria) ----------------------
// A screen NESTS within its theme (themeId) and, through it, the fund mandate.
export const seedScreens = [
  {
    id: 'screen-conv-dach',
    tier: 3,
    kind: 'screen',
    name: 'Consumer & Retail · US',
    themeId: 'theme-convenience',
    author: 'Maya Olsen (Analyst)',
    sector: 'Consumer & Retail',
    subSectors: ['Specialty grocery', 'Branded food', 'Connected fitness & wellness'],
    regions: ['Northeast', 'West / California'],
    evMin: 150,
    evMax: 400,
    // Tier-3 differentiator — financial thresholds:
    revenueMin: 200, // $M
    ebitdaMin: 20, // $M
    ebitdaMarginMin: 6, // %
    growthMin: 2, // % YoY
    ownership: ['founder', 'family'],
    keywords: ['consumer', 'retail', 'brand', 'bolt-on'],
    custom: false,
    selected: true
  },
  {
    id: 'screen-ind-reshoring',
    tier: 3,
    kind: 'screen',
    name: 'Precision industrials · reshoring',
    themeId: 'theme-industrials',
    author: 'Maya Olsen (Analyst)',
    sector: 'Industrials',
    subSectors: ['Precision components'],
    regions: ['Midwest', 'Southeast', 'Texas'],
    evMin: 100,
    evMax: 350,
    revenueMin: 120,
    ebitdaMin: 15,
    ebitdaMarginMin: 8,
    growthMin: 3,
    ownership: ['founder', 'family'],
    keywords: ['reshoring', 'precision', 'succession'],
    custom: false,
    selected: true
  }
];
