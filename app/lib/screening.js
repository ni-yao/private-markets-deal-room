// Deterministic pre-diligence artifact engine — the grounded backbone for the
// Stage-1 origination funnel's three pre-gate steps. Each function turns a
// candidate + fund mandate into the real artifact a US mid-market PE firm builds
// at that step, computed from the record (no model needed). The AI layer
// (lib/agents.js) enriches these with narrative; if the model is unavailable the
// deterministic output stands on its own.
//
// Grounded in practitioner research (Wall Street Prep, CFI, M&I/Multiple
// Expansion, Grata, Sourcescrub, DealCloud/Affinity, Axial, SPS/Bain DOBR):
//   O2 Auto Screen   -> Investment-Criteria Scorecard (hard knockouts + soft flags)
//   O3 Triage        -> weighted opportunity score across 6 dimensions -> A/B/C tier
//   O4 Screening Gate -> paper-LBO returns (entry mult, leverage, MOIC, IRR) + memo

import { gateCompany } from './scoring.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const money = (m) => (m == null ? '—' : m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`);

// ===========================================================================
//  O2 · AUTO SCREEN — Investment-Criteria Scorecard (hard knockouts + soft flags)
// ===========================================================================
// A pass/flag/fail matrix over the fund's binding criteria. Research: the initial
// screen is a fast knockout filter — sector/mandate fit, EV/size band, geography,
// positive-EBITDA floor, margin/business-model viability, entry-multiple sanity,
// ESG exclusions — plus soft flags (ownership/actionability, growth/revenue
// quality). Advance only if NOTHING fails; a soft flag warrants a note, not a kill.

const MARGIN_FLOOR = 10;      // WSP: <10% EBITDA margin => business-model viability concern
const MARGIN_STRONG = 20;     // healthy mid-market margin
const MAX_ENTRY_MULT = 20;    // EV/EBITDA sanity ceiling (LBO math breaks well before 30x)
const CONC_FLAG = 30;         // single-customer concentration flag (research: >20-30%)

function verdict(pass, flag) {
  return pass ? (flag ? 'flag' : 'pass') : 'fail';
}

