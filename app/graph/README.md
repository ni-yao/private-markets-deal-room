# Mailbox signals → Deal Sourcing (O1) via Microsoft Graph

Wires a real mailbox into the **O1 · Deal Sourcing** signal flow using a Graph
**change-notification subscription** (webhook). When new mail arrives, Graph
calls the Deal Room webhook and the message becomes a sourcing signal.

## Current status (2026-06-30)

| Item | State |
|------|-------|
| App registration `Deal Room - Mailbox Signals` | ✅ created — appId `c6207822-40e8-48fc-b990-976725b11aee` |
| Graph `Mail.Read` (application) permission | ✅ requested on the app |
| **Admin consent** | ⛔ **blocked** — the signed-in account `admin@MngEnvMCAP856239.onmicrosoft.com` holds only **Global Reader** (read-only) and cannot consent |
| Client secret | ⚪ not created (create after consent) |
| Public HTTPS notification endpoint | ⚪ not yet (needs the deployed Container App URL or a dev tunnel) |
| Webhook receiver in the app (`/api/graph/notifications`) | ✅ built + validated locally |
| `subscribe.mjs` / `renew.mjs` | ✅ ready |

Two things must be done by someone with the right privileges before the live
subscription can be created:

1. **Grant admin consent** for `Mail.Read` (needs Global Administrator, Privileged
   Role Administrator, or Application/Cloud Application Administrator).
2. **A public HTTPS URL** for the webhook (Graph validates it at creation time).

## Finish steps

### 1. Grant admin consent (a real admin)
```powershell
# As a Global Admin / Application Admin:
az ad app permission admin-consent --id c6207822-40e8-48fc-b990-976725b11aee
```
Or in the portal: **Entra ID → App registrations → Deal Room - Mailbox Signals
→ API permissions → Grant admin consent**.

### 2. (Recommended) Scope Mail.Read to just this mailbox
Application `Mail.Read` grants read to *all* mailboxes. Restrict it to the one
mailbox with an Exchange Online **Application Access Policy**:
```powershell
Connect-ExchangeOnline
New-ApplicationAccessPolicy -AppId c6207822-40e8-48fc-b990-976725b11aee `
  -PolicyScopeGroupId admin@MngEnvMCAP856239.onmicrosoft.com `
  -AccessRight RestrictAccess `
  -Description "Deal Room O1 mailbox signals - single mailbox"
```

### 3. Create a client secret
```powershell
az ad app credential reset --id c6207822-40e8-48fc-b990-976725b11aee `
  --display-name "deal-room-o1" --years 1 --query "{appId:appId,secret:password,tenant:tenant}" -o json
```
Store the values in `app/.env.local` (gitignored) — never commit them.

### 4. Expose the webhook publicly
- **Prod:** deploy the app (see `../README.md`); use
  `https://<container-app-fqdn>/api/graph/notifications`.
- **Dev:** a tunnel, e.g. `devtunnel host -p 8080 --allow-anonymous`, then use
  `https://<tunnel-host>/api/graph/notifications`.

### 5. Create the subscription
```powershell
$env:GRAPH_TENANT_ID     = "1f629fc5-9a9e-4353-a1a1-e2bbf3b2cd02"
$env:GRAPH_CLIENT_ID     = "c6207822-40e8-48fc-b990-976725b11aee"
$env:GRAPH_CLIENT_SECRET = "<secret from step 3>"
$env:GRAPH_MAILBOX       = "admin@MngEnvMCAP856239.onmicrosoft.com"
$env:NOTIFICATION_URL    = "https://<public-host>/api/graph/notifications"
$env:GRAPH_CLIENT_STATE  = "<shared-secret>"
node graph/subscribe.mjs
```

Keep it alive by running `graph/renew.mjs` on a timer (every ~30–45 min).

## How the app consumes it

- `POST /api/graph/notifications` — validation handshake + notification receiver
  (set `GRAPH_CLIENT_STATE` on the server to match the subscription).
- `GET  /api/graph/signals` — the received mailbox signals, to feed O1.

## Remove everything
```powershell
# Delete the subscription (if created), then the app registration:
az ad app delete --id c6207822-40e8-48fc-b990-976725b11aee
```
