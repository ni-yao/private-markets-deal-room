// SEC EDGAR filings connector — a REAL, free replacement for the Capital IQ
// filings facade. EDGAR's official APIs (data.sec.gov + efts.sec.gov) are free
// and need no key — only a descriptive User-Agent header (SEC policy). Covers
// every US public-company filing since 1993 (10-K/10-Q/8-K/DEF 14A/S-1/13D…).
//
// Since our fund is US mid-market, this turns the O1 "Quantify with Filings"
// column from seeded text into live regulatory filings with clickable sources.

import { config } from './config.js';

const UA = config.filings.secEdgarUserAgent;
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' };

export function filingsConfigured() {
  return true; // free + keyless; always available
}

// Cache the ticker→CIK map (company_tickers.json, ~13k rows) for the process.
let tickerMap = null;
let tickerMapAt = 0;
async function loadTickerMap() {
  if (tickerMap && Date.now() - tickerMapAt < 6 * 3600_000) return tickerMap;
  const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`EDGAR ticker map ${r.status}`);
  const data = await r.json();
  tickerMap = Object.values(data);
  tickerMapAt = Date.now();
  return tickerMap;
}

const normName = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(inc|corp|corporation|company|co|plc|ltd|llc|lp|the|group|holdings?|interactive|international)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Resolve a company name/ticker to an EDGAR CIK (10-digit, zero-padded). Exact
// ticker first, then a confident name-token match — else null (no coverage).
async function resolveCik(name, ticker) {
  const map = await loadTickerMap();
  if (ticker) {
    const t = map.find((x) => (x.ticker || '').toUpperCase() === String(ticker).toUpperCase());
    if (t) return { cik: String(t.cik_str).padStart(10, '0'), title: t.title };
  }
  const qWords = new Set(normName(name).split(' ').filter((w) => w.length >= 3));
  if (!qWords.size) return null;
  let best = null;
  for (const x of map) {
    const words = normName(x.title).split(' ').filter(Boolean);
    const shared = words.filter((w) => qWords.has(w)).length;
    if (shared > 0 && (!best || shared > best.shared)) best = { x, shared };
  }
  return best ? { cik: String(best.x.cik_str).padStart(10, '0'), title: best.x.title } : null;
}

// Forms we surface for deal diligence, mapped to a catalyst + human label.
const FORM_META = {
  '10-K': { confirms: 'capital', label: 'Annual report' },
  '10-Q': { confirms: 'capital', label: 'Quarterly report' },
  '8-K': { confirms: 'strategic-review', label: 'Material event' },
  'DEF 14A': { confirms: 'ownership', label: 'Proxy statement' },
  'DEFM14A': { confirms: 'strategic-review', label: 'Merger proxy' },
  'S-1': { confirms: 'capital', label: 'Registration (IPO)' },
  'S-4': { confirms: 'strategic-review', label: 'M&A registration' },
  'SC 13D': { confirms: 'ownership', label: 'Activist / 5%+ stake' },
  'SC 13G': { confirms: 'ownership', label: '5%+ passive stake' },
  'SC 14D9': { confirms: 'strategic-review', label: 'Tender-offer response' },
  'SC TO-T': { confirms: 'strategic-review', label: 'Tender offer' },
  '25-NSE': { confirms: 'strategic-review', label: 'Delisting notice' }
};
const WANTED = Object.keys(FORM_META);

// Pull the most relevant recent filings for a company. Returns DeskFiling[]
// (id, source, filingType, when, headline, confirms, detail, url) + provenance.
export async function fetchFilings(name, ticker = null, { limit = 6 } = {}) {
  const hit = await resolveCik(name, ticker);
  if (!hit) return { source: 'edgar', matched: false, filings: [] };

  const r = await fetch(`https://data.sec.gov/submissions/CIK${hit.cik}.json`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`EDGAR submissions ${r.status}`);
  const data = await r.json();
  const recent = data?.filings?.recent;
  if (!recent) return { source: 'edgar', matched: true, cik: hit.cik, name: data.name, filings: [] };

  const cikNum = String(Number(hit.cik)); // un-padded for the Archives path
  const out = [];
  for (let i = 0; i < recent.form.length && out.length < limit; i++) {
    const form = recent.form[i];
    if (!WANTED.includes(form)) continue;
    const meta = FORM_META[form];
    const acc = recent.accessionNumber[i];
    const accNoDash = acc.replace(/-/g, '');
    const doc = recent.primaryDocument[i] || '';
    const url = doc
      ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/${doc}`
      : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${hit.cik}&type=${encodeURIComponent(form)}`;
    out.push({
      id: `edgar-${accNoDash}`,
      source: 'edgar',
      filingType: form,
      when: recent.filingDate[i],
      headline: `${meta.label} (${form}) filed`,
      confirms: meta.confirms,
      detail: `${data.name} filed a ${form}${recent.primaryDescription?.[i] ? ` — ${recent.primaryDescription[i]}` : ''} with the SEC on ${recent.filingDate[i]}.`,
      url,
      live: true
    });
  }
  return { source: 'edgar', matched: true, cik: hit.cik, name: data.name, filings: out };
}

