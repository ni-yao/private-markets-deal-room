// Generated analyst report — an AI-written thesis note for a sourced target.
//
// Unlike the seeded "Analyst reports" (third-party research attached to a handful
// of demo companies), this GENERATES a fresh, grounded analyst note for ANY ranked
// target — public or private — from what the desk actually knows about it: sector,
// enterprise value, ownership, the live news catalysts, its SEC filings and (for
// public names) the Morningstar quality read.
//
// It surfaces under each ranked target on the Deal Sourcing page. Uses the deployed
// model via lib/ai.complete(); if the model is unavailable or rate-limited it falls
// back to a deterministic note built from the same grounded inputs, so a report
// always renders.

import { complete } from './ai.js';

const STANCES = new Set(['positive', 'neutral', 'caution']);

// Background report generation targets the higher-capacity news deployment by
// default (avoiding rate-limit contention on the app's primary gpt-5-mini model),
// falling back to the app model, then a deterministic note.
const REPORT_DEPLOYMENT = process.env.REPORT_MODEL || process.env.NEWS_AGENT_MODEL || 'gpt-5-mini-news';

async function callModel(system, userRich, userSafe) {
  // Try the rich prompt on the higher-capacity news deployment; if it trips the
  // content filter (or fails), retry with a sanitized prompt, then the app model.
  const attempts = [
    { dep: REPORT_DEPLOYMENT, user: userRich },
    { dep: REPORT_DEPLOYMENT, user: userSafe },
    { dep: undefined, user: userSafe }
  ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      const out = await complete({ system, user: a.user, maxTokens: 550, deployment: a.dep });
      if (out) return out;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function extractJson(raw) {
  if (!raw) return null;
  let t = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(t.slice(i, j + 1));
  } catch {
    return null;
  }
}

// Compact, model-friendly digests of the grounded inputs.
function catalystDigest(target) {
  const news = target.news || [];
  if (!news.length) return 'No live news catalysts captured.';
  return news
    .slice(0, 5)
    .map((n) => `- ${n.headline}${n.detail ? ` — ${n.detail}` : ''}`)
    .join('\n');
}
function filingsDigest(filings, kind) {
  if (!filings || !filings.length) return 'No SEC filings found (no public 10-K/10-Q/8-K and no recent Reg D Form D).';
  const label = kind === 'formd' ? 'SEC Form D private-placement filings' : 'SEC filings';
  return `${label}:\n` + filings.slice(0, 5).map((f) => `- ${f.filingType || 'Filing'}: ${f.headline}`).join('\n');
}
function qualityDigest(quality) {
  if (!quality || quality.public === false) return 'Private company — no public Morningstar coverage.';
  if (quality.configured === false) return 'Public company; Morningstar quality check not yet configured.';
  if (quality.rating && quality.rating !== 'Pending') {
    return `Morningstar: ${quality.rating}${Number.isFinite(quality.score) ? ` (score ${quality.score}/10)` : ''}, trend ${quality.trend || 'stable'}. ${quality.note || ''}`.trim();
  }
  return 'Public company; Morningstar quality read pending.';
}

const SYSTEM = `You are a private-equity sourcing analyst writing a SHORT thesis note on a potential acquisition target for an investment committee.
Ground every statement in the provided facts (sector, EV, ownership, live news catalysts, SEC filings, Morningstar read). Be specific and decisive; never invent precise figures that are not given — hedge instead.
Respond with STRICT JSON ONLY — no prose, no markdown fences — exactly:
{"summary":"<=2 sentence why-now investment thesis","sectorOutlook":{"stance":"positive|neutral|caution","text":"<=2 sentence sector read"},"competitivePosition":"<=2 sentence competitive/positioning read","keyRisks":["risk","risk","risk"],"recommendation":"<=1 sentence: advance to screening / watch / pass, with the reason"}`;

function buildUser(target, filings, kind, quality) {
  return [
    `TARGET: ${target.name}${target.ticker ? ` (${target.ticker})` : ''}`,
    `Sector: ${target.sector}. Region: ${target.region}, ${target.country || 'United States'}.`,
    `Enterprise value ~$${target.dealSize}M${target.estimated ? ' (estimated)' : ''}. Ownership: ${target.ownership}.`,
    target.ticker ? 'This is a PUBLICLY-LISTED company (a take-private / public-to-private candidate).' : 'This is a PRIVATE company.',
    '',
    'LIVE NEWS CATALYSTS:',
    catalystDigest(target),
    '',
    filingsDigest(filings, kind),
    '',
    qualityDigest(quality),
    '',
    'Write the thesis note now (STRICT JSON only).'
  ].join('\n');
}

// Sanitized prompt — omits verbatim third-party news headlines/details (which can
// trip the content filter) and conveys only structured, neutral facts: the catalyst
// CATEGORIES, financials, filing types and quality summary.
function buildUserSafe(target, filings, kind, quality) {
  const cats = [...new Set((target.news || []).map((n) => n.catalyst).filter(Boolean))].map((c) => String(c).replace(/-/g, ' '));
  const filingTypes = [...new Set((filings || []).map((f) => f.filingType).filter(Boolean))].slice(0, 6);
  return [
    `TARGET: ${target.name}${target.ticker ? ` (${target.ticker})` : ''}`,
    `Sector: ${target.sector}. Region: ${target.region}, ${target.country || 'United States'}.`,
    `Enterprise value ~$${target.dealSize}M${target.estimated ? ' (estimated)' : ''}. Ownership: ${target.ownership}.`,
    target.ticker ? 'Publicly listed (a take-private / buyout candidate).' : 'Private company.',
    `Catalyst categories observed: ${cats.length ? cats.join(', ') : 'general ownership/value'}.`,
    filingTypes.length ? `Filing types on record: ${filingTypes.join(', ')} (${kind === 'formd' ? 'private Reg D' : 'SEC EDGAR'}).` : 'No SEC filings on record.',
    quality && quality.public !== false && quality.rating && quality.rating !== 'Pending'
      ? `Morningstar quality: ${quality.rating} (score ${quality.score}/10), trend ${quality.trend || 'stable'}.`
      : (target.ticker ? 'Public; Morningstar read unavailable.' : 'Private; no public quality coverage.'),
    '',
    'Write the thesis note now from these facts (STRICT JSON only).'
  ].join('\n');
}

function groundingSources(target, filings, quality) {
  const s = [];
  if ((target.news || []).length) s.push('Live news');
  if (filings && filings.length) s.push(quality?.public === false ? 'SEC Form D' : 'SEC EDGAR');
  if (quality && quality.public !== false && quality.rating && quality.rating !== 'Pending') s.push('Morningstar');
  if (!s.length) s.push('Desk record');
  return s;
}

// Deterministic fallback note — grounded in the same inputs, no model needed.
function fallbackReport(target, filings, kind, quality) {
  const isPublic = !!target.ticker;
  const cats = [...new Set((target.news || []).map((n) => n.catalyst).filter(Boolean))];
  const catText = cats.length ? cats.join(', ').replace(/-/g, ' ') : 'ownership / value';
  const summary = `${target.name} is a ${isPublic ? 'publicly-listed' : target.ownership} ${target.sector.toLowerCase()} target (~$${target.dealSize}M EV) surfacing on ${catText} catalysts${isPublic ? ' — a potential take-private' : ''}.`;
  const stance = quality && quality.public !== false && Number.isFinite(quality.score)
    ? (quality.score >= 7 ? 'positive' : quality.score >= 5 ? 'neutral' : 'caution')
    : 'neutral';
  const sectorText = `${target.sector} in ${target.region}; fit is assessed against the fund's permitted sectors and EV band.`;
  const competitive = isPublic
    ? `Listed ${target.sector.toLowerCase()} name — competitive position and valuation are cross-checkable against public comps and its filings.`
    : `Private ${target.ownership}-owned business — competitive read is a read-across from listed comps and sector dynamics.`;
  const risks = [];
  if (target.estimated) risks.push('Financials are estimated pending confirmed filings.');
  if (!filings || !filings.length) risks.push('No SEC filings retrieved to validate the numbers yet.');
  if (quality && quality.public !== false && Number.isFinite(quality.score) && quality.score < 5) risks.push('Below-average Morningstar quality read.');
  if (!isPublic) risks.push('Private target — limited public disclosure; diligence-heavy.');
  if (risks.length < 2) risks.push('Deal availability / process timing unconfirmed.');
  const rec = stance === 'positive'
    ? 'Advance to screening — the catalyst and quality read support a closer look.'
    : stance === 'caution'
      ? 'Watch — the catalyst is real but quality/《risk》 signals warrant caution before committing diligence.'
      : 'Advance to screening for a fuller read — the catalyst is credible and the mandate fit looks plausible.';
  return {
    generated: false,
    summary,
    sectorOutlook: { stance, text: sectorText },
    competitivePosition: competitive,
    keyRisks: risks.slice(0, 4),
    recommendation: rec.replace('《risk》', 'risk'),
    sources: groundingSources(target, filings, quality)
  };
}

// Generate a grounded analyst note for a target. `filings`/`kind`/`quality` are the
// already-fetched detail inputs. Returns a normalized report object (never throws).
export async function generateAnalystReport(target, { filings = [], kind = 'none', quality = null } = {}) {
  let parsed = null;
  let modelError = null;
  try {
    const raw = await callModel(
      SYSTEM,
      buildUser(target, filings, kind, quality),
      buildUserSafe(target, filings, kind, quality)
    );
    parsed = extractJson(raw);
    if (!parsed) modelError = raw ? 'model returned unparseable output' : 'model returned no output';
  } catch (err) {
    modelError = String(err?.status || '') + ' ' + String(err?.message || err).slice(0, 160);
    parsed = null;
  }
  if (!parsed || typeof parsed.summary !== 'string') {
    const fb = fallbackReport(target, filings, kind, quality);
    if (modelError) {
      fb.modelError = modelError.trim();
      console.error(`[analystReport] fell back for ${target.name}: ${fb.modelError}`);
    }
    return fb;
  }
  const stance = STANCES.has(parsed?.sectorOutlook?.stance) ? parsed.sectorOutlook.stance : 'neutral';
  const risks = Array.isArray(parsed.keyRisks) ? parsed.keyRisks.filter((r) => typeof r === 'string').slice(0, 5) : [];
  return {
    generated: true,
    summary: String(parsed.summary).slice(0, 600),
    sectorOutlook: { stance, text: String(parsed?.sectorOutlook?.text || '').slice(0, 400) },
    competitivePosition: String(parsed.competitivePosition || '').slice(0, 400),
    keyRisks: risks.length ? risks : fallbackReport(target, filings, kind, quality).keyRisks,
    recommendation: String(parsed.recommendation || '').slice(0, 400),
    sources: groundingSources(target, filings, quality)
  };
}
