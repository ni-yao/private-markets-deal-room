// Ingest CxO signal emails into Cosmos.
//
// FETCH is environment-specific: today the emails are harvested from the M365
// mailbox via the WorkIQ MCP (delegated user auth) and saved to a JSON file;
// once application Mail.Read consent is granted a Graph service job can fetch
// the same shape. Either way the messages flow through the SAME transform
// (lib/ingest/signals.js) and persist through the SAME repo seam.
//
// Usage:
//   node scripts/ingest_signals.mjs <messages.json>            # dry run (prints)
//   node scripts/ingest_signals.mjs <messages.json> --persist  # write to Cosmos
//
// Accepts a WorkIQ response ({results:[{data:{value:[...]}}]}), a raw Graph
// collection ({value:[...]}), or a bare array of messages. Filters to messages
// addressed to the deal-signals inbox and skips calendar event messages.

import fs from 'node:fs';
import { messagesToSignals } from '../lib/ingest/signals.js';
import { config } from '../lib/config.js';

const SIGNAL_INBOX = config.ingest.signalInbox;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const persist = args.includes('--persist');
if (!file) {
  console.error('usage: node scripts/ingest_signals.mjs <messages.json> [--persist]');
  process.exit(1);
}

function extract(o) {
  if (Array.isArray(o)) return o;
  if (o?.results) return o.results.flatMap((r) => r?.data?.value || []);
  if (o?.value) return o.value;
  if (o?.data?.value) return o.data.value;
  return [];
}

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const all = extract(raw);
const msgs = all.filter(
  (m) =>
    (m.toRecipients || []).some((r) => (r.emailAddress?.address || '').toLowerCase() === SIGNAL_INBOX) &&
    String(m['@odata.type'] || '').indexOf('eventMessage') < 0
);

console.log(`messages in file: ${all.length}  matched signal inbox: ${msgs.length}`);
const docs = messagesToSignals(msgs);
console.log(`signal companies: ${docs.length}`);
for (const d of docs) {
  console.log(`\n== ${d.name}  [${d.intent}]  ${d.sector} · ${d.hq}`);
  console.log(`   ${d.summary}`);
  for (const e of d.emails) console.log(`   > ${e.from} — ${e.role} | ${e.subject} [${e.intent}]`);
}

if (persist) {
  const { initRepo, repoMode, signals } = await import('../lib/repo/index.js');
  await initRepo();
  if (repoMode() !== 'cosmos') {
    console.error('Cosmos not available (set COSMOS_ENDPOINT); aborting persist.');
    process.exit(1);
  }
  for (const d of docs) await signals.upsert(d);
  console.log(`\nPersisted ${docs.length} signal companies to Cosmos.`);
}