// One criterion row: { key, label, group, status: pass|flag|fail, detail, value }
function scorecardRows(c, fund) {
  const rows = [];
  const gate = gateCompany(c, fund);

  // --- Hard knockouts (a FAIL blocks advancement) --------------------------
  const sectorOk = fund.sectorsPermitted?.includes(c.sector) && !fund.sectorsExcluded?.includes(c.sector);
  rows.push({
    key: 'sector', label: 'Sector / mandate fit', group: 'hard',
    status: verdict(sectorOk, false),
    detail: sectorOk ? `${c.sector} is a permitted mandate sector.` : `${c.sector} is outside the fund's permitted sectors.`,
    value: c.sector
  });

  const geoReason = gate.reasons.find((r) => /geograph/i.test(r));
  rows.push({
    key: 'geography', label: 'Geography', group: 'hard',
    status: verdict(!geoReason, false),
    detail: geoReason || `${c.region}, ${c.country} is inside the US mandate.`,
    value: `${c.region}`
  });

  const evOk = c.dealSize >= fund.evMin && c.dealSize <= fund.evMax;
  const evNear = !evOk && (c.dealSize >= fund.evMin * 0.85 && c.dealSize <= fund.evMax * 1.15);
  rows.push({
    key: 'ev', label: 'Enterprise-value band', group: 'hard',
    status: evOk ? 'pass' : evNear ? 'flag' : 'fail',
    detail: evOk
      ? `${money(c.dealSize)} EV sits inside the ${money(fund.evMin)}–${money(fund.evMax)} band.`
      : `${money(c.dealSize)} EV is ${c.dealSize < fund.evMin ? 'below' : 'above'} the ${money(fund.evMin)}–${money(fund.evMax)} band${evNear ? ' (marginal).' : '.'}`,
    value: money(c.dealSize)
  });

  const ebitdaPositive = (c.ebitda ?? 0) > 0;
  rows.push({
    key: 'ebitda-floor', label: 'Positive EBITDA (LBO viability)', group: 'hard',
    status: verdict(ebitdaPositive, (c.ebitda ?? 0) < 10),
    detail: !ebitdaPositive
      ? `Non-positive EBITDA (${money(c.ebitda)}) — cannot service acquisition debt.`
      : (c.ebitda < 10 ? `${money(c.ebitda)} EBITDA is thin for a platform; may fit only as an add-on.` : `${money(c.ebitda)} EBITDA supports a leveraged structure.`),
    value: money(c.ebitda)
  });

  const impliedMult = c.ebitda > 0 ? c.dealSize / c.ebitda : null;
  const multOk = impliedMult != null && impliedMult <= MAX_ENTRY_MULT;
  rows.push({
    key: 'entry-multiple', label: 'Implied entry multiple', group: 'hard',
    status: impliedMult == null ? 'fail' : multOk ? (impliedMult > 12 ? 'flag' : 'pass') : 'fail',
    detail: impliedMult == null
      ? 'No positive EBITDA to compute an entry multiple.'
      : `Implied EV/EBITDA ≈ ${impliedMult.toFixed(1)}x${impliedMult > MAX_ENTRY_MULT ? ` — above the ${MAX_ENTRY_MULT}x sanity ceiling; LBO math is very hard.` : impliedMult > 12 ? ' — full; needs a growth story.' : '.'}`,
    value: impliedMult == null ? '—' : `${impliedMult.toFixed(1)}x`
  });

  const esgReason = gate.reasons.find((r) => /excluded sector|LPA/i.test(r));
  rows.push({
    key: 'esg', label: 'ESG / LPA exclusions', group: 'hard',
    status: verdict(!esgReason, false),
    detail: esgReason || 'Clears the LPA exclusion list (no weapons/tobacco/gambling/coal/adult).',
    value: esgReason ? 'excluded' : 'clear'
  });

  // --- Soft flags (a FLAG warrants a note, never a hard kill) ---------------
  const marginOk = (c.ebitdaMargin ?? 0) >= MARGIN_FLOOR;
  rows.push({
    key: 'margin', label: 'EBITDA margin / model viability', group: 'soft',
    status: marginOk ? ((c.ebitdaMargin ?? 0) >= MARGIN_STRONG ? 'pass' : 'flag') : 'flag',
    detail: marginOk
      ? `${c.ebitdaMargin}% margin${c.ebitdaMargin >= MARGIN_STRONG ? ' is healthy for the sector.' : ' is acceptable; watch model durability.'}`
      : `${c.ebitdaMargin}% margin is below the ${MARGIN_FLOOR}% viability threshold — probe the business model.`,
    value: `${c.ebitdaMargin}%`
  });

  const growthOk = (c.growth ?? 0) >= 0;
  rows.push({
    key: 'growth', label: 'Revenue growth / quality', group: 'soft',
    status: growthOk ? ((c.growth ?? 0) >= 8 ? 'pass' : 'flag') : 'flag',
    detail: growthOk
      ? `${c.growth >= 0 ? '+' : ''}${c.growth}% growth${c.growth >= 8 ? ' supports an organic-growth thesis.' : ' is modest; leans on margin/M&A levers.'}`
      : `${c.growth}% growth — declining top line; confirm it isn't structural.`,
    value: `${c.growth >= 0 ? '+' : ''}${c.growth}%`
  });

  const preferredOwner = /founder|family|sponsor/i.test(c.ownership || '');
  rows.push({
    key: 'ownership', label: 'Ownership / actionability', group: 'soft',
    status: preferredOwner ? 'pass' : 'flag',
    detail: preferredOwner
      ? `${c.ownership}-owned — a clean control/ succession angle is plausible.`
      : `${c.ownership}-owned — actionability and willingness to transact need confirming.`,
    value: c.ownership
  });

  return rows;
}

