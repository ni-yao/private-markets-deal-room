// Repository layer — the single data-access seam for The Deal Room.
//
// Backed by Azure Cosmos DB for NoSQL (serverless) via managed identity when
// COSMOS_ENDPOINT is set; otherwise an in-memory Map so local dev and the demo
// still run with no datastore. Every store mutation goes through here, so the
// app's persistence (P1) and workflow-state durability (P5) live in one place.
//
// Cosmos account cosmos-dealroom-dev-7j3ok has local auth disabled — data-plane
// access is RBAC only (the Container App's managed identity holds Cosmos DB
// Built-in Data Contributor).

import { DefaultAzureCredential } from '@azure/identity';

const ENDPOINT = process.env.COSMOS_ENDPOINT || '';
const DATABASE = process.env.COSMOS_DATABASE || 'dealroom';
const COLLECTIONS = ['companies', 'deals', 'events'];

let mode = 'memory';
const containers = {};
const mem = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));

export function repoMode() {
  return mode;
}
export function repoReady() {
  return mode === 'cosmos';
}

// Lazily connect to Cosmos. Safe to call once at startup; on any failure the
// repo silently stays in-memory so the app never hard-fails on a data issue.
export async function initRepo() {
  if (!ENDPOINT) {
    mode = 'memory';
    return { mode, endpoint: null };
  }
  try {
    const { CosmosClient } = await import('@azure/cosmos');
    const client = new CosmosClient({ endpoint: ENDPOINT, aadCredentials: new DefaultAzureCredential() });
    const db = client.database(DATABASE);
    for (const name of COLLECTIONS) containers[name] = db.container(name);
    // Smoke the connection with a cheap read against one container.
    await containers.companies.items.query('SELECT VALUE COUNT(1) FROM c').fetchAll();
    mode = 'cosmos';
    return { mode, endpoint: ENDPOINT, database: DATABASE };
  } catch (err) {
    mode = 'memory';
    return { mode, endpoint: ENDPOINT, error: String(err?.message || err) };
  }
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

function coll(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`unknown collection ${name}`);
  return name;
}

// ---- generic document operations (id-partitioned collections) --------------

export async function get(name, id) {
  coll(name);
  if (mode === 'cosmos') {
    try {
      const { resource } = await containers[name].item(id, id).read();
      return resource || null;
    } catch (err) {
      if (err?.code === 404) return null;
      throw err;
    }
  }
  return clone(mem[name].get(id)) || null;
}

export async function upsert(name, doc) {
  coll(name);
  if (!doc?.id) throw new Error(`upsert ${name}: doc.id required`);
  const now = new Date().toISOString();
  const record = { ...doc, updatedAt: now, createdAt: doc.createdAt || now };
  if (mode === 'cosmos') {
    const { resource } = await containers[name].items.upsert(record);
    return resource;
  }
  mem[name].set(record.id, clone(record));
  return clone(record);
}

export async function list(name) {
  coll(name);
  if (mode === 'cosmos') {
    const { resources } = await containers[name].items.readAll().fetchAll();
    return resources;
  }
  return [...mem[name].values()].map(clone);
}

export async function remove(name, id) {
  coll(name);
  if (mode === 'cosmos') {
    try {
      await containers[name].item(id, id).delete();
    } catch (err) {
      if (err?.code !== 404) throw err;
    }
    return;
  }
  mem[name].delete(id);
}

// Append-only audit event (P5). Partition key is /companyId on the events
// container; a null companyId is stored under a shared 'system' partition.
export async function recordEvent(evt) {
  const doc = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: evt.companyId || 'system',
    type: evt.type,
    detail: evt.detail || null,
    at: new Date().toISOString()
  };
  if (mode === 'cosmos') {
    try {
      await containers.events.items.create(doc);
    } catch {
      /* audit is best-effort; never block the primary op */
    }
    return doc;
  }
  mem.events.set(doc.id, clone(doc));
  return doc;
}

// Convenience wrappers per collection (clearer call sites in the store).
export const companies = {
  get: (id) => get('companies', id),
  upsert: (d) => upsert('companies', d),
  list: () => list('companies'),
  remove: (id) => remove('companies', id)
};
export const deals = {
  get: (id) => get('deals', id),
  upsert: (d) => upsert('deals', d),
  list: () => list('deals'),
  remove: (id) => remove('deals', id)
};
