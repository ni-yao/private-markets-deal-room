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
  name: 'Fund IV — European Mid-Market Buyout',
  strategy: 'Control buyouts & structured minority growth',
  fundSize: '€2.4B',
  investmentPeriod: '2024–2029',
  term: '10 years + 2×1-yr extensions',
  // Binding gate constraints:
  sectorsPermitted: ['Consumer & Retail', 'Industrials', 'Software', 'Healthcare', 'Business Services'],
  sectorsExcluded: ['Defence & weapons', 'Tobacco', 'Gambling', 'Thermal coal', 'Adult entertainment'],
  geographies: ['DACH', 'Nordics', 'UK', 'Benelux', 'France'],
  evMin: 100, // €M — hard enterprise-value band
  evMax: 800,
  maxEquityPerDeal: 15, // % of fund committed capital (concentration limit)
  maxSectorConcentration: 30, // % of fund
  leverageLimit: '6.0x net debt / EBITDA',
  esgPolicy: 'SFDR Article 8 · UN PRI signatory · LPA exclusion list applies'
};

// ---- Tier 2 · Investment Themes (narrative hunting grounds) -----------------
export const seedThemes = [
  {
    id: 'theme-convenience',
    tier: 2,
    kind: 'theme',
    name: 'Founder-led Convenience Retail',
    sponsor: 'Eleanor Bishop (Partner)',
    status: 'active',
    thesis: 'Fragmented, founder-owned convenience & private-label grocery across DACH/Nordics is ripe for consolidation as generational transitions accelerate and discounters push own-brand penetration.',
    whyNow: 'A succession wave, rising private-label share, and under-monetised loyalty data are converging.',
    sector: 'Consumer & Retail',
    subSectors: ['Convenience grocery', 'Private-label food', 'Forecourt retail'],
    geographyFocus: ['DACH', 'Nordics'],
    valueCreation: ['Buy-and-build', 'Private-label margin expansion', 'Loyalty-data monetisation'],
    rightToWin: 'Two prior food-retail platform builds; operating-partner bench in grocery.',
    evGuidance: '€150–600M'
  },
  {
    id: 'theme-industrials',
    tier: 2,
    kind: 'theme',
    name: 'DACH Industrials Consolidation',
    sponsor: 'James Whitfield (Managing Director)',
    status: 'active',
    thesis: 'Founder-owned precision manufacturers are structural beneficiaries of supply-chain reshoring; a buy-and-build can consolidate a fragmented supplier base into a scaled, qualified vendor.',
    whyNow: 'Reshoring is driving OEM dual-sourcing toward European suppliers just as a founder-succession wave opens entries.',
    sector: 'Industrials',
    subSectors: ['Precision components', 'Sustainable packaging', 'Cold-chain logistics'],
    geographyFocus: ['DACH', 'Nordics'],
    valueCreation: ['Buy-and-build', 'Procurement & footprint optimisation', 'Commercial excellence'],
    rightToWin: 'Sector MD with 15 yrs in DACH industrials; three bolt-on pipelines identified.',
    evGuidance: '€100–500M'
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
    geographyFocus: ['Nordics', 'DACH', 'UK'],
    valueCreation: ['Go-to-market scaling', 'Pricing & packaging', 'M&A / data network effects'],
    rightToWin: 'AI MD + in-house data-science value-creation team.',
    evGuidance: '€100–400M'
  }
];

// ---- Tier 3 · Screens (the scored, runnable criteria) ----------------------
// A screen NESTS within its theme (themeId) and, through it, the fund mandate.
export const seedScreens = [
  {
    id: 'screen-conv-dach',
    tier: 3,
    kind: 'screen',
    name: 'Convenience grocery · DACH/Nordics',
    themeId: 'theme-convenience',
    author: 'Maya Olsen (Analyst)',
    sector: 'Consumer & Retail',
    subSectors: ['Convenience grocery', 'Private-label food'],
    regions: ['DACH', 'Nordics'],
    evMin: 150,
    evMax: 400,
    // Tier-3 differentiator — financial thresholds:
    revenueMin: 200, // €M
    ebitdaMin: 20, // €M
    ebitdaMarginMin: 6, // %
    growthMin: 2, // % YoY
    ownership: ['founder', 'family'],
    keywords: ['convenience', 'private-label', 'bolt-on'],
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
    regions: ['DACH'],
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
