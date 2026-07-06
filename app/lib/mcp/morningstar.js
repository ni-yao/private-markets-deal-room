// Minimal MCP client over the Streamable HTTP transport (JSON-RPC 2.0), plus a
// Morningstar convenience wrapper. Uses the OAuth refresh_token seam in
// lib/mcp/oauth.js to attach a bearer token, so the Deal Room server can call
// the Morningstar MCP headlessly once the one-time browser login has run.
//
// This is what fulfils the "Morningstar quality check" that the O1 news desk
// currently marks as pending (see lib/newsAgent.js toDeskCompany.quality).

import { getAccessToken, hasLogin } from './oauth.js';
import { config } from '../config.js';

const MCP_URL = config.connectors.morningstarMcpUrl;
const PROTOCOL_VERSION = '2025-06-18';

export function morningstarConfigured() {
  return hasLogin('morningstar');
}

// Parse a Streamable-HTTP response that may be application/json or an SSE
// (text/event-stream) body carrying `data: {json}` lines.
async function parseRpc(resp) {
  const ct = resp.headers.get('content-type') || '';
  const text = await resp.text();
  if (ct.includes('text/event-stream')) {
    let last = null;
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^data:\s*(.*)$/);
      if (m && m[1].trim()) {
        try { last = JSON.parse(m[1]); } catch { /* skip keep-alives */ }
      }
    }
    return last;
  }
  try { return JSON.parse(text); } catch { return null; }
}

// One MCP session: initialize -> notifications/initialized -> tools. Carries the
// Mcp-Session-Id header the server returns on initialize across later calls.
export class McpSession {
  constructor(provider = 'morningstar', url = MCP_URL) {
    this.provider = provider;
    this.url = url;
    this.sessionId = null;
    this.nextId = 1;
    this.token = null;
  }