export function buildScorecard(c, fund) {
  const rows = scorecardRows(c, fund);
  const hard = rows.filter((r) => r.group === 'hard');
  const soft = rows.filter((r) => r.group === 'soft');
  const fails = rows.filter((r) => r.status === 'fail');
  const flags = rows.filter((r) => r.status === 'flag');
  const hardFails = hard.filter((r) => r.status === 'fail');

  const recommendation = hardFails.length ? 'pass' : 'advance';
  const passReasonCode = hardFails.length ? knockoutToReason(hardFails[0].key) : null;
  const clears = hard.length - hardFails.length;

  const headline = hardFails.length
    ? `Fails ${hardFails.length} hard criteri${hardFails.length === 1 ? 'on' : 'a'}: ${hardFails.map((r) => r.label).join(', ')}.`
    : `Clears all ${hard.length} hard knockouts${flags.length ? ` with ${flags.length} soft flag${flags.length === 1 ? '' : 's'} to note` : ''}.`;

  return {
    kind: 'scorecard',
    rows,
    summary: {
      hardTotal: hard.length,
      hardCleared: clears,
      softFlags: soft.filter((r) => r.status === 'flag').length,
      fails: fails.length
    },
    recommendation,           // 'advance' | 'pass'
    passReasonCode,
    headline
  };
}

// Map a failed knockout row to the O2 pass-reason taxonomy (data/candidates.js).
function knockoutToReason(key) {
  return {
    sector: 'sector-risk',
    geography: 'sector-risk',
    ev: 'size-floor',
    'ebitda-floor': 'size-floor',
    'entry-multiple': 'business-model',
    esg: 'esg-exclusion'
  }[key] || 'business-model';
}

// ===========================================================================
//  O3 · TRIAGE — weighted opportunity score across 6 dimensions -> A/B/C tier
// ===========================================================================
// Research: triage RANKS survivors on relative attractiveness across ~5-8 weighted
// dimensions (thesis fit, asset quality, value-creation angle, actionability,
// valuation, competitive dynamics) -> a composite 0-100 -> an A/B/C tier
// (A pursue, B monitor, C pass). Deterministic scoring from the record.

const TRIAGE_DIMS = [
  { key: 'thesisFit', label: 'Investment-thesis fit', weight: 22 },
  { key: 'assetQuality', label: 'Asset quality', weight: 22 },
  { key: 'valueCreation', label: 'Value-creation angle', weight: 18 },
  { key: 'actionability', label: 'Deal actionability', weight: 16 },
  { key: 'valuation', label: 'Valuation attractiveness', weight: 12 },
  { key: 'competitive', label: 'Competitive dynamics', weight: 10 }
];

