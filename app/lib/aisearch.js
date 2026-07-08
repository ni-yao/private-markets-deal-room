// Azure AI Search retrieval over the deal-document index (dealroomaisearch).
//
// The index `multimodal-rag-1783522048602` holds the fund's ingested deal documents:
//   • CIMs        — Confidential Information Memoranda (deal research memoranda), and
//   • CRM comms   — synthetic CRM communication attachments (IC status, legal review,
//                   meeting notes, financial/valuation summaries, DD updates), each
//                   tagged with Company / Deal / Stage / Email Subject.
//
// It was built with an integrated Azure OpenAI vectorizer (text-embedding-3-small),
// so we run TRUE HYBRID retrieval — semantic ranking + server-side vectorization of
// the query text — with no embedding model to manage here. This gives every step of
// the deal (and every persona agent) grounded, cited passages from the real
// documents instead of assumptions.
//
// Two uses:
//   1. searchDocuments()          — grounded document retrieval for analysis/citation.
//   2. getCompanyCommunications() — the CRM communications timeline for a company,
//      used as the CRM system of record for this proof of concept (until the real
//      CRM connector lands).
//
// Auth: a read-only query key (AI_SEARCH_KEY, a Container App secret) OR the app's
// managed identity (DefaultAzureCredential against the Search data plane) when no key
// is set. Honest status (aiSearchStatus): reports configured / auth mode / last error,
// and every failure surfaces the REAL reason — never a silent empty result.

import { DefaultAzureCredential } from '@azure/identity';

const ENDPOINT = (process.env.AI_SEARCH_ENDPOINT || '').replace(/\/$/, '');
const INDEX = process.env.AI_SEARCH_INDEX || '';
const API_VERSION = process.env.AI_SEARCH_API_VERSION || '2024-07-01';
const SEMANTIC_CONFIG =
  process.env.AI_SEARCH_SEMANTIC_CONFIG || (INDEX ? `${INDEX}-semantic-configuration` : '');
const VECTOR_FIELD = process.env.AI_SEARCH_VECTOR_FIELD || 'content_embedding';
// 'unset' is the inert bicep placeholder (mirrors mcp-readonly-key), treated as no key.
const KEY_RAW = (process.env.AI_SEARCH_KEY || '').trim();
const KEY = KEY_RAW === 'unset' ? '' : KEY_RAW;
const MI_SCOPE = 'https://search.azure.com/.default';
const TIMEOUT_MS = 20_000;

let _cred = null;
let _token = null;
let _tokenExp = 0;
let _lastQueryAt = null;
let _lastError = null;

function credential() {
  if (!_cred) _cred = new DefaultAzureCredential();
  return _cred;
}

async function bearer() {
  const now = Date.now();
  if (_token && now < _tokenExp - 60_000) return _token;
  const t = await credential().getToken(MI_SCOPE);
  _token = t.token;
  _tokenExp = t.expiresOnTimestamp || now + 30 * 60_000;
  return _token;
}

export function aiSearchConfigured() {
  return !!(ENDPOINT && INDEX);
}

// Auth mode resolution (no silent fallback): a configured key uses key auth; otherwise
// the app's managed identity is used against the Search data plane. If neither the
// endpoint/index is set, the module is simply "unconfigured".
function authMode() {
  if (!aiSearchConfigured()) return 'unconfigured';
  return KEY ? 'apikey' : 'managed-identity';
}

async function authHeaders() {
  if (KEY) return { 'api-key': KEY };
  const token = await bearer();
  return { Authorization: `Bearer ${token}` };
}

export function aiSearchStatus() {
  return {
    configured: aiSearchConfigured(),
    authMode: authMode(),
    endpoint: ENDPOINT || null,
    index: INDEX || null,
    apiVersion: API_VERSION,
    lastQueryAt: _lastQueryAt,
    lastError: _lastError
  };
}

