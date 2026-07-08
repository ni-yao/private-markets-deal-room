// Canonical Company model + entity resolution (production data-model item 3).
//
// The Deal Room sources companies from three feeds that historically lived as three
// separate runtime arrays — the News/filings sourcing desk, the screening-funnel
// candidates, and the CxO signal companies. DATA-MODEL.md specifies a single canonical
// Company profile per real company, carrying identity, classification, financials, the
// sourced intelligence from every feed, provenance, and (once promoted) its funnel
// state. This module is that unification: it resolves records from all three feeds to a
// stable company id and merges them into one governed record, so the same real company
// surfaced by two feeds lands on ONE profile instead of duplicating.
//
// companyId() derives the stable id (domain → registryId → name slug); mergeIntel()
// folds a feed's data into the growing profile (dedupes news by URL, prefers sourced
// financials over estimates, unions provenance). buildCanonicalCompanies() projects the
// three feeds into the unified list the /api/companies surface and the agents read.

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function domainOf(rec) {
  const raw = rec.domain || rec.website || rec.url || '';
  const m = String(raw).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
  return m && m.includes('.') ? m.toLowerCase() : null;
}

// Stable, resolution-aware canonical id: domain → registryId → name slug.
export function companyId(rec) {
  const dom = domainOf(rec);
  if (dom) return `co-${slug(dom)}`;
  if (rec.registryId) return `co-${slug(rec.registryId)}`;
  const name = rec.name || rec.company || '';
  return `co-${slug(name)}`;
}

const isSourced = (rec) => rec && rec.estimated === false;
const firstNum = (...vals) => { for (const v of vals) if (v != null && v !== '') return v; return null; };

// Normalize one feed record to the canonical shape (funnel/signals filled per feed).
function toCanonical(rec, feed) {
  const name = rec.name || rec.company || '';
  const base = {
    id: companyId(rec),
    kind: 'company',
    name,
    aliases: [],
    domain: domainOf(rec),
    registryId: rec.registryId || null,
    ticker: rec.ticker || null,
    sector: rec.sector || null,
    subSector: rec.subSector || null,
    region: rec.region || null,
    country: rec.country || null,
    hq: rec.hq || rec.country || null,
    ownership: rec.ownership || null,
    keywords: rec.keywords || [],
    revenue: rec.revenue ?? null,
    ebitda: rec.ebitda ?? null,
    ebitdaMargin: rec.ebitdaMargin ?? null,
    growth: rec.growth ?? null,
    dealSize: rec.dealSize ?? null,
    estimated: rec.estimated !== false,
    news: feed === 'desk' ? (rec.news || []) : [],
    filings: feed === 'desk' ? (rec.filings ?? null) : null,
    research: feed === 'desk' ? (rec.research ?? null) : null,
    quality: feed === 'desk' ? (rec.quality ?? null) : null,
    signals: null,
    sources: rec.sources || [],
    discoveredVia: rec.discoveredVia || (feed === 'signal' ? 'workiq' : feed === 'candidate' ? 'funnel' : 'news-agent'),
    firstSeen: rec.firstSeen || rec.sourcedAt || null,
    visible: rec.visible !== false,
    funnel: null,
    feedIds: {}
  };
  base.feedIds[feed] = rec.id;

  if (feed === 'candidate') {
    base.funnel = {
      candidateId: rec.id,
      stage: rec.stage,
      disposition: rec.disposition,
      passReason: rec.passReason || null,
      passStage: rec.passStage || null,
      passNote: rec.passNote || null,
      assessments: rec.assessments || null,
      enteredAt: rec.sourcedAt || null
    };
    if (!base.sources.length) base.sources = ['news'];
  }
  if (feed === 'signal') {
    const emails = rec.emails || [], chats = rec.chats || [], meetings = rec.meetings || [];
    base.signals = {
      summary: rec.summary || null,
      intent: rec.intent || null,
      counts: { emails: emails.length, chats: chats.length, meetings: meetings.length, total: emails.length + chats.length + meetings.length },
      hasCrm: !!(rec.crm && rec.crm.exists)
    };
    if (!base.sources.length) base.sources = ['cxo'];
  }
  return base;
}

// Merge an incoming canonical record into an existing profile (same company id).
export function mergeIntel(base, add) {
  if (!base) return add;
  // aliases: remember distinct names seen across feeds
  if (add.name && add.name !== base.name && !base.aliases.includes(add.name)) base.aliases.push(add.name);
  // identity fill-ins
  base.domain ||= add.domain;
  base.registryId ||= add.registryId;
  base.ticker ||= add.ticker;
  // classification fill-ins
  for (const k of ['sector', 'subSector', 'region', 'country', 'hq', 'ownership']) base[k] ||= add[k];
  if (add.keywords?.length) base.keywords = Array.from(new Set([...(base.keywords || []), ...add.keywords]));
  // financials: prefer sourced over estimated, else fill nulls
  const preferAdd = isSourced(add) && !isSourced(base);
  for (const k of ['revenue', 'ebitda', 'ebitdaMargin', 'growth', 'dealSize']) {
    if (preferAdd) base[k] = firstNum(add[k], base[k]);
    else base[k] = firstNum(base[k], add[k]);
  }
  if (isSourced(add)) base.estimated = false;
  // sourced intelligence
  if (add.news?.length) {
    const seen = new Set((base.news || []).map((n) => n.url || n.headline));
    base.news = [...(base.news || []), ...add.news.filter((n) => !seen.has(n.url || n.headline))];
  }
  base.filings ||= add.filings;
  base.research ||= add.research;
  base.quality ||= add.quality;
  base.signals ||= add.signals;
  base.funnel ||= add.funnel;
  // provenance
  base.sources = Array.from(new Set([...(base.sources || []), ...(add.sources || [])]));
  Object.assign(base.feedIds, add.feedIds);
  if (add.firstSeen && (!base.firstSeen || add.firstSeen < base.firstSeen)) base.firstSeen = add.firstSeen;
  base.visible = base.visible || add.visible;
  return base;
}

// Project the three feeds into the unified, deduplicated canonical company list.
export function buildCanonicalCompanies({ desk = [], candidates = [], signalCompanies = [] } = {}) {
  const index = new Map();
  const add = (rec, feed) => {
    const c = toCanonical(rec, feed);
    index.set(c.id, mergeIntel(index.get(c.id) || null, c));
  };
  for (const d of desk) add(d, 'desk');
  for (const c of candidates) add(c, 'candidate');
  for (const s of signalCompanies) add(s, 'signal');
  return [...index.values()];
}

// A compact governed-record projection for API/UI (drops heavy embedded arrays).
export function canonicalSummary(c) {
  return {
    id: c.id,
    name: c.name,
    aliases: c.aliases,
    domain: c.domain,
    ticker: c.ticker,
    sector: c.sector,
    subSector: c.subSector,
    region: c.region,
    country: c.country,
    hq: c.hq,
    ownership: c.ownership,
    revenue: c.revenue,
    ebitda: c.ebitda,
    ebitdaMargin: c.ebitdaMargin,
    growth: c.growth,
    dealSize: c.dealSize,
    estimated: c.estimated,
    sources: c.sources,
    discoveredVia: c.discoveredVia,
    newsCount: (c.news || []).length,
    hasSignals: !!c.signals,
    inFunnel: !!c.funnel,
    funnel: c.funnel ? { stage: c.funnel.stage, disposition: c.funnel.disposition, passReason: c.funnel.passReason } : null,
    feedIds: c.feedIds,
    firstSeen: c.firstSeen
  };
}
