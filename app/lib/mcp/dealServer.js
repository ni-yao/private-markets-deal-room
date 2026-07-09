// Deal MCP server — exposes the fund's pipeline to Copilot Studio (or any MCP client)
// over the Streamable HTTP transport, the only transport Copilot Studio supports.
//
// READ tools reuse the analyst contracts (lib/dealTools.js) verbatim, so a Copilot
// Studio agent sees exactly the same bounded, size-capped views as the in-app Foundry
// analyst — reading from the same Cosmos-backed store:
//   • list_deals / get_deal / search_deals        — Stage-2 deals
//   • list_pipeline / get_candidate               — Stage-1 origination funnel
//   • get_candidate_artifact / get_deal_artifact  — the rich step deliverables
//
// ACTION tools MOVE the pipeline forward, GOVERNED BY PERSONA (lib/personaPolicy.js):
//   • send_to_screening / screen_candidate / triage_candidate / gate_candidate
//   • launch_deal / advance_deal / approve_ic / run_step / assign_lane / record_finding
//   • get_next_actions — what THIS persona may do now on a deal/candidate
// Only the partner may PURSUE at the gate (O4) and approve at the IC (D4); each sector
// MD may only touch its own diligence lane; the analyst runs the funnel. The persona is
// resolved per call (resolvePersona) and every action is authorization-checked
// server-side, so a tool call can never exceed the caller's persona powers.
//
// Stateless by design: a fresh server + transport per request (no session affinity),
// so it scales cleanly. Entra auth is applied separately by lib/mcp/entraAuth.js on
// /mcp; an optional MCP_WRITE_SCOPE additionally gates the ACTION tools.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  dispatchTool, TOOL_DESCRIPTIONS, DEAL_SECTIONS,
  listPipeline, candidateView, candidateArtifactView, dealArtifactView,
  icReadinessView, marketIntelView, citationAuditView, canonicalCompaniesView, canonicalCompanyView,
  dispatchAction, nextActionsFor
} from '../dealTools.js';
import { resolvePersona, PERSONAS } from '../personaPolicy.js';

const SERVER_INFO = { name: 'deal-room-mcp', version: '2.3.0' };
const READ_TOOLS = ['list_deals', 'get_deal', 'search_deals', 'list_pipeline', 'get_candidate', 'get_candidate_artifact', 'get_deal_artifact', 'get_ic_readiness', 'get_market_intel', 'get_citation_audit', 'get_companies', 'get_company', 'get_next_actions'];
const ACTION_TOOLS = ['send_to_screening', 'screen_candidate', 'triage_candidate', 'gate_candidate', 'launch_deal', 'advance_deal', 'approve_ic', 'run_step', 'assign_lane', 'record_finding', 'record_contribution', 'record_issue', 'resolve_issue', 'set_condition', 'snapshot_assumptions'];
const TOOL_NAMES = [...READ_TOOLS, ...ACTION_TOOLS];

// Optional extra scope required for ACTION (write) tools, beyond the base /mcp auth.
// e.g. set MCP_WRITE_SCOPE=deals.act to require agents to hold a write scope/role.
const WRITE_SCOPE = (process.env.MCP_WRITE_SCOPE || '').trim();

const personaEnum = z.enum(PERSONAS);
const personaArg = personaEnum.describe('The acting persona: analyst, partner, retail-md (commercial lane), ai-md (tech/AI lane), or supply-md (operations lane). Determines what you are allowed to do.');

