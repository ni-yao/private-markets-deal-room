// Bridge to the shared Deal Room business logic (app/lib + app/data).
//
// This is the ONLY place the Teams app reaches into the app package, and ONLY
// for Teams-specific glue — never for deal data (that always comes from the
// shared backend over HTTP). Imports are dynamic + guarded so the Teams app
// still boots if the app package/deps aren't present.

let personaCache = null;

async function loadPersonas() {
  if (personaCache) return personaCache;
  try {
    const mod = await import('../../app/data/personas.js');
    personaCache = {
      personas: mod.personas ?? [],
      personaById: mod.personaById ?? {},
    };
  } catch {
    personaCache = { personas: [], personaById: {} };
  }
  return personaCache;
}

export async function listPersonas() {
  const { personas } = await loadPersonas();
  return personas;
}

// Deterministically map a signed-in user to a Deal Room persona (per-user context).
// Real mapping (by group / directory attribute) slots in here later; for now a
// stable hash keeps the demo consistent per user.
export async function personaForUser(identity) {
  const { personas } = await loadPersonas();
  if (!personas.length) return null;
  const key = String(identity?.oid || identity?.upn || 'anonymous');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return personas[hash % personas.length];
}

// ---- Stage visibility (role-based) ------------------------------------------
// Stage 1 (Origination & Screening) is visible to everyone with app access.
// Stage 2 (Diligence & Approval) is restricted to the DEAL TEAM. Membership is
// configurable via env; the demo uses user1-4 as the deal team and user5 as an
// Analyst (Stage 1 only) to show the lockdown.
const DEAL_TEAM = (process.env.DEAL_TEAM_UPNS || 'user1,user2,user3,user4')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ANALYSTS = (process.env.ANALYST_UPNS || 'user5')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const localPart = (u) => String(u || '').split('@')[0].toLowerCase();

export function stageAccessFor(upn) {
  const l = localPart(upn);
  if (DEAL_TEAM.includes(l)) return { role: 'deal-team', canViewStage2: true };
  if (ANALYSTS.includes(l)) return { role: 'analyst', canViewStage2: false };
  return { role: 'member', canViewStage2: false };
}

// Demo roster for the "View as" switcher (so the lockdown is demoable without
// five separate sign-ins). In real Teams the signed-in SSO identity is used.
export const DEMO_USERS = [
  { id: 'user1', upn: 'user1', label: 'Deal Team — user1' },
  { id: 'user2', upn: 'user2', label: 'Deal Team — user2' },
  { id: 'user3', upn: 'user3', label: 'Deal Team — user3' },
  { id: 'user4', upn: 'user4', label: 'Deal Team — user4' },
  { id: 'user5', upn: 'user5', label: 'Analyst — user5 (Stage 1 only)' },
];