// Each scorer returns { pct: 0-1, note }.
function scoreThesisFit(c, fund, fitScore) {
  // fitScore is the existing 0-100 mandate/screen fit (reuse the O1 engine result).
  const pct = clamp((fitScore ?? 0) / 100, 0, 1);
  return { pct, note: `${Math.round(pct * 100)}/100 mandate & screen fit${c.matchedScreenName ? ` (best: ${c.matchedScreenName})` : ''}.` };
}
function scoreAssetQuality(c) {
  // Margin (vs 20% strong), growth (vs 12%), recurring/keyword hints.
  const m = clamp((c.ebitdaMargin ?? 0) / 25, 0, 1);
  const g = clamp(((c.growth ?? 0) + 5) / 25, 0, 1);
  const recurring = (c.keywords || []).some((k) => /recurring|saas|subscription|contract/i.test(k)) ? 0.15 : 0;
  const pct = clamp(0.45 * m + 0.4 * g + recurring, 0, 1);
  return { pct, note: `${c.ebitdaMargin}% margin, ${c.growth >= 0 ? '+' : ''}${c.growth}% growth${recurring ? ', recurring revenue' : ''}.` };
}
function scoreValueCreation(c) {
  const kw = c.keywords || [];
  const rollup = kw.some((k) => /roll-?up|bolt-?on|buy-and-build|consolidat|platform/i.test(k)) ? 0.4 : 0;
  const margin = kw.some((k) => /margin|pricing|efficien|automat|digital/i.test(k)) ? 0.25 : 0;
  const growth = (c.growth ?? 0) >= 8 ? 0.2 : 0.1;
  const base = 0.2;
  const pct = clamp(base + rollup + margin + growth, 0, 1);
  const levers = [];
  if (rollup) levers.push('buy-and-build');
  if (margin) levers.push('margin/pricing');
  if ((c.growth ?? 0) >= 8) levers.push('organic growth');
  return { pct, note: levers.length ? `Levers: ${levers.join(', ')}.` : 'Value-creation angle to be defined in diligence.' };
}
function scoreActionability(c) {
  const owner = /founder|family/i.test(c.ownership || '') ? 0.85 : /sponsor/i.test(c.ownership || '') ? 0.55 : /public/i.test(c.ownership || '') ? 0.4 : 0.5;
  const cxo = (c.sources || []).includes('cxo') ? 0.15 : 0; // a warm CxO signal = a relationship angle
  const pct = clamp(owner + cxo, 0, 1);
  return { pct, note: `${c.ownership}-owned${cxo ? ', warm CxO relationship' : ''}.` };
}
function scoreValuation(c) {
  const mult = c.ebitda > 0 ? c.dealSize / c.ebitda : 99;
  // Cheaper entry = more attractive; ~6x great, ~12x full.
  const pct = clamp(1 - (mult - 6) / 8, 0, 1);
  return { pct, note: c.ebitda > 0 ? `Implied ${mult.toFixed(1)}x EV/EBITDA entry.` : 'No positive EBITDA to value.' };
}
function scoreCompetitive(c) {
  // Founder/family + a CxO angle implies a more proprietary look; sponsor/public implies an auction.
  const proprietary = /founder|family/i.test(c.ownership || '') && (c.sources || []).includes('cxo');
  const pct = proprietary ? 0.85 : /founder|family/i.test(c.ownership || '') ? 0.6 : /sponsor|public/i.test(c.ownership || '') ? 0.35 : 0.5;
  return { pct, note: proprietary ? 'Likely proprietary / limited process.' : /sponsor|public/i.test(c.ownership || '') ? 'Likely competitive / auction.' : 'Process competitiveness TBD.' };
}

export function buildTriageScore(c, fund, fitScore) {
  const scorers = {
    thesisFit: scoreThesisFit(c, fund, fitScore),
    assetQuality: scoreAssetQuality(c),
    valueCreation: scoreValueCreation(c),
    actionability: scoreActionability(c),
    valuation: scoreValuation(c),
    competitive: scoreCompetitive(c)
  };
  const dims = TRIAGE_DIMS.map((d) => {
    const s = scorers[d.key];
    return { key: d.key, label: d.label, weight: d.weight, pct: +s.pct.toFixed(2), points: +(s.pct * d.weight).toFixed(1), note: s.note };
  });
  const composite = Math.round(dims.reduce((a, d) => a + d.points, 0));
  const tier = composite >= 68 ? 'A' : composite >= 45 ? 'B' : 'C';
  const tierAction = { A: 'advance', B: 'park', C: 'pass' }[tier];
  const tierLabel = { A: 'Pursue — earns a gate slot', B: 'Monitor — watchlist', C: 'Pass — below the bar' }[tier];
  const top = [...dims].sort((a, b) => b.points - a.points).slice(0, 2).map((d) => d.label.toLowerCase());
  const weak = [...dims].sort((a, b) => a.pct - b.pct).slice(0, 1).map((d) => d.label.toLowerCase());
  return {
    kind: 'triage',
    dims,
    composite,
    tier,
    tierAction,          // recommended action from the tier
    tierLabel,
    headline: `Tier ${tier} · ${composite}/100 — strongest on ${top.join(' & ')}; weakest on ${weak[0]}.`,
    parkReasonCode: tier === 'B' ? 'monitor' : null,
    passReasonCode: tier === 'C' ? (scorers.valuation.pct < 0.35 ? 'valuation-gap' : scorers.valueCreation.pct < 0.4 ? 'no-angle' : 'conviction') : null
  };
}

