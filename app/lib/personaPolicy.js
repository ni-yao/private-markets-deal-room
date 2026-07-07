// Persona authorization policy — governs WHAT each of the five persona agents may
// DO when they act on the pipeline through the Deal MCP server. This is the
// server-side guardrail that mirrors the real fund's separation of duties:
//   • only the PARTNER (deal sponsor) can PURSUE at the Screening Gate (O4) and
//     approve at the Investment Committee (D4);
//   • the ANALYST (deal associate) runs the funnel (screen/triage), launches
//     diligence and compiles findings/artifacts;
//   • each SECTOR MD owns exactly ONE diligence lane and may only record findings
//     into that lane.
//
// The persona is resolved once per request (resolvePersona) and every action tool
// is checked with can(); a tool call can never exceed the caller's persona powers,
// no matter what arguments the agent emits — the same defense-in-depth pattern the
// read tools already use for deal `scope`.

// The five persona ids (== data/personas.js ids == data/workspace.js MD_OPTIONS ids).
export const PERSONAS = ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'];

// Each sector-MD persona owns exactly one diligence lane.
export const PERSONA_LANE = {
  'retail-md': 'commercial',
  'ai-md': 'techai',
  'supply-md': 'operations'
};

const LANE_LABEL = { commercial: 'Commercial DD', techai: 'Tech / AI DD', operations: 'Operations DD' };

// Human labels for the persona (for tool responses / next-action prompts).
export const PERSONA_LABEL = {
  analyst: 'Analyst — Deal Associate',
  partner: 'Partner / MD — Deal Sponsor',
  'retail-md': 'Retail Sector MD (Commercial lane)',
  'ai-md': 'AI MD (Tech / AI lane)',
  'supply-md': 'Supply Chain MD (Operations lane)'
};

