// Source-citation validation for IC materials.
//
// An Investment Committee memo is only defensible if every number in it traces to
// a source fact or document. This validates the IC materials on the deal record —
// the key figures (source facts), the IC memo sections (prose), and the derived IC
// ask — and flags any numeric claim that does not map to a sourced fact or a cited
// document, plus any key figure carried without a source attribution.
//
// It is deliberately conservative: it looks at money ($…M/B), percentages (…%) and
// multiples (…x) — the figures that actually drive an IC decision — rather than
// every integer (years, counts) so the flags are high-signal, not noise.

const MONEY = /\$\s?\d[\d,]*\.?\d*\s?(?:bn|billion|b|million|mm|m|k)?/gi;
const PCT = /\d[\d,]*\.?\d*\s?%/g;
const MULT = /\d+\.?\d*\s?x(?![a-z])/gi;

// Canonicalize a figure string so "$240M", "$ 240 m" and "240M" all compare equal.
function normNum(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[$,\s]/g, '')
    .replace(/billion/g, 'b').replace(/million|mm/g, 'm');
}

function extractFigures(text) {
  const out = [];
  if (!text) return out;
  for (const re of [MONEY, PCT, MULT]) {
    const m = String(text).match(re);
    if (m) out.push(...m.map((s) => s.trim()));
  }
  // de-dupe by canonical form, keep first surface form
  const seen = new Set();
  return out.filter((f) => {
    const k = normNum(f);
    if (!k || k === 'x' || k === '%' || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// A key figure is a "source fact" only if it carries a source attribution.
function figureSourced(f) {
  return !!(f && f.source && String(f.source).trim());
}

// Is the base financial data (revenue / EBITDA) sourced? The derived IC ask
// (EV, entry multiple, returns) is only as defensible as the figures it is built on.
function baseFinancialsSourced(deal) {
  const kf = deal.keyFigures || [];
  const rev = kf.find((f) => /revenue/i.test(f.label));
  const ebitda = kf.find((f) => /ebitda(?! margin)/i.test(f.label));
  const missing = [];
  if (!rev || !figureSourced(rev)) missing.push('Revenue');
  if (!ebitda || !figureSourced(ebitda)) missing.push('EBITDA');
  return { sourced: missing.length === 0, missing };
}

export function validateCitations(deal) {
  const keyFigures = (deal.keyFigures || []).map((f) => ({
    label: f.label, value: f.value, source: f.source || null, confidence: f.confidence || null, sourced: figureSourced(f)
  }));
  const unsourcedFigures = keyFigures.filter((f) => !f.sourced);

  // Source ledger: the canonical values that ARE backed by a sourced key figure,
  // plus the deal's documents (a claim in a section citing a document is sourced).
  const ledger = new Set(keyFigures.filter((f) => f.sourced).map((f) => normNum(f.value)).filter(Boolean));
  const documents = (deal.documents || []).map((d) => d.name);

  // Scan the IC memo sections for numeric claims and map each to a source.
  const claims = [];
  for (const m of deal.memoSections || []) {
    if (!m.content || m.status === 'empty') continue;
    const cited = (m.citations || []).length > 0;
    for (const fig of extractFigures(m.content)) {
      const inLedger = ledger.has(normNum(fig));
      const via = inLedger ? 'key-figure' : cited ? 'section-citation' : null;
      claims.push({ section: m.title, figure: fig, sourced: !!via, via });
    }
  }

  const unsourcedClaims = claims.filter((c) => !c.sourced);
  const total = claims.length;
  const base = baseFinancialsSourced(deal);

  return {
    score: total ? Math.round((100 * (total - unsourcedClaims.length)) / total) : 100,
    totalClaims: total,
    sourcedClaims: total - unsourcedClaims.length,
    unsourcedClaims,
    keyFigures,
    unsourcedFigures,
    documents,
    icAsk: {
      derivedFrom: 'Revenue + EBITDA (returns engine)',
      baseSourced: base.sourced,
      missingBase: base.missing
    },
    clean: unsourcedClaims.length === 0 && unsourcedFigures.length === 0 && base.sourced,
    summary: buildSummary(total, unsourcedClaims.length, unsourcedFigures.length, base)
  };
}

function buildSummary(total, unsourcedClaims, unsourcedFigures, base) {
  const parts = [];
  if (unsourcedFigures) parts.push(`${unsourcedFigures} key figure(s) carried without a source`);
  if (unsourcedClaims) parts.push(`${unsourcedClaims}/${total} memo figure(s) not traceable to a source`);
  if (!base.sourced) parts.push(`IC ask derived from unsourced ${base.missing.join(' & ')}`);
  if (!parts.length) return 'All numeric claims trace to a source fact or cited document.';
  return parts.join('; ') + '.';
}
