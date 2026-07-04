// News Scout — server-side client for the standalone Bing-grounded Foundry agent
// (deal-room-news-scout). Invokes the agent via the project's OpenAI-compatible
// Responses API using managed identity, and normalizes its grounded JSON into
// the desk-company shape the O1 News & Filings desk renders.
//
// gpt-4o is retired in this environment (mid-2026); the agent runs on gpt-5-mini.
// If the endpoint isn't configured, auth fails, the agent is rate-limited, or it
// returns nothing usable, callers fall back to the archived seed reveal so the
// app never breaks.

import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

const PROJECT_ENDPOINT = (process.env.FOUNDRY_PROJECT_ENDPOINT || '').replace(/\/$/, '');
const AGENT_NAME = process.env.NEWS_AGENT_NAME || 'deal-room-news-scout';
const AGENT_MODEL = process.env.NEWS_AGENT_MODEL || 'gpt-5-mini';
const RESPONSES_URL = PROJECT_ENDPOINT ? `${PROJECT_ENDPOINT}/openai/v1/responses` : '';

export function newsAgentConfigured() {
  return !!RESPONSES_URL;
}

// Foundry data-plane scope first, Cognitive Services scope as fallback.
const SCOPES = ['https://ai.azure.com/.default', 'https://cognitiveservices.azure.com/.default'];
const providers = {};
function tokenFor(scope) {
  if (!providers[scope]) {
    providers[scope] = getBearerTokenProvider(new DefaultAzureCredential(), scope);
  }
  return providers[scope]();
}

async function callAgent(input) {
  let lastErr;
  for (const scope of SCOPES) {
    let token;
    try {
      token = await tokenFor(scope);
    } catch (e) {
      lastErr = e;
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150_000);
    try {
      const resp = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: AGENT_MODEL,
          input,
          agent_reference: { name: AGENT_NAME, type: 'agent_reference' }
        }),
        signal: controller.signal
      });
      if (resp.status === 401 || resp.status === 403) {
        lastErr = new Error(`auth ${resp.status}`);
        continue; // try the next scope
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`news agent ${resp.status}: ${body.slice(0, 200)}`);
      }
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('news agent unauthorized');
}

// The Responses API returns an output[] array; pull the assistant message text.
function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;
    for (const c of item.content || []) {
      if (typeof c?.text === 'string') parts.push(c.text);
      else if (typeof c?.text?.value === 'string') parts.push(c.text.value);
    }
  }
  return parts.join('\n').trim();
}

function parseJsonArray(text) {
  if (!text) return [];
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // Strip Bing citation markers like 【3:1†source】 that can appear inline.
  t = t.replace(/【[^】]*】/g, '');
  const i = t.indexOf('[');
  const j = t.lastIndexOf(']');
  if (i < 0 || j <= i) return [];
  try {
    const arr = JSON.parse(t.slice(i, j + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const CATALYSTS = new Set([
  'ownership', 'sponsor-exit', 'strategic-review', 'distress', 'leadership', 'capital', 'regulatory'
]);
const slug = (s) => (s || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Map an agent-returned company (grounded JSON) into the desk-company shape.
// Financials the agent couldn't source are estimated from the EV so the funnel
// scoring still runs; they're flagged `estimated`. Filings/quality are left as
// pending — those become live via the Phase-2 connectors (Morningstar, filings).
function toDeskCompany(raw, idx) {
  const ev = Number.isFinite(raw?.dealSize) ? Math.round(raw.dealSize) : 300;
  const revenue = Math.round(ev * 1.25);
  const ebitda = Math.round(ev * 0.12);
  const now = new Date().toISOString();
  const findings = Array.isArray(raw?.findings) ? raw.findings.slice(0, 4) : [];
  const catalyst = CATALYSTS.has(raw?.catalyst) ? raw.catalyst : 'ownership';

  return {
    id: `live-${slug(raw?.name)}-${idx}`,
    name: raw?.name || 'Unnamed target',
    ticker: typeof raw?.ticker === 'string' ? raw.ticker.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6) || null : null,
    sector: raw?.sector || 'Business Services',
    region: raw?.region || 'US',
    country: raw?.country || 'United States',
    dealSize: ev,
    ownership: raw?.ownership || 'unknown',
    keywords: [catalyst],
    sources: ['news'],
    revenue,
    ebitda,
    ebitdaMargin: +((ebitda / revenue) * 100).toFixed(1),
    growth: 5,
    estimated: true,
    live: true,
    visible: true,
    justDiscovered: true,
    news: findings.map((f, k) => ({
      id: `lnf-${slug(raw?.name)}-${idx}-${k}`,
      source: 'web',
      when: f?.when || now,
      headline: f?.headline || raw?.why || 'Catalyst identified',
      detail: f?.detail || '',
      url: typeof f?.url === 'string' ? f.url : null,
      publisher: f?.source || 'Web',
      catalyst,
      confidence: 0.82,
      aiLabeled: true,
      live: true
    })),
    filings: [],
    quality: {
      rating: 'Pending',
      score: 0,
      trend: 'stable',
      flags: [],
      note: 'Live Morningstar quality check pending the market-data connector (Phase 2).'
    }
  };
}

function buildQuery(mandate, focus) {
  const sectors = (mandate?.sectorsPermitted || []).join(', ');
  const evLo = mandate?.evMin ?? 100;
  const evHi = mandate?.evMax ?? 800;
  const excl = (mandate?.sectorsExcluded || []).join(', ');
  return [
    `Fund mandate: US mid-market buyout fund (${mandate?.name || 'US mid-market buyout'}).`,
    `Permitted sectors: ${sectors}. Excluded: ${excl}.`,
    `Geography: United States. Enterprise value USD ${evLo}-${evHi}M (the acquisition threshold).`,
    focus ? `Focus themes: ${focus}.` : 'Focus: ownership/succession, sponsor-exit, take-private and carve-out catalysts.',
    `Return a mix of (a) private/founder/sponsor-owned targets AND (b) PUBLICLY-LISTED US companies that MEET THE ACQUISITION THRESHOLD — i.e. their market cap or enterprise value sits inside the USD ${evLo}-${evHi}M band and they are plausible take-private / buyout candidates (undervalued small- or micro-caps, activist involvement, strategic review, "exploring alternatives", proxy fights, orphaned/underfollowed public companies, or sector-consolidation targets).`,
    'For any public company include its stock ticker. Ground every company in recent US business news (WSJ, Bloomberg, CNBC, Reuters US, Axios, PE Hub, Barron\'s, Seeking Alpha). Return only US companies.'
  ].join(' ');
}

// Invoke the news scout for the given fund mandate; returns normalized desk
// companies (may be empty). Throws on hard failure so the caller can fall back.
export async function scoutNews({ mandate, focus } = {}) {
  if (!newsAgentConfigured()) throw new Error('news agent not configured');
  const data = await callAgent(buildQuery(mandate, focus));
  const companies = parseJsonArray(extractOutputText(data))
    .filter((c) => c && c.name)
    .map(toDeskCompany);
  return companies;
}
