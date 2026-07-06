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
