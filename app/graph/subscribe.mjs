// Create a Microsoft Graph change-notification subscription on the target
// mailbox, delivering to the Deal Room webhook. App-only (client credentials).
//
// Prereqs (see graph/README.md): the app registration must have Mail.Read
// (application) admin-consented, and NOTIFICATION_URL must be publicly reachable
// over HTTPS (deployed Container App or a dev tunnel).
//
// Usage (PowerShell):
//   $env:GRAPH_TENANT_ID     = "<tenantId>"
//   $env:GRAPH_CLIENT_ID     = "<appId>"
//   $env:GRAPH_CLIENT_SECRET = "<secret>"
//   $env:GRAPH_MAILBOX       = "<signal-mailbox@your-tenant.onmicrosoft.com>"
//   $env:NOTIFICATION_URL    = "https://<public-host>/api/graph/notifications"
//   $env:GRAPH_CLIENT_STATE  = "<shared-secret>"   # optional but recommended
//   node graph/subscribe.mjs

const {
  GRAPH_TENANT_ID,
  GRAPH_CLIENT_ID,
  GRAPH_CLIENT_SECRET,
  GRAPH_MAILBOX,
  NOTIFICATION_URL,
  GRAPH_CLIENT_STATE = 'deal-room-o1'
} = process.env;

for (const [k, v] of Object.entries({ GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_MAILBOX, NOTIFICATION_URL })) {
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
  // Messages subscriptions allow ~4230 min max; renew before expiry.
  const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min
  const sub = {
    changeType: 'created',
    notificationUrl: NOTIFICATION_URL,
    resource: `users/${GRAPH_MAILBOX}/mailFolders('Inbox')/messages`,
    expirationDateTime: expiration,
    clientState: GRAPH_CLIENT_STATE
  };
  const r = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify(sub)
  });
  const j = await r.json();
  if (!r.ok) {
    console.error(`subscribe failed (${r.status}):`, JSON.stringify(j, null, 2));
    process.exit(1);
  }
  console.log('Subscription created:');
  console.log(`  id:        ${j.id}`);
  console.log(`  resource:  ${j.resource}`);
  console.log(`  expires:   ${j.expirationDateTime}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
