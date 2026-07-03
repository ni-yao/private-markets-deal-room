# Seed data archive

Snapshot of all originally-hard-coded demo/seed data from `app/data/*.js`,
exported to JSON so it is retained and retrievable after the app migrates to a
real datastore (production Phase 1).

- `export-seed.mjs` — the one-off exporter (`node archive/export-seed.mjs`).
- `seed/*.json` — one file per data module; `seed/_manifest.json` lists exports.

This is fabricated demo data (fake companies, news, filings, Morningstar
ratings, analyst research, CxO signals). It is **not** production data. It is
kept for reference and as an optional load into the datastore during the
Phase 1 repository migration (`p1-repository`). A second copy lives in the
session `files/seed-archive/`.
