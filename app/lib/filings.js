// SEC EDGAR filings connector — a REAL, free replacement for the Capital IQ
// filings facade. EDGAR's official APIs (data.sec.gov + efts.sec.gov) are free
// and need no key — only a descriptive User-Agent header (SEC policy). Covers
// every US public-company filing since 1993 (10-K/10-Q/8-K/DEF 14A/S-1/13D…).
//
// Since our fund is US mid-market, this turns the O1 "Quantify with Filings"
// column from seeded text into live regulatory filings with clickable sources.

const UA = process.env.SEC_EDGAR_USER_AGENT || 'The Deal Room deal-room@example.com';
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