// The full action catalog exposed to agents, each with the personas allowed to
// invoke it. `laneScoped: true` means the action is further restricted to the
// persona's own lane (record_finding). Grounded in the fund's separation of duties.
export const ACTIONS = {
  send_to_screening: { label: 'Send a sourced target to screening (O1 → O2)', personas: ['analyst', 'partner'] },
  screen_candidate: { label: 'Record the Auto-Screen decision (O2: advance / pass / park)', personas: ['analyst', 'partner'] },
  triage_candidate: { label: 'Record the Triage decision (O3: advance / pass / park)', personas: ['analyst', 'partner'] },
  gate_candidate: { label: 'Record the Screening-Gate decision (O4: PURSUE / pass / park)', personas: ['partner'] },
  launch_deal: { label: 'Launch diligence — provision the workspace (screened → D1)', personas: ['analyst', 'partner'] },
  run_step: { label: 'Run a diligence step to produce its deliverable', personas: ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'] },
  record_finding: { label: 'Record a diligence finding into a workstream lane', personas: ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'], laneScoped: true },
  record_contribution: { label: 'Contribute guidance, a value-add lever, or a diligence finding into a lane', personas: ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'], laneScoped: true },
  record_issue: { label: 'Log a diligence issue (severity + owner + resolution path) into the issue log', personas: ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'], laneScoped: true },
  resolve_issue: { label: 'Update or resolve a logged diligence issue', personas: ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'] },
  set_condition: { label: 'Set or update an IC condition for approval', personas: ['analyst', 'partner'] },
  snapshot_assumptions: { label: 'Snapshot the current key assumptions as an IC-draft baseline', personas: ['analyst', 'partner'] },
  assign_lane: { label: 'Assign a diligence lane to an MD', personas: ['analyst', 'partner'] },
  advance_deal: { label: 'Advance the deal to the next diligence step', personas: ['analyst', 'partner'] },
  approve_ic: { label: 'Record the IC approval and advance past the IC gate (D4)', personas: ['partner'] }
};

// Is `persona` allowed to perform `action`? For lane-scoped actions, `lane` must
// match the persona's owned lane (sector MDs) — analyst/partner may touch any lane.
export function can(persona, action, { lane } = {}) {
  const spec = ACTIONS[action];
  if (!spec) return { ok: false, reason: `Unknown action "${action}".` };
  if (!PERSONAS.includes(persona)) return { ok: false, reason: `Unknown persona "${persona}".` };
  if (!spec.personas.includes(persona)) {
    return { ok: false, reason: `The ${PERSONA_LABEL[persona]} is not authorized to ${spec.label.toLowerCase()}. This is reserved for: ${spec.personas.map((p) => PERSONA_LABEL[p]).join(', ')}.` };
  }
  if (spec.laneScoped && PERSONA_LANE[persona]) {
    // A sector MD may only contribute to its own lane.
    if (lane && lane !== PERSONA_LANE[persona]) {
      return { ok: false, reason: `The ${PERSONA_LABEL[persona]} owns the ${LANE_LABEL[PERSONA_LANE[persona]]} lane and cannot contribute to the ${LANE_LABEL[lane] || lane} lane.` };
    }
  }
  return { ok: true };
}

// The actions a persona MAY take, keyed by the entity's current stage. Used by the
// get_next_actions tool so an agent proposes only allowed, stage-valid moves.
// `stage` is a candidate stage (O2/O3/O4) or a deal step (SCR/D1..D5).
export function nextActions(persona, { kind, stage } = {}) {
  const allow = (action, extra = {}) => (can(persona, action).ok ? [{ action, label: ACTIONS[action].label, ...extra }] : []);
  const out = [];
  if (kind === 'candidate') {
    if (stage === 'O2') out.push(...allow('screen_candidate'));
    else if (stage === 'O3') out.push(...allow('triage_candidate'));
    else if (stage === 'O4') out.push(...allow('gate_candidate'));
  } else if (kind === 'deal') {
    if (stage === 'SCR') out.push(...allow('launch_deal'));
    else if (stage === 'D1') out.push(...allow('advance_deal'), ...allow('run_step'), ...allow('assign_lane'), ...allow('record_contribution'), ...allow('record_issue'));
    else if (stage === 'D2') out.push(...allow('record_contribution'), ...allow('record_finding'), ...allow('record_issue'), ...allow('resolve_issue'), ...allow('run_step'), ...allow('advance_deal'));
    else if (stage === 'D3') out.push(...allow('record_contribution'), ...allow('record_issue'), ...allow('resolve_issue'), ...allow('set_condition'), ...allow('snapshot_assumptions'), ...allow('run_step'), ...allow('advance_deal'));
    else if (stage === 'D4') out.push(...allow('set_condition'), ...allow('resolve_issue'), ...allow('approve_ic'), ...allow('advance_deal'));
    else if (stage === 'D5') out.push(...allow('run_step'));
  }
  return out;
}

// ---- Persona resolution seam ------------------------------------------------
// Option 1 (current): the agent declares its persona as a validated tool arg (a
// governance guardrail among trusted first-party agents). To harden later —
// Option 2 (per-agent app registration → appid map) or Option 3 (delegated
// user → persona map) — swap ONLY this function; no tool or policy changes.
//
// Precedence: an explicit, validated arg persona wins; else a mapping from the
// authenticated caller (appId/sub) when configured; else a configured default.
const APPID_PERSONA = parseMap(process.env.MCP_PERSONA_BY_APPID); // "appid1=partner,appid2=analyst"
const DEFAULT_PERSONA = (process.env.MCP_DEFAULT_PERSONA || '').trim();

function parseMap(s) {
  const map = {};
  for (const pair of String(s || '').split(',')) {
    const [k, v] = pair.split('=').map((x) => (x || '').trim());
    if (k && PERSONAS.includes(v)) map[k.toLowerCase()] = v;
  }
  return map;
}

export function resolvePersona({ argPersona, auth } = {}) {
  const arg = (argPersona || '').trim().toLowerCase();
  if (arg && PERSONAS.includes(arg)) return { persona: arg, source: 'arg' };
  const appId = (auth?.appId || '').toLowerCase();
  if (appId && APPID_PERSONA[appId]) return { persona: APPID_PERSONA[appId], source: 'appid' };
  if (DEFAULT_PERSONA && PERSONAS.includes(DEFAULT_PERSONA)) return { persona: DEFAULT_PERSONA, source: 'default' };
  return { persona: null, source: 'none' };
}