function toContent(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

// Guard applied to every ACTION tool: resolve the persona, then (if configured)
// require the write scope/role on the caller's token.
function actionGuard(auth, argPersona) {
  const { persona } = resolvePersona({ argPersona, auth });
  if (!persona) return { error: 'persona-required', detail: 'Provide a valid persona (analyst | partner | retail-md | ai-md | supply-md).' };
  if (WRITE_SCOPE && auth?.mode === 'entra') {
    const held = new Set([...(auth.scopes || []), ...(auth.roles || [])]);
    if (!held.has(WRITE_SCOPE)) return { error: 'forbidden', detail: `Action tools require the "${WRITE_SCOPE}" scope/role on your token.` };
  }
  return { persona };
}

// Build a fresh MCP server with all read + action tools registered. `auth` is the
// validated Entra context (req.mcpAuth) so action tools can enforce the write scope.
// When auth.readOnly is set (the read-only surface used by Foundry-hosted / Teams
// agents), only the READ tools are registered — the write/action tools are omitted
// entirely, so a model-asserted persona can never drive a governed mutation there.
export function buildDealMcpServer(auth = { mode: 'disabled' }) {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  const readOnly = !!auth.readOnly;

  // ---- READ: Stage-2 deals (existing contracts) ---------------------------
  server.registerTool('list_deals',
    { title: 'List deals', description: TOOL_DESCRIPTIONS.list_deals, inputSchema: {} },
    async () => toContent(dispatchTool('list_deals', {}, { scope: 'portfolio' })));

  server.registerTool('get_deal',
    {
      title: 'Get deal', description: TOOL_DESCRIPTIONS.get_deal,
      inputSchema: {
        deal_id: z.string().describe('The deal id (from list_deals or search_deals).'),
        sections: z.array(z.string()).optional().describe('Optional subset: summary, financials, workstreams, memo, compliance, risks, activity. Unknown values are ignored.')
      }
    },
    async ({ deal_id, sections }) => toContent(dispatchTool('get_deal', { deal_id, sections }, { scope: 'portfolio' })));

  server.registerTool('search_deals',
    { title: 'Search deals', description: TOOL_DESCRIPTIONS.search_deals, inputSchema: { query: z.string().describe('Keywords, e.g. a company name or a sector.') } },
    async ({ query }) => toContent(dispatchTool('search_deals', { query }, { scope: 'portfolio' })));

  // ---- READ: Stage-1 funnel + artifacts -----------------------------------
  server.registerTool('list_pipeline',
    { title: 'List pipeline', description: TOOL_DESCRIPTIONS.list_pipeline, inputSchema: {} },
    async () => toContent(listPipeline()));

  server.registerTool('get_candidate',
    { title: 'Get candidate', description: TOOL_DESCRIPTIONS.get_candidate, inputSchema: { candidate_id: z.string().describe('The candidate id (from list_pipeline).') } },
    async ({ candidate_id }) => toContent(candidateView(candidate_id)));

  server.registerTool('get_candidate_artifact',
    { title: 'Get candidate artifact', description: TOOL_DESCRIPTIONS.get_candidate_artifact, inputSchema: { candidate_id: z.string().describe('The candidate id.') } },
    async ({ candidate_id }) => toContent(await candidateArtifactView(candidate_id)));

  server.registerTool('get_deal_artifact',
    {
      title: 'Get deal artifact', description: TOOL_DESCRIPTIONS.get_deal_artifact,
      inputSchema: { deal_id: z.string().describe('The deal id.'), step: z.enum(['D1', 'D2', 'D3', 'D4', 'D5']).describe('The diligence step: D1 plan, D2 findings, D3 final memo, D4 execution, D5 close-out.') }
    },
    async ({ deal_id, step }) => toContent(await dealArtifactView(deal_id, step)));

  server.registerTool('get_ic_readiness',
    { title: 'Get IC readiness', description: TOOL_DESCRIPTIONS.get_ic_readiness, inputSchema: { deal_id: z.string().describe('The deal id.') } },
    async ({ deal_id }) => toContent(icReadinessView(deal_id)));

  server.registerTool('get_market_intel',
    { title: 'Get market intelligence', description: TOOL_DESCRIPTIONS.get_market_intel, inputSchema: { sector: z.string().optional().describe('Optional sector to bias the comparable deals.') } },
    async ({ sector }) => toContent(marketIntelView({ sector })));

  server.registerTool('get_citation_audit',
    { title: 'Get citation audit', description: TOOL_DESCRIPTIONS.get_citation_audit, inputSchema: { deal_id: z.string().describe('The deal id.') } },
    async ({ deal_id }) => toContent(citationAuditView(deal_id)));

  server.registerTool('get_companies',
    { title: 'Get canonical companies', description: TOOL_DESCRIPTIONS.get_companies, inputSchema: { in_funnel: z.boolean().optional().describe('Filter to companies that are (true) / are not (false) in the screening funnel.') } },
    async ({ in_funnel }) => toContent(canonicalCompaniesView({ inFunnel: in_funnel })));

  server.registerTool('get_company',
    { title: 'Get canonical company', description: TOOL_DESCRIPTIONS.get_company, inputSchema: { id: z.string().describe('The canonical company id (co-…) or a feed id (desk/candidate/signal).') } },
    async ({ id }) => toContent(canonicalCompanyView(id)));

  server.registerTool('get_next_actions',
    {
      title: 'Get next actions', description: TOOL_DESCRIPTIONS.get_next_actions,
      inputSchema: { persona: personaArg, deal_id: z.string().optional().describe('A deal id.'), candidate_id: z.string().optional().describe('A candidate id.') }
    },
    async ({ persona, deal_id, candidate_id }) => {
      const { persona: p } = resolvePersona({ argPersona: persona, auth });
      if (!p) return toContent({ error: 'persona-required' });
      return toContent(nextActionsFor(p, { deal_id, candidate_id }));
    });

  // ---- ACTION tools (persona-governed writes) -----------------------------
  // Omitted entirely on the read-only surface — a Foundry-hosted / Teams agent can
  // research the pipeline but cannot mutate it there (writes stay Entra-guarded on /mcp).
  const action = readOnly
    ? () => {}
    : (name, extraSchema, mapArgs) => server.registerTool(
      name,
      { title: name, description: TOOL_DESCRIPTIONS[name], inputSchema: { persona: personaArg, ...extraSchema } },
      async (args) => {
        const guard = actionGuard(auth, args.persona);
        if (guard.error) return toContent(guard);
        return toContent(await dispatchAction(name, mapArgs(args), { persona: guard.persona }));
      }
    );

  const dispositionArg = z.enum(['advance', 'pass', 'park']).describe('advance | pass | park.');
  const reasonArg = z.string().optional().describe('Reason code / note for a pass or park.');
  const laneEnum = z.enum(['commercial', 'financial', 'legal', 'tax', 'techai', 'operations', 'esg']);

  action('send_to_screening', { target_id: z.string().describe('The sourced target / desk id to send to screening.') }, (a) => ({ target_id: a.target_id, desk_id: a.target_id }));
  action('screen_candidate', { candidate_id: z.string(), action: dispositionArg, reason: reasonArg }, (a) => ({ candidate_id: a.candidate_id, action: a.action, reason: a.reason }));
  action('triage_candidate', { candidate_id: z.string(), action: dispositionArg, reason: reasonArg }, (a) => ({ candidate_id: a.candidate_id, action: a.action, reason: a.reason }));
  action('gate_candidate', { candidate_id: z.string(), action: dispositionArg, reason: reasonArg }, (a) => ({ candidate_id: a.candidate_id, action: a.action, reason: a.reason }));
  action('launch_deal', { deal_id: z.string() }, (a) => ({ deal_id: a.deal_id }));
  action('advance_deal', { deal_id: z.string(), override_reason: z.string().optional().describe('PARTNER ONLY: reason to override an IC-readiness gate (advancing past a NOT-READY verdict into IC).') }, (a) => ({ deal_id: a.deal_id, override_reason: a.override_reason }));
  action('approve_ic', { deal_id: z.string(), override_reason: z.string().optional().describe('Reason to approve at IC when the readiness verdict is NOT-READY (recorded as a partner override audit event).') }, (a) => ({ deal_id: a.deal_id, override_reason: a.override_reason }));
  action('run_step', { deal_id: z.string(), step: z.string().describe('The step key, e.g. D2.') }, (a) => ({ deal_id: a.deal_id, step: a.step }));
  action('assign_lane', { deal_id: z.string(), lane: laneEnum, md: z.string().describe('The MD / lead id, e.g. supply-md, finance-md.') }, (a) => ({ deal_id: a.deal_id, lane: a.lane, md: a.md }));
  action('record_finding',
    { deal_id: z.string(), lane: laneEnum.optional().describe('Lane; defaults to your own lane for sector MDs.'), text: z.string().describe('The finding.'), severity: z.enum(['positive', 'neutral', 'caution', 'negative', 'risk']).optional(), source: z.string().optional() },
    (a) => ({ deal_id: a.deal_id, lane: a.lane, text: a.text, severity: a.severity, source: a.source }));
  action('record_contribution',
    { deal_id: z.string(),
      lane: laneEnum.optional().describe('Lane; defaults to your own lane for sector MDs.'),
      kind: z.enum(['guidance', 'value_add', 'diligence']).describe('guidance | value_add | diligence.'),
      text: z.string().describe('The contribution text.'),
      severity: z.enum(['positive', 'neutral', 'caution', 'negative', 'risk']).optional().describe('For kind=diligence only.'),
      source: z.string().optional() },
    (a) => ({ deal_id: a.deal_id, lane: a.lane, kind: a.kind, text: a.text, severity: a.severity, source: a.source }));
  action('record_issue',
    { deal_id: z.string(),
      lane: laneEnum.optional().describe('Lane; defaults to your own lane for sector MDs.'),
      title: z.string().describe('The issue title.'),
      severity: z.enum(['positive', 'neutral', 'caution', 'negative', 'risk']).optional().describe('Issue severity.'),
      owner: z.string().optional().describe('Who owns resolving it.'),
      resolution_path: z.string().optional().describe('How it gets resolved.'),
      due_date: z.string().optional().describe('Target resolution date (ISO).') },
    (a) => ({ deal_id: a.deal_id, lane: a.lane, title: a.title, severity: a.severity, owner: a.owner, resolution_path: a.resolution_path, due_date: a.due_date }));
  action('resolve_issue',
    { deal_id: z.string(), issue_id: z.string().describe('The issue id (from get_ic_readiness unresolvedRisks).'),
      status: z.enum(['open', 'mitigating', 'resolved']).optional().describe('New status.'),
      resolution_path: z.string().optional() },
    (a) => ({ deal_id: a.deal_id, issue_id: a.issue_id, status: a.status, resolution_path: a.resolution_path }));
  action('set_condition',
    { deal_id: z.string(), text: z.string().describe('The IC condition.'),
      owner: z.string().optional(), status: z.enum(['proposed', 'accepted', 'satisfied']).optional() },
    (a) => ({ deal_id: a.deal_id, text: a.text, owner: a.owner, status: a.status }));
  action('snapshot_assumptions',
    { deal_id: z.string(), label: z.string().optional().describe('A label for the snapshot, e.g. "IC pre-read v1".') },
    (a) => ({ deal_id: a.deal_id, label: a.label }));

  return server;
}

// Express handler for POST /mcp — stateless Streamable HTTP. Passes the validated
// Entra context so action tools can enforce persona + write scope.
export async function dealMcpHandler(req, res) {
  return handleWith(req, res, req.mcpAuth || { mode: 'disabled' });
}

// Express handler for POST /mcp-ro — the READ-ONLY surface. Forces readOnly regardless
// of how the caller authenticated, so only the read tools are ever registered here.
export async function dealMcpReadonlyHandler(req, res) {
  return handleWith(req, res, { ...(req.mcpAuth || {}), readOnly: true });
}

async function handleWith(req, res, auth) {
  const server = buildDealMcpServer(auth);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal server error: ${String(err?.message || err)}` },
        id: null
      });
    }
  }
}

// GET/DELETE aren't used in stateless mode — reply with a JSON-RPC "method not allowed".
export function dealMcpMethodNotAllowed(_req, res) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for the streamable MCP transport.' },
    id: null
  });
}

export function dealMcpInfo() {
  return { server: SERVER_INFO.name, version: SERVER_INFO.version, readTools: READ_TOOLS, actionTools: ACTION_TOOLS, writeScope: WRITE_SCOPE || null, toolCount: TOOL_NAMES.length };
}

// Info for the read-only surface (used by Foundry-hosted / Teams agents).
export function dealMcpReadonlyInfo() {
  return { path: '/mcp-ro', readTools: READ_TOOLS, toolCount: READ_TOOLS.length };
}