// ===========================================================================
//  O4 · SCREENING GATE — paper-LBO returns + IC pre-screen memo (deterministic)
// ===========================================================================
// Research: at pre-screen the sponsor presents a back-of-envelope ("paper") LBO —
// entry EV/EBITDA × EBITDA = EV; assume 4-6x leverage; grow EBITDA over a 5-yr
// hold; exit at a multiple; compute MOIC & IRR in base/upside/downside. Targets:
// >=20% base IRR, >=2.0x MOIC. This computes that math from the record so the
// memo (and the AI narrative in agents.js) is grounded in real numbers.

const HOLD_YEARS = 5;

function paperLbo(c, { entryMult, leverageMult, ebitdaCagr, exitMult }) {
  const entryEbitda = Math.max(1, c.ebitda || 1);
  const entryEV = entryEbitda * entryMult;
  const debt = entryEbitda * leverageMult;
  const equityIn = Math.max(1, entryEV - debt);
  const exitEbitda = entryEbitda * Math.pow(1 + ebitdaCagr, HOLD_YEARS);
  const exitEV = exitEbitda * exitMult;
  // Assume ~50% of initial debt paid down from cumulative FCF over the hold.
  const debtAtExit = debt * 0.5;
  const equityOut = Math.max(0, exitEV - debtAtExit);
  const moic = equityOut / equityIn;
  const irr = moic > 0 ? Math.pow(moic, 1 / HOLD_YEARS) - 1 : -1;
  return {
    entryEV: Math.round(entryEV), equityIn: Math.round(equityIn), debt: Math.round(debt),
    exitEbitda: Math.round(exitEbitda), exitEV: Math.round(exitEV), equityOut: Math.round(equityOut),
    moic: +moic.toFixed(2), irr: +(irr * 100).toFixed(1)
  };
}

export function buildReturns(c) {
  const impliedMult = c.ebitda > 0 ? c.dealSize / c.ebitda : null;
  // Use the actual implied entry multiple when it's within a financeable range;
  // above the LBO ceiling the paper deal only works if the entry can be renegotiated,
  // so we model at the ceiling AND flag that the current ask is unfinanceable.
  const baseMult = impliedMult == null ? 8 : clamp(impliedMult, 5, MAX_ENTRY_MULT);
  const entryAboveCeiling = impliedMult != null && impliedMult > MAX_ENTRY_MULT;
  const g = clamp((c.growth ?? 6) / 100, -0.05, 0.25);
  const scenarios = {
    downside: paperLbo(c, { entryMult: baseMult, leverageMult: 4.5, ebitdaCagr: Math.max(0, g - 0.04), exitMult: baseMult - 1 }),
    base: paperLbo(c, { entryMult: baseMult, leverageMult: 5, ebitdaCagr: g, exitMult: baseMult }),
    upside: paperLbo(c, { entryMult: baseMult, leverageMult: 5.5, ebitdaCagr: g + 0.04, exitMult: baseMult + 1 })
  };
  const meetsHurdle = !entryAboveCeiling && scenarios.base.irr >= 20 && scenarios.base.moic >= 2.0;
  return {
    entryMultiple: +baseMult.toFixed(1),
    impliedMultiple: impliedMult == null ? null : +impliedMult.toFixed(1),
    entryAboveCeiling,
    leverage: '5.0x',
    holdYears: HOLD_YEARS,
    scenarios,
    hurdle: { irr: 20, moic: 2.0 },
    meetsHurdle
  };
}