// Lightweight connectivity probe (used by the Home connectivity panel).
export async function testFilings() {
  const t0 = Date.now();
  const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const latencyMs = Date.now() - t0;
  if (!r.ok) throw new Error(`EDGAR ${r.status}`);
  return { latencyMs };
}

// ---- Form D — private-company capital-raise signals ------------------------
// Form D is the notice a private US company/fund files with the SEC when it
// raises capital under a Regulation D exemption (private placement). It's on
// EDGAR, free and keyless. It is NOT financial statements — it's a capital-event
// SIGNAL: offering size, minimum check, industry, jurisdiction and the people
// behind it. That makes it ideal for SOURCING private US targets, which have no
// 10-K/10-Q. (For private financials you still need a paid source.)

const money = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v}`;
};

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
};

// Map Form D's industryGroupType taxonomy to the fund's permitted sectors.
function formDSector(industry) {
  const t = (industry || '').toLowerCase();
  if (/retail|restaurant|travel|agricultur|consumer/.test(t)) return 'Consumer & Retail';
  if (/manufactur|construction|energy|utilit/.test(t)) return 'Industrials';
  if (/technology|software|computer/.test(t)) return 'Software';
  if (/health|biotech|pharma|hospital/.test(t)) return 'Healthcare';
  if (/business services|financial|banking|insurance/.test(t)) return 'Business Services';
  return industry || 'Business Services';
}

// Parse the key offering metadata from a raw Form D primary_doc.xml.
function parseFormDXml(xml) {
  const indefinite = /<totalOfferingAmountIndefinite>\s*true/i.test(xml);
  const persons = [...xml.matchAll(/<firstName>([^<]*)<\/firstName>[\s\S]*?<lastName>([^<]*)<\/lastName>/g)]
    .map((m) => `${m[1]} ${m[2]}`.trim())
    .filter(Boolean);
  return {
    entityName: tag(xml, 'entityName'),
    industry: tag(xml, 'industryGroupType'),
    offering: indefinite ? 'Indefinite' : money(tag(xml, 'totalOfferingAmount')),
    offeringRaw: indefinite ? null : Number(tag(xml, 'totalOfferingAmount')) || null,
    sold: money(tag(xml, 'totalAmountSold')),
    minInvestment: money(tag(xml, 'minimumInvestmentAccepted')),
    investors: tag(xml, 'totalNumberAlreadyInvested'),
    revenueRange: tag(xml, 'revenueRange'),
    yearInc: tag(xml, 'yearOfIncorporation'),
    principals: [...new Set(persons)].slice(0, 4)
  };
}

function pad10(cik) {
  return String(cik).padStart(10, '0');
}
function formDDocUrl(cik, adsh) {
  const accNoDash = adsh.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accNoDash}/xslFormDX08/primary_doc.xml`;
}
async function fetchFormDDoc(cik, adsh) {
  const accNoDash = adsh.replace(/-/g, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accNoDash}/primary_doc.xml`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Form D doc ${r.status}`);
  return await r.text();
}