  async #rpc(method, params, { notify = false } = {}) {
    if (!this.token) this.token = await getAccessToken(this.provider);
    const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
    if (!notify) body.id = this.nextId++;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const resp = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body) });
    const sid = resp.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (resp.status === 401) throw new Error('Morningstar MCP 401 — token rejected; re-run the login.');
    if (notify) return null;
    if (!resp.ok) throw new Error(`MCP ${method} failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const data = await parseRpc(resp);
    if (data?.error) throw new Error(`MCP ${method} error ${data.error.code}: ${data.error.message}`);
    return data?.result ?? null;
  }

  async initialize() {
    const result = await this.#rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'the-deal-room', version: '0.12.0' }
    });
    await this.#rpc('notifications/initialized', {}, { notify: true }).catch(() => {});
    return result;
  }

  listTools() {
    return this.#rpc('tools/list', {});
  }

  callTool(name, args = {}) {
    return this.#rpc('tools/call', { name, arguments: args });
  }
}

// Open + initialize a session in one call.
export async function connect(provider = 'morningstar') {
  const s = new McpSession(provider);
  await s.initialize();
  return s;
}

// List the tools Morningstar exposes (verifies end-to-end access).
export async function listMorningstarTools() {
  const s = await connect('morningstar');
  const tools = await s.listTools();
  return tools?.tools || [];
}

// ---- Company quality check (powers the O1 "Morningstar quality check") ------
// Morningstar covers listed securities. We map a company name/ticker to its
// Morningstar ID, pull the analyst/quantitative research, and parse the moat,
// star rating, fair value and financial-health signals into the desk's
// DeskQuality shape { rating, score(0-10), trend, flags[], note }.

const STAR_SCORE = { 1: 2.5, 2: 4, 3: 6, 4: 7.5, 5: 9 };

function firstText(result) {
  return (result?.content || []).map((c) => c.text || '').join('\n');
}

// Pick the best investment match: exact ticker first, then a confident name
// match (shared significant token). Returns null when nothing matches well
// enough — the caller then reports no coverage rather than risk wrong-company
// data (e.g. "Denny's" must NOT resolve to "Avery Dennison").
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(inc|corp|corporation|company|co|plc|ltd|llc|lp|the|group|holdings?|interactive|international|shs|cl|class)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickInvestment(lookupJson, name, ticker) {
  const flat = Object.values(lookupJson?.investments || {}).flat().filter(Boolean);
  if (!flat.length) return null;

  if (ticker) {
    const byTicker = flat.find((x) => (x.ticker_symbol || '').toUpperCase() === String(ticker).toUpperCase());
    if (byTicker) return byTicker;
  }

  const qWords = new Set(normName(name).split(' ').filter((w) => w.length >= 3));
  if (!qWords.size) return null;
  const scored = flat.map((x) => {
    const words = normName(x.investment_name).split(' ').filter(Boolean);
    const shared = words.filter((w) => qWords.has(w)).length;
    const exch = x.exchange ? 1 : 0;
    const st = x.investment_type === 'ST' ? 1 : 0;
    return { x, shared, score: shared * 3 + exch + st };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.shared >= 1 ? best.x : null;
}

function parseQuality(text) {
  const t = text.replace(/\\n/g, ' ');
  const lower = t.toLowerCase();

  const starM = t.match(/(\d)\s*-\s*star/i);
  const star = starM ? Number(starM[1]) : null;

  let moat = null;
  if (/wide[-\s]?moat|economic moat rating of wide|assign\w* .{0,20}wide/i.test(t)) moat = 'wide';
  else if (/narrow[-\s]?moat|economic moat rating of narrow/i.test(t)) moat = 'narrow';
  else if (/no[-\s]?moat|economic moat rating of none|lacks a (competitive|sustainable) advantage/i.test(t)) moat = 'none';

  let health = null;
  const hM = t.match(/(weak|poor|moderate|strong|robust|solid)\s+financial health/i);
  if (hM) health = hM[1].toLowerCase();

  const fvM = t.match(/fair value estimate of \$?([\d,.]+)/i);
  const fairValue = fvM ? fvM[1] : null;

  let valuation = null;
  if (/undervalued|shares are cheap|trading below/i.test(lower)) valuation = 'undervalued';
  else if (/overvalued|trading above (our )?fair value/i.test(lower)) valuation = 'overvalued';
  else if (/fairly valued|fair value ratio (?:of )?1\.0|near fair value/i.test(lower)) valuation = 'fair';

  const uncertainty = (t.match(/(low|medium|high|very high|extreme)\s+(?:fair value\s+)?uncertainty/i) || [])[1] || null;

  return { star, moat, health, fairValue, valuation, uncertainty };
}

function toDeskQuality(parsed, meta) {
  // Score from quality fundamentals (moat + financial health), nudged by star.
  let score = 4.0;
  if (parsed.moat === 'wide') score += 3;
  else if (parsed.moat === 'narrow') score += 1.5;
  if (parsed.health === 'strong' || parsed.health === 'robust' || parsed.health === 'solid') score += 2.5;
  else if (parsed.health === 'moderate') score += 1;
  else if (parsed.health === 'weak' || parsed.health === 'poor') score -= 0.5;
  if (parsed.star) score = (score + STAR_SCORE[parsed.star]) / 2; // blend with the headline star
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  const rating =
    parsed.moat === 'wide' ? 'Wide moat'
      : parsed.moat === 'narrow' ? 'Narrow moat'
        : parsed.moat === 'none' ? 'No moat'
          : parsed.star ? `${parsed.star}\u2605 Morningstar` : 'Rated';

  const trend =
    parsed.valuation === 'undervalued' ? 'improving'
      : parsed.valuation === 'overvalued' ? 'weakening'
        : 'stable';

  const flags = [];
  if (parsed.moat === 'none') flags.push('No economic moat');
  if (parsed.health === 'weak' || parsed.health === 'poor') flags.push('Weak financial health');
  if (/high|very high|extreme/i.test(parsed.uncertainty || '')) flags.push(`${parsed.uncertainty} uncertainty`);
  if (parsed.valuation === 'overvalued') flags.push('Trades above fair value');

  const bits = [];
  if (parsed.star) bits.push(`${parsed.star}-star`);
  if (parsed.moat) bits.push(`${parsed.moat} moat`);
  if (parsed.fairValue) bits.push(`fair value $${parsed.fairValue}`);
  if (parsed.valuation) bits.push(parsed.valuation);
  const summary = bits.length ? bits.join(' \u00b7 ') : 'quantitative rating retrieved';
  const when = meta.publishedAt ? ` (pub ${String(meta.publishedAt).slice(0, 10)})` : '';

  return {
    rating,
    score,
    trend,
    flags,
    note: `Morningstar ${meta.ticker ? meta.ticker + ' \u00b7 ' : ''}${summary}${when}. Live via Morningstar MCP.`,
    morningstarId: meta.morningstarId || null,
    ticker: meta.ticker || null,
    live: true
  };
}

// No-public-coverage result (private targets — most PE mid-market companies).
function noCoverage(name) {
  return {
    rating: 'No public coverage',
    score: 0,
    trend: 'stable',
    flags: ['Private / not listed'],
    note: `Morningstar has no listed-security coverage for "${name}" (Morningstar rates public stocks/funds). Likely private — use filings/analyst diligence instead.`,
    live: true
  };
}

// Run a live Morningstar quality check for a company name or ticker.
export async function quality(nameOrTicker, ticker = null) {
  const session = await connect('morningstar');
  const ids = [nameOrTicker, ticker].filter(Boolean);
  const look = await session.callTool('morningstar-id-lookup-tool', { investment_identifiers: ids });
  let lookJson;
  try { lookJson = JSON.parse(firstText(look)); } catch { lookJson = null; }
  const inv = pickInvestment(lookJson, nameOrTicker, ticker);
  if (!inv?.morningstar_id) return noCoverage(nameOrTicker);

  const research = await session.callTool('morningstar-analyst-research-tool', { investment_id: inv.morningstar_id });
  let resJson;
  try { resJson = JSON.parse(firstText(research)); } catch { resJson = null; }
  const results = resJson?.results || [];
  if (!results.length) return noCoverage(nameOrTicker);

  const text = results.map((r) => (typeof r.content === 'string' ? r.content : JSON.stringify(r.content))).join('\n');
  const parsed = parseQuality(text);
  return toDeskQuality(parsed, {
    morningstarId: inv.morningstar_id,
    ticker: inv.ticker_symbol || null,
    publishedAt: results[0]?.published_at || null
  });
}
