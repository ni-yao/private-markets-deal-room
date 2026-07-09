// User (requesting-identity) authorization for the agents — the RBAC layer that
// composes with personaPolicy. personaPolicy governs WHAT a given persona may do;
// this governs WHICH persona/scope a *verified requesting user* may act through.
//
// Identity is supplied by a trusted caller (the Teams bot passes the Bot-Framework-
// authenticated `from.aadObjectId` + name with a shared trust key; the tab passes
// its SSO-derived identity). Enforcement is server-side; a client can never widen
// its own powers. Unknown/untrusted callers fall back to DEFAULT_AGENT_ROLE.
//
// Role mapping is config-driven (env, no hardcoded tenant ids): each list matches
// a user by Entra object id OR UPN local-part OR lowercased display name, so it
// works for real Teams users AND the demo "view as" roster.

const norm = (s) => String(s || '').trim().toLowerCase();
const localPart = (u) => norm(u).split('@')[0];
const listEnv = (name, dflt = '') =>
  String(process.env[name] ?? dflt).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Demo-safe defaults (match user1-5 by name/upn); set the *_IDS env with real
// Entra object ids in production for a directory-driven mapping.
const PARTNER_IDS = listEnv('PARTNER_IDS', 'partner,amit desai,desaiamit');
const DEAL_TEAM_IDS = listEnv('DEAL_TEAM_IDS', 'user1,user2,user3,user4');
const ANALYST_IDS = listEnv('ANALYST_IDS', 'user5');
// What an unauthenticated/unknown caller gets (the tab/web paths that don't pass a
// trusted identity). Keep 'deal-team' to preserve existing demos; set 'analyst' to
// make every unidentified caller read-only.
const DEFAULT_ROLE = (process.env.DEFAULT_AGENT_ROLE || 'deal-team').trim();

// role → the personas the user may ACT AS (each then governed by personaPolicy),
// whether they may perform WRITES, and whether they may see Stage-2 (diligence) deals.
const ROLE = {
  partner:     { personas: ['analyst', 'partner', 'retail-md', 'ai-md', 'supply-md'], write: true,  stage2: true },
  'deal-team': { personas: ['analyst', 'retail-md', 'ai-md', 'supply-md'],            write: true,  stage2: true },
  analyst:     { personas: ['analyst'],                                               write: false, stage2: false },
  member:      { personas: ['analyst'],                                               write: false, stage2: false },
};

const ROLE_LABEL = {
  partner: 'Partner / Deal Sponsor', 'deal-team': 'Deal Team', analyst: 'Analyst', member: 'Member',
};

// Resolve a VERIFIED identity to a role. `identity` = { oid, upn, name }.
export function roleForUser(identity = {}) {
  const keys = [norm(identity.oid), localPart(identity.upn), norm(identity.upn), norm(identity.name)].filter(Boolean);
  const hit = (list) => keys.some((k) => list.includes(k));
  if (hit(PARTNER_IDS)) return 'partner';
  if (hit(DEAL_TEAM_IDS)) return 'deal-team';
  if (hit(ANALYST_IDS)) return 'analyst';
  return 'member';
}

// Full access profile for an identity (or the default role when identity is absent).
export function accessFor(identity) {
  const role = identity && (identity.oid || identity.upn || identity.name)
    ? roleForUser(identity)
    : (ROLE[DEFAULT_ROLE] ? DEFAULT_ROLE : 'member');
  const spec = ROLE[role] || ROLE.member;
  return {
    role,
    roleLabel: ROLE_LABEL[role] || role,
    allowedPersonas: spec.personas,
    canWrite: spec.write,
    canViewStage2: spec.stage2,
  };
}

// May this identity act through `requestedPersona`? Returns the EFFECTIVE persona
// (downgraded to read-only 'analyst' when not authorized) + a reason on denial.
export function authorizePersona(identity, requestedPersona) {
  const access = accessFor(identity);
  const want = requestedPersona || 'analyst';
  if (access.allowedPersonas.includes(want)) return { ok: true, persona: want, access };
  return {
    ok: false,
    persona: 'analyst',
    access,
    reason: `As ${access.roleLabel}, you can’t act as the ${want} agent. That’s reserved for the ${want === 'partner' ? 'Partner / Deal Sponsor' : 'deal team'}. I’ll answer as the analyst (read-only) instead.`,
  };
}

// Gate access to a specific deal by its stage (Stage-2 diligence = deal-team/partner only).
export function authorizeDealAccess(identity, dealStageOrName) {
  const access = accessFor(identity);
  const s = String(dealStageOrName || '');
  const isStage2 = /^d/i.test(s) || /diligence|approval/i.test(s);
  if (isStage2 && !access.canViewStage2) {
    return { ok: false, access, reason: `This deal is in Stage 2 (Diligence & Approval), which is restricted to the deal team. As ${access.roleLabel} you don’t have access.` };
  }
  return { ok: true, access };
}