// EDGAR full-text search for Form D filings. Returns lightweight hits
// { name, cik, adsh, fileDate, states, sics }. Best-effort: EDGAR's FTS can
// intermittently 500/503, so a non-OK response yields [] rather than throwing.
async function searchFormD(query, { startdt, enddt, limit = 10 } = {}) {
  const params = new URLSearchParams({ q: query, forms: 'D' });
  if (startdt) params.set('startdt', startdt);
  if (enddt) params.set('enddt', enddt);
  let r;
  try {
    r = await fetch(`https://efts.sec.gov/LATEST/search-index?${params.toString()}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  } catch {
    return [];
  }
  if (!r.ok) return [];
  let data;
  try { data = await r.json(); } catch { return []; }
  return (data?.hits?.hits || []).slice(0, limit).map((h) => {
    const s = h._source || {};
    const adsh = s.adsh || String(h._id || '').split(':')[0];
    return {
      name: (s.display_names?.[0] || '').replace(/\s*\(CIK.*\)$/, '').trim(),
      cik: s.ciks?.[0] || null,
      adsh,
      fileDate: s.file_date || null,
      states: s.biz_states || [],
      sics: s.sics || []
    };
  }).filter((x) => x.cik && x.adsh);
}

const iso = (d) => d.toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Look up a specific private company's recent Form D filings by name. Used to
// enrich a desk company that isn't a public filer. Returns DeskFiling[] entries.
export async function fetchFormD(name, { limit = 2 } = {}) {
  const key = normName(name);
  if (!key) return { source: 'edgar-formd', matched: false, filings: [] };
  const hits = await searchFormD(`"${name}"`, { limit: 4 });
  // keep only hits whose name shares a significant token with the query
  const qWords = new Set(key.split(' ').filter((w) => w.length >= 3));
  const good = hits.filter((h) => normName(h.name).split(' ').some((w) => qWords.has(w))).slice(0, limit);
  if (!good.length) return { source: 'edgar-formd', matched: false, filings: [] };

  const filings = [];
  for (const h of good) {
    try {
      const parsed = parseFormDXml(await fetchFormDDoc(h.cik, h.adsh));
      filings.push(formDFiling(h, parsed));
    } catch { /* skip a bad doc */ }
  }
  return { source: 'edgar-formd', matched: filings.length > 0, cik: good[0]?.cik || null, filings };
}

function formDFiling(hit, p) {
  const raise = p.offering ? `${p.offering} offering` : 'private placement';
  const bits = [];
  if (p.offering) bits.push(`${p.offering} raise`);
  if (p.sold) bits.push(`${p.sold} sold`);
  if (p.minInvestment) bits.push(`${p.minInvestment} min`);
  if (p.investors && Number(p.investors) > 0) bits.push(`${p.investors} investors`);
  if (p.principals.length) bits.push(`principals: ${p.principals.join(', ')}`);
  return {
    id: `formd-${hit.adsh.replace(/-/g, '')}`,
    source: 'edgar-formd',
    filingType: 'Form D',
    when: hit.fileDate,
    headline: `Reg D private placement — ${raise}`,
    confirms: 'capital',
    detail: `${p.entityName || hit.name} filed a Form D with the SEC${p.industry ? ` (${p.industry})` : ''}${bits.length ? ` — ${bits.join(' · ')}` : ''}.`,
    url: formDDocUrl(hit.cik, hit.adsh),
    live: true
  };
}

const slug = (s) => (s || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Discovery scan: surface recent US private companies that just filed a Form D,
// ranked into the fund's permitted sectors. Returns desk-company-shaped objects
// (a capital-event catalyst + the Form D as a finding & filing). Only surfaces
// meaningful raises (>= minRaise) so micro-SPVs/seed notes don't drown the desk;
// capped and paced to respect EDGAR's ~10 req/s guidance.
export async function scanFormD({ sectors = ['software', 'manufacturing', 'health care', 'consumer', 'business services'], perSector = 2, days = 45, minRaise = 10e6 } = {}) {
  const enddt = iso(new Date());
  const startdt = iso(new Date(Date.now() - days * 86400_000));
  const seen = new Set();
  const companies = [];

  for (const term of sectors) {
    let hits = [];
    try { hits = await searchFormD(`"${term}"`, { startdt, enddt, limit: perSector + 6 }); } catch { continue; }
    await sleep(150); // pace EDGAR calls (well under 10 req/s)
    let taken = 0;
    for (const h of hits) {
      if (taken >= perSector) break;
      const key = normName(h.name);
      if (!key || seen.has(key)) continue;
      let parsed;
      try { parsed = parseFormDXml(await fetchFormDDoc(h.cik, h.adsh)); } catch { await sleep(200); continue; }
      await sleep(150);
      // Only meaningful raises that fit a mid-market fund — skip tiny/indefinite.
      if (!parsed.offeringRaw || parsed.offeringRaw < minRaise) continue;
      if (!parsed.entityName && !h.name) continue;
      seen.add(key);
      taken++;
      companies.push(toFormDCompany(h, parsed));
    }
  }
  // Largest raises first — the most substantive capital events.
  return companies.sort((a, b) => (b.dealSize || 0) - (a.dealSize || 0));
}

// Map a parsed Form D into the desk-company shape the O1 news desk renders.
function toFormDCompany(hit, p) {
  const name = p.entityName || hit.name;
  const ev = p.offeringRaw ? Math.max(1, Math.round(p.offeringRaw / 1e6)) : null;
  const state = hit.states?.[0] || null;
  const now = new Date().toISOString();
  return {
    id: `formd-${slug(name)}-${hit.adsh.replace(/-/g, '').slice(-6)}`,
    name,
    sector: formDSector(p.industry),
    region: 'US',
    country: 'United States',
    state,
    dealSize: ev,
    ownership: 'private',
    keywords: ['capital'],
    sources: ['formd'],
    revenue: ev ? Math.round(ev * 2) : 0,
    ebitda: ev ? Math.round(ev * 0.15) : 0,
    ebitdaMargin: 7.5,
    growth: 8,
    estimated: true,
    live: true,
    visible: true,
    justDiscovered: true,
    news: [{
      id: `formd-nf-${hit.adsh.replace(/-/g, '')}`,
      source: 'formd',
      when: hit.fileDate || now,
      headline: `${name} filed a Reg D private placement (Form D)${p.offering ? ` — ${p.offering} offering` : ''}`,
      detail: `${p.industry ? p.industry + '. ' : ''}${p.minInvestment ? `Minimum investment ${p.minInvestment}. ` : ''}${p.principals.length ? `Principals: ${p.principals.join(', ')}.` : ''} A live capital event — the company is raising private money now.`,
      url: formDDocUrl(hit.cik, hit.adsh),
      publisher: 'SEC EDGAR',
      catalyst: 'capital',
      confidence: 0.9,
      aiLabeled: false,
      live: true
    }],
    filings: [formDFiling(hit, p)],
    filingsChecked: true,
    quality: {
      rating: 'No public coverage',
      score: 0,
      trend: 'stable',
      flags: ['Private / not listed'],
      note: 'Private company (Form D filer) — no listed-security coverage. Quality via diligence.',
      live: true
    }
  };
}