// Deterministic IC pre-screen memo — the fallback/base the AI narrative enriches.
export function buildMemoBase(c, fund, { fitScore, tier } = {}) {
  const returns = buildReturns(c);
  const isProprietary = /founder|family/i.test(c.ownership || '') && (c.sources || []).includes('cxo');
  const rec = returns.meetsHurdle ? 'PURSUE' : 'PASS';
  const ceilingNote = returns.entryAboveCeiling
    ? ` The current implied ask (~${returns.impliedMultiple}x EV/EBITDA) is above the ${MAX_ENTRY_MULT}x financeable ceiling — the paper deal only works if the entry can be reset to ~${returns.entryMultiple}x.`
    : '';
  return {
    kind: 'memo',
    generated: false,
    recommendation: rec,
    execSummary: `${c.company} — a ${money(c.dealSize)} ${c.sector.toLowerCase()} ${c.ownership}-owned target. Paper LBO returns ${returns.scenarios.base.moic}x / ${returns.scenarios.base.irr}% IRR in the base case at a ${returns.entryMultiple}x entry.${ceilingNote} ${returns.meetsHurdle ? 'Clears the fund hurdle — recommend PURSUE and authorize an IOI.' : 'Below the 20% / 2.0x hurdle on paper — recommend PASS unless the angle or entry improves.'}`,
    sourcingAngle: isProprietary
      ? 'Warm CxO relationship into a founder/family owner — a proprietary, limited-process angle with room to lead on certainty rather than price.'
      : `${c.ownership}-owned; likely a ${/sponsor|public/i.test(c.ownership) ? 'competitive/auction' : 'semi-intermediated'} process. Angle-to-win must be defined before committing diligence spend.`,
    thesis: valueCreationThesis(c),
    keyRisks: memoRisks(c, returns),
    diligencePriorities: diligencePriorities(c),
    dealTeam: 'Sponsor: sector Partner · Execution: VP + Associate · Advisers: QoE (accounting), commercial DD, legal.',
    returns,
    ask: returns.meetsHurdle
      ? `Approve an IOI at ${returns.entryMultiple}x EV/EBITDA (${money(returns.scenarios.base.entryEV)} EV) and a ~$0.4–0.7M diligence budget over ${returns.holdYears === 5 ? '6–8 weeks' : 'the diligence window'}.`
      : 'No IC ask — recommend logging a pass (or parking on a re-engagement trigger).',
    tier: tier || null
  };
}

function valueCreationThesis(c) {
  const kw = c.keywords || [];
  const levers = [];
  if (kw.some((k) => /roll-?up|bolt-?on|buy-and-build|consolidat|platform/i.test(k))) levers.push('buy-and-build in a fragmented market');
  if (kw.some((k) => /margin|pricing|efficien|automat|digital/i.test(k))) levers.push('margin expansion via pricing/operational levers');
  if ((c.growth ?? 0) >= 8) levers.push(`organic growth (${c.growth}% today)`);
  if (!levers.length) levers.push('operational professionalization under institutional ownership');
  return `Value creation rests on ${levers.join('; ')}. Returns should be driven by EBITDA growth and debt paydown, not multiple expansion.`;
}
function memoRisks(c, returns) {
  const risks = [];
  if (c.ebitdaMargin < 15) risks.push({ risk: `Thin ${c.ebitdaMargin}% EBITDA margin`, mitigant: 'QoE + margin-bridge diligence to confirm normalized profitability.' });
  if ((c.growth ?? 0) < 5) risks.push({ risk: `Modest ${c.growth}% growth`, mitigant: 'Commercial DD to validate the demand and pipeline.' });
  if (/founder|family/i.test(c.ownership || '')) risks.push({ risk: 'Founder/key-person dependency', mitigant: 'Management diligence + retention/incentive structuring.' });
  if (!returns.meetsHurdle) risks.push({ risk: 'Base-case returns below hurdle on paper', mitigant: 'Negotiate entry multiple or identify additional value levers.' });
  risks.push({ risk: 'Customer concentration unknown', mitigant: 'Confirm top-customer mix (<20–30%) in early diligence.' });
  return risks.slice(0, 5);
}
function diligencePriorities(c) {
  return [
    'Quality of Earnings — normalize EBITDA, confirm addbacks and working capital.',
    'Commercial DD — market size, growth durability, competitive position.',
    'Customer concentration & contract quality (retention, pricing).',
    /founder|family/i.test(c.ownership || '') ? 'Management depth & founder-transition/retention plan.' : 'Management assessment & incentive alignment.',
    'Confirmatory legal, tax and (where relevant) ESG/regulatory review.'
  ];
}

export { money as fmtMoney };