async function postSearch(body) {
  if (!aiSearchConfigured()) {
    throw new Error('AI Search not configured (set AI_SEARCH_ENDPOINT and AI_SEARCH_INDEX).');
  }
  const url = `${ENDPOINT}/indexes/${encodeURIComponent(INDEX)}/docs/search?api-version=${API_VERSION}`;
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    _lastError = `network: ${String(e?.message || e)}`;
    throw new Error(`AI Search unreachable: ${_lastError}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    _lastError = `HTTP ${res.status}: ${text.slice(0, 300)}`;
    throw new Error(`AI Search query failed — ${_lastError}`);
  }
  _lastQueryAt = new Date().toISOString();
  _lastError = null;
  return res.json();
}

// ---- Document header parsing ------------------------------------------------
// Both document families carry a small structured header at the top of the chunk
// text. We parse Company / Deal / Stage / doc-type / Email Subject / date so callers
// (and the CRM view) get typed metadata, not just raw text.
const RE = {
  company: /Company:\s*(.+)/i,
  targetCompany: /Target Company:\s*(.+)/i,
  deal: /Deal:\s*(.+)/i,
  investmentOpportunity: /Investment Opportunity:\s*(.+)/i,
  stage: /Stage:\s*(.+)/i,
  emailSubject: /Email Subject:\s*(.+)/i,
  generatedDate: /Generated Date:\s*(.+)/i,
  dealDate: /Deal Date:\s*(.+)/i,
  attachment: /Attachment File:\s*(.+)/i
};

function firstLine(text) {
  return String(text || '').split('\n').map((l) => l.trim()).find((l) => l.length) || '';
}

function grab(text, re) {
  const m = String(text || '').match(re);
  return m ? m[1].trim() : null;
}

// Strip a trailing "(TICKER)" and legal suffix noise for display.
function cleanCompany(s) {
  return String(s || '').replace(/\s*\([A-Z.]{1,6}\)\s*$/, '').trim();
}

function classify(title, text) {
  const t = String(text || '');
  if (/CONFIDENTIAL INFORMATION MEMORANDUM/i.test(t) || /^CIM_/i.test(title || '')) return 'cim';
  if (/Attachment File:/i.test(t) || /Email Subject:/i.test(t) || /\(Synthetic\)/i.test(t)) return 'crm';
  return 'document';
}

function parseDoc(hit) {
  const title = hit.document_title || '';
  const text = hit.content_text || '';
  const kind = classify(title, text);
  const company = cleanCompany(grab(text, RE.company) || grab(text, RE.targetCompany));
  const caption = hit['@search.captions']?.[0]?.text || null;
  const snippet = (caption || text).replace(/\s+/g, ' ').trim().slice(0, 400);
  return {
    title,
    kind,
    company: company || null,
    deal: grab(text, RE.deal) || grab(text, RE.investmentOpportunity) || null,
    stage: grab(text, RE.stage) || null,
    docType: kind === 'crm' ? firstLine(text).replace(/\s*\(Synthetic\)\s*$/i, '') : kind === 'cim' ? 'Confidential Information Memorandum' : firstLine(text),
    emailSubject: grab(text, RE.emailSubject) || null,
    date: grab(text, RE.generatedDate) || grab(text, RE.dealDate) || null,
    score: hit['@search.rerankerScore'] ?? hit['@search.score'] ?? null,
    snippet
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|corp|co|ltd|llc|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

function matchesCompany(parsed, company) {
  if (!company) return true;
  const a = norm(parsed.company);
  const b = norm(company);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// ---- Public retrieval -------------------------------------------------------

// Hybrid (semantic + vector) search over the deal-document index. Returns typed,
// bounded hits. `company` post-filters to a company; `kind` restricts to 'cim' or
// 'crm'; `docType` matches the CRM document-type label. Throws with the real reason
// on failure (never returns a silent empty array to mask an outage).
export async function searchDocuments(query, { company, kind, docType, top = 8 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { query: '', hits: [] };
  // Bias the vectorized query with the company name when provided.
  const searchText = company ? `${company} ${q}` : q;
  const body = {
    search: searchText,
    queryType: 'semantic',
    semanticConfiguration: SEMANTIC_CONFIG,
    top: Math.min(Math.max(top * 2, top), 30),
    select: 'document_title,content_text',
    captions: 'extractive',
    vectorQueries: [{ kind: 'text', text: searchText, fields: VECTOR_FIELD, k: 30 }]
  };
  const data = await postSearch(body);
  let hits = (data.value || []).map(parseDoc);
  if (company) hits = hits.filter((h) => matchesCompany(h, company));
  if (kind) hits = hits.filter((h) => h.kind === kind);
  if (docType) hits = hits.filter((h) => norm(h.docType).includes(norm(docType)));
  return { query: q, company: company || null, index: INDEX, hits: hits.slice(0, top) };
}

// The CRM communications timeline for a company — this is the CRM system of record
// for the proof of concept. Retrieves the company's CRM attachments (IC status, legal
// review, meeting notes, financial/valuation, DD updates) and returns them grouped by
// document type, newest first. Throws with the real reason on failure.
export async function getCompanyCommunications(company, { top = 25 } = {}) {
  const name = String(company || '').trim();
  if (!name) return { company: '', communications: [] };
  // Broad recall for the company, then keep CRM docs only.
  const { hits } = await searchDocuments(`${name} deal communications diligence IC status legal meeting notes`, { company: name, kind: 'crm', top });
  const communications = hits
    .map((h) => ({
      title: h.title,
      docType: h.docType,
      deal: h.deal,
      stage: h.stage,
      subject: h.emailSubject,
      date: h.date,
      summary: h.snippet
    }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const byType = {};
  for (const c of communications) byType[c.docType] = (byType[c.docType] || 0) + 1;
  return {
    company: name,
    source: 'Azure AI Search (dealroomaisearch) — CRM proof-of-concept index',
    index: INDEX,
    count: communications.length,
    byType,
    communications
  };
}

// Grounded document evidence for a deal (CIMs + CRM), for step analysis and IC
// citation. Returns a compact evidence list; on failure returns { error } so a caller
// (e.g. the IC readiness board) can surface the real reason without crashing.
export async function getDealDocumentEvidence(company, { query, top = 6 } = {}) {
  if (!aiSearchConfigured()) return { configured: false, evidence: [] };
  try {
    const q = query || `${company} valuation risks diligence findings investment thesis`;
    const { hits } = await searchDocuments(q, { company, top });
    return {
      configured: true,
      count: hits.length,
      evidence: hits.map((h) => ({ title: h.title, kind: h.kind, docType: h.docType, deal: h.deal, stage: h.stage, snippet: h.snippet, score: h.score }))
    };
  } catch (e) {
    return { configured: true, error: String(e?.message || e).slice(0, 240), evidence: [] };
  }
}

// Connectivity probe for the connectors panel — a real round-trip.
export async function testAiSearch() {
  const t0 = Date.now();
  const data = await postSearch({ search: '*', top: 1, select: 'document_title', count: true });
  return { latencyMs: Date.now() - t0, count: data['@odata.count'] ?? null };
}
