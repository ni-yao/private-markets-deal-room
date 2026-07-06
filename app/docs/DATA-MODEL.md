# The Deal Room — Data Model (Production, Phase 1)

This is the canonical data model that replaces the in-memory seeded demo data.
It is the foundation for production items 1 (datastore + entity model), 3 (entity
resolution), and 5 (persisted workflow state).

## Datastore

**Azure Cosmos DB for NoSQL, serverless** — account `<your Cosmos account>`,
database `dealroom`, Sweden Central. Local auth is **disabled**; access is
data-plane RBAC only (the app's managed identity holds *Cosmos DB Built-in Data
Contributor*). The app reaches it via `lib/repo/` which falls back to an
in-memory store when `COSMOS_ENDPOINT` is unset (local dev / demo).

## Containers

| Container | Partition key | Holds |
|-----------|---------------|-------|
| `companies` | `/id` | The canonical Company/Target profile (below). One doc per company. |
| `deals` | `/id` | Stage-2 deals (created when a company is PURSUED at the gate). |
| `events` | `/companyId` | Append-only audit log (discovery, dispositions, assessments, launches). |

## The canonical Company profile

One document per company carries **both** the sourced intelligence **and** its
funnel state — no more separate "desk company" vs "candidate" split.

```jsonc
{
  "id": "co-<slug|domain|registry>",   // stable, resolution-aware id
  "kind": "company",

  // identity & entity-resolution keys (P3)
  "name": "…", "aliases": ["…"], "domain": "example.com", "registryId": "HRB…",

  // classification
  "sector": "…", "subSector": "…", "region": "…", "country": "…",
  "hq": "…", "ownership": "founder|family|sponsor|public|unknown", "keywords": ["…"],

  // financials (estimated=true until sourced from a filing → market-data connector)
  "revenue": 240, "ebitda": 26, "ebitdaMargin": 10.8, "growth": 5,
  "dealSize": 220, "estimated": true,

  // sourced intelligence (each item carries provenance: url, publisher, when)
  "news":     [ { "id","source","publisher","url","headline","detail","when","catalyst","confidence" } ],
  "filings":  [ … ],                 // market-data connector (P2)
  "research": null,                  // sell-side connector (P2)
  "quality":  null,                  // Morningstar connector (P2)
  "signals":  null,                  // CxO — WorkIQ / Graph mailbox (P2)

  // provenance
  "sources": ["news","cxo"], "discoveredVia": "news-agent|workiq|manual",
  "firstSeen": "ISO", "visible": true,

  // funnel state (null until sent to screening)
  "funnel": {
    "stage": "O2|O3|O4|pursued",
    "disposition": "active|passed|parked|pursued",
    "passReason": null, "passStage": null, "passNote": null,
    "assessments": { "O2": { … }, "O3": { … } },   // per-step agent recommendation
    "chatLog": [ … ],                               // converse-with-agent history
    "enteredAt": "ISO"
  }
}
```

### Views over `companies`
- **News & Filings desk / ranked targets** = all companies (`visible`).
- **Cohort at step O2/O3/O4** = companies where `funnel.disposition === 'active'
  && funnel.stage === <step>`.
- **Pipeline** = all companies with `funnel != null`.

## Entity resolution (P3)

`companyId()` derives a stable id, preferring `domain` → `registryId` → name
slug, so the same real company surfaced by two feeds (news, CxO, filings) lands
on one document. `mergeIntel()` merges a new feed's intelligence into the
existing profile (dedupes news by URL, prefers sourced financials over
estimates). This replaces the old brittle `deskId` string join where only 4 of
16 seeded candidates were linked.

## Empty start

There is **no seeded company data**. The pipeline starts empty; real companies
enter only through the sourcing input methods:
- **News & Filings** → the Bing-grounded Foundry news-scout agent (live).
- **CxO Signals** → WorkIQ / Graph mailbox connector (P2).
- **Filings / Morningstar / research** → market-data connectors (P2).

The original demo/seed data is archived under `app/archive/seed/` for reference.

## Workflow-state durability (P5)

Every funnel decision (advance/pass/park), per-step agent assessment,
converse-with-agent message, PURSUE, and diligence action is persisted to the
`companies`/`deals` containers through `lib/repo/`, and mirrored to the `events`
audit log — so state survives restarts and scale events instead of living only
in process memory.
