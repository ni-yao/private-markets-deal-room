// Sourcing-framework scoring: the Fund Mandate GATES, Screens RANK.
//
// gateCompany   — hard pass/fail against the fund mandate (LPA constraints).
// scoreScreen   — 0-100 mandate-fit of a company against one screen.
// scoreTargets  — gate every company, then score the survivors against the
//                 selected screens (keeping each company's best-matching screen).
// validateScreen — enforce that a screen may only NARROW its theme & fund.

const WEIGHTS = {
  sector: 15,
  region: 15,
  ev: 15,
  ownership: 10,
  keywords: 10,
  revenue: 10,
  ebitda: 10,
  margin: 8,
  growth: 7
};

export function gateCompany(company, fund) {
  const reasons = [];
  if (fund.sectorsExcluded?.includes(company.sector)) {
    reasons.push(`Excluded sector under the LPA (${company.sector})`);
  }
  if (fund.sectorsPermitted?.length && !fund.sectorsPermitted.includes(company.sector)) {
    reasons.push(`Sector outside the fund mandate (${company.sector})`);
  }
  if (fund.geographies?.length && !fund.geographies.includes(company.region)) {
    reasons.push(`Geography outside the fund mandate (${company.region})`);
  }
  if (company.dealSize < fund.evMin) {
    reasons.push(`EV $${company.dealSize}M below the mandate floor ($${fund.evMin}M)`);
  }
  if (company.dealSize > fund.evMax) {
    reasons.push(`EV $${company.dealSize}M above the mandate cap ($${fund.evMax}M)`);
  }
  return { passes: reasons.length === 0, reasons };
}

function bandScore(value, lo, hi, weight) {
  if (lo == null && hi == null) return weight;
  const low = lo ?? 0;
  const high = hi ?? Infinity;
  if (value >= low && value <= high) return weight;
  const dist = value < low ? (low - value) / (low || 1) : (value - high) / (high || 1);
  return dist <= 0.2 ? Math.round(weight * 0.5) : 0;
}

function minScore(value, min, weight) {
  if (min == null) return weight;
  if (value >= min) return weight;
  if (value >= min * 0.8) return Math.round(weight * 0.5);
  return 0;
}

export function scoreScreen(company, screen) {
  const parts = {};
  parts.sector = !screen.sector || screen.sector === company.sector ? WEIGHTS.sector : 0;
  parts.region = !screen.regions?.length || screen.regions.includes(company.region) ? WEIGHTS.region : 0;
  parts.ev = bandScore(company.dealSize, screen.evMin, screen.evMax, WEIGHTS.ev);
  parts.ownership = !screen.ownership?.length || screen.ownership.includes(company.ownership) ? WEIGHTS.ownership : 0;

  if (screen.keywords?.length) {
    const overlap = screen.keywords.filter((k) => (company.keywords || []).includes(k)).length;
    const denom = Math.min(screen.keywords.length, 3);
    parts.keywords = Math.round(WEIGHTS.keywords * Math.min(1, overlap / denom));
  } else {
    parts.keywords = 0;
  }

  parts.revenue = minScore(company.revenue ?? 0, screen.revenueMin, WEIGHTS.revenue);
  parts.ebitda = minScore(company.ebitda ?? 0, screen.ebitdaMin, WEIGHTS.ebitda);
  parts.margin = minScore(company.ebitdaMargin ?? 0, screen.ebitdaMarginMin, WEIGHTS.margin);
  parts.growth = minScore(company.growth ?? -999, screen.growthMin, WEIGHTS.growth);

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return { score, parts };
}

export function scoreTargets(companies, selectedScreens, fund) {
  return companies
    .map((company) => {
      const gate = gateCompany(company, fund);
      if (!gate.passes) {
        return {
          id: company.id,
          name: company.name,
          sector: company.sector,
          region: company.region,
          country: company.country,
          dealSize: company.dealSize,
          ownership: company.ownership,
          sources: company.sources || ['news'],
          justDiscovered: !!company.justDiscovered,
          gated: true,
          gateReasons: gate.reasons,
          score: 0,
          band: 'excluded',
          matchedScreen: null,
          parts: null
        };
      }
      let best = { score: 0, screen: null, parts: null };
      for (const s of selectedScreens) {
        const { score, parts } = scoreScreen(company, s);
        if (score > best.score) best = { score, screen: { id: s.id, name: s.name }, parts };
      }
      return {
        id: company.id,
        name: company.name,
        sector: company.sector,
        region: company.region,
        country: company.country,
        dealSize: company.dealSize,
        ownership: company.ownership,
        sources: company.sources || ['news'],
        justDiscovered: !!company.justDiscovered,
        gated: false,
        gateReasons: [],
        score: best.score,
        band: best.score >= 75 ? 'strong' : best.score >= 45 ? 'moderate' : 'weak',
        matchedScreen: best.screen,
        parts: best.parts
      };
    })
    .sort((a, b) => {
      if (a.gated !== b.gated) return a.gated ? 1 : -1; // excluded to the bottom
      return b.score - a.score;
    });
}

// Enforce that a screen may only NARROW its theme (soft) and the fund (hard).
export function validateScreen(screen, theme, fund) {
  const errors = [];
  const warnings = [];

  // Hard — fund mandate
  if (screen.sector && fund.sectorsExcluded?.includes(screen.sector)) {
    errors.push(`Sector “${screen.sector}” is on the fund’s LPA exclusion list.`);
  }
  if (screen.sector && fund.sectorsPermitted?.length && !fund.sectorsPermitted.includes(screen.sector)) {
    errors.push(`Sector “${screen.sector}” is outside the fund mandate’s permitted sectors.`);
  }
  for (const r of screen.regions || []) {
    if (fund.geographies?.length && !fund.geographies.includes(r)) {
      errors.push(`Geography “${r}” is outside the fund mandate.`);
    }
  }
  if (screen.evMin != null && screen.evMin < fund.evMin) {
    errors.push(`EV floor $${screen.evMin}M is below the fund mandate floor of $${fund.evMin}M.`);
  }
  if (screen.evMax != null && screen.evMax > fund.evMax) {
    errors.push(`EV ceiling $${screen.evMax}M exceeds the fund mandate cap of $${fund.evMax}M.`);
  }

  // Soft — parent theme
  if (theme) {
    if (screen.sector && theme.sector && screen.sector !== theme.sector) {
      warnings.push(`Sector “${screen.sector}” differs from the parent theme’s sector (“${theme.sector}”).`);
    }
    for (const r of screen.regions || []) {
      if (theme.geographyFocus?.length && !theme.geographyFocus.includes(r)) {
        warnings.push(`Geography “${r}” is outside the theme’s focus (${theme.geographyFocus.join(', ')}).`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
