// Renew a Graph subscription before it expires (messages max ~4230 min).
// Run on a timer (e.g. every 30-45 min) while the subscription is active.
//
// Usage:
//   $env:GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET as for subscribe
//   $env:SUBSCRIPTION_ID = "<id from subscribe.mjs>"
//   node graph/renew.mjs

const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SUBSCRIPTION_ID } = process.env;

for (const [k, v] of Object.entries({ GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SUBSCRIPTION_ID })) {
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

async function token() {
  const body = new URLSearchParams({
    client_id: GRAPH_CLIENT_ID,
    client_secret: GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const r = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token error: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function main() {
  const access = await token();
  const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${SUBSCRIPTION_ID}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expirationDateTime: expiration })
  });
  const j = await r.json();
  if (!r.ok) {
    console.error(`renew failed (${r.status}):`, JSON.stringify(j, null, 2));
    process.exit(1);
  }
  console.log(`Subscription ${SUBSCRIPTION_ID} renewed to ${j.expirationDateTime}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
