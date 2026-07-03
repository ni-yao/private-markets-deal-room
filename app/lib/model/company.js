// Canonical Company / Target entity — the single profile that all sourcing input
// methods write into and the whole pipeline reads from. This replaces the old
// fragile split between "desk companies" (news/CxO) and "candidates" (funnel),
// joined by a brittle string id. Here one document per company carries BOTH the
// sourced intelligence AND its funnel state.
//
// Persisted in the Cosmos `companies` container (partition key /id). See
// docs/DATA-MODEL.md for the full schema and entity-resolution keys.

const slugify = (s) =>
  (s || 'target')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'target';

// Stable company id. Prefer a resolved key (domain/registry) when available so
// the same real company from two feeds lands on one document (P3).
export function companyId(input) {
  if (input.id) return input.id;
  if (input.domain) return `co-${slugify(input.domain)}`;
  if (input.registryId) return `co-reg-${slugify(input.registryId)}`;
  return `co-${slugify(input.name)}`;
}

// Build (or normalize) a canonical company document. `patch` may carry any
// subset; unknown fields pass through. Intelligence arrays default to empty.
export function makeCompany(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: companyId(patch),
    kind: 'company',
    // identity / entity-resolution keys
    name: patch.name || 'Unnamed target',
    aliases: patch.aliases || [],
    domain: patch.domain || null,
    registryId: patch.registryId || null,
    // classification
    sector: patch.sector || 'Business Services',
    subSector: patch.subSector || patch.sector || 'Business Services',
    region: patch.region || 'DACH',
    country: patch.country || patch.region || '—',
    hq: patch.hq || patch.country || '—',
    ownership: patch.ownership || 'unknown',
    keywords: patch.keywords || [],
    // financials (estimated=true when not sourced from a filing)
    revenue: patch.revenue ?? null,
    ebitda: patch.ebitda ?? null,
    ebitdaMargin: patch.ebitdaMargin ?? null,
    growth: patch.growth ?? null,
    dealSize: patch.dealSize ?? null,
    estimated: patch.estimated ?? true,
    // sourced intelligence (each item carries provenance)
    news: patch.news || [],
    filings: patch.filings || [],
    research: patch.research || null,
    quality: patch.quality || null, // Morningstar
    signals: patch.signals || null, // CxO (emails/chats/meetings)
    // provenance
    sources: patch.sources || [],
    discoveredVia: patch.discoveredVia || 'manual', // news-agent | workiq | manual
    firstSeen: patch.firstSeen || now,
    visible: patch.visible !== false,
    // funnel state (null until sent to screening; then the stage machine drives it)
    funnel: patch.funnel || null
  };
}

// Activate the funnel on a company when it's sent to screening (enters at O2).
export function enterFunnel(company) {
  return {
    ...company,
    funnel: company.funnel || {
      stage: 'O2',
      disposition: 'active',
      passReason: null,
      passStage: null,
      passNote: null,
      assessments: {},
      chatLog: [],
      enteredAt: new Date().toISOString()
    }
  };
}

// Merge freshly-sourced intelligence into an existing company (dedupe news by
// url/headline). Used when a later feed re-surfaces a known company (P3).
export function mergeIntel(existing, incoming) {
  const seen = new Set((existing.news || []).map((n) => n.url || n.headline));
  const news = [...(existing.news || [])];
  for (const n of incoming.news || []) {
    const key = n.url || n.headline;
    if (!seen.has(key)) {
      news.push(n);
      seen.add(key);
    }
  }
  return {
    ...existing,
    news,
    filings: incoming.filings?.length ? incoming.filings : existing.filings,
    research: incoming.research || existing.research,
    quality: incoming.quality || existing.quality,
    signals: incoming.signals || existing.signals,
    sources: [...new Set([...(existing.sources || []), ...(incoming.sources || [])])],
    // keep the richer (sourced) financials if the incoming ones are estimates
    revenue: incoming.estimated ? existing.revenue ?? incoming.revenue : incoming.revenue ?? existing.revenue,
    ebitda: incoming.estimated ? existing.ebitda ?? incoming.ebitda : incoming.ebitda ?? existing.ebitda,
    estimated: existing.estimated && incoming.estimated
  };
}
