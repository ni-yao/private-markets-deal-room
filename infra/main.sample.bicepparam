using './main.bicep'

//==============================================================================
//  Deal Room — CUSTOMER ACCELERATOR sample parameters
//------------------------------------------------------------------------------
//  Copy this file (e.g. main.<yourenv>.bicepparam), fill in the placeholders and
//  deploy:
//    az deployment sub create \
//      --location <region> \
//      --template-file infra/main.bicep \
//      --parameters infra/main.<yourenv>.bicepparam \
//      --parameters m365ClientSecret=<secret> teamsTabClientSecret=<secret> botAppPassword=<secret>
//
//  ► IDENTITY / M365 values (entraTenantId, m365ClientId, teamsTabClientId,
//    botAppId, m365TeamId) come from Entra app registrations you create in YOUR
//    tenant — see infra/README.md §"Identity prerequisites".
//  ► SECRETS are NEVER stored here. Pass them with --parameters at deploy time or
//    source them from Key Vault. Leave the *Secret params unset in this file.
//==============================================================================

// ── Placement & naming ───────────────────────────────────────────────────────
param location = 'swedencentral'         // any region with AI Foundry + Container Apps
param locationShort = 'swc'
param workload = 'dealhub'               // → rg-dealhub-*, ca-dealhub-*, cosmos-dealhub-*
param environmentName = 'dev'
param costCenter = 'private-markets'

// ── AI Foundry models ────────────────────────────────────────────────────────
param appModelDeployment = 'gpt-5-mini'
param openAiDeployments = [
  {
    name: 'gpt-5-mini'
    model: { format: 'OpenAI', name: 'gpt-5-mini', version: '2025-08-07' }
    sku: { name: 'GlobalStandard', capacity: 30 }
  }
  {
    name: 'text-embedding-3-large'
    model: { format: 'OpenAI', name: 'text-embedding-3-large', version: '1' }
    sku: { name: 'Standard', capacity: 30 }
  }
]

// ── Data + search ────────────────────────────────────────────────────────────
param cosmosDatabaseName = 'dealroom'     // keep — the app default (containers auto-created)
param searchSku = 'basic'
param storageSku = 'Standard_LRS'

// ── Optional platform services (off by default for a lean first deploy) ───────
param deployFabric = false                // set true + add a Fabric admin to enable OneLake market intel
param fabricAdminMembers = []             // e.g. [ 'admin@yourtenant.onmicrosoft.com' ]
param deployApim = false                  // AI Gateway (Developer SKU ~30-45 min)
param apimPublisherEmail = 'platform@yourorg.com'
param apimPublisherName = 'Your Org — Deal Room'

// ── Compute (Container Apps) ─────────────────────────────────────────────────
// Images default to a hello-world placeholder; roll out the real images AFTER
// infra with `az acr build` + `az containerapp update --image <acr>/<repo>@sha256:<digest>`.
param orchestratorImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param deployTeamsApp = true
param teamsImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
// Keep BOTH = 1: the orchestrator holds the M365 token in memory + single writer.
param orchestratorMinReplicas = 1
param orchestratorMaxReplicas = 1

// ── Identity / Entra (fill from YOUR app registrations) ──────────────────────
param entraTenantId = ''                  // your Entra tenant (GUID)
param workspaceTenant = 'yourtenant'      // <tenant>.sharepoint.com for deep links
// Deal MCP server (/mcp) — leave empty to keep it fail-closed until configured.
param mcpAudience = ''
param mcpRequiredScope = 'deals.read'
// M365 delegated connector (Teams channels + SharePoint VDR provisioning).
param m365ClientId = ''                   // Entra app (client) id for the M365 connector
param m365TenantId = ''                   // defaults to entraTenantId when empty
param m365TeamId = ''                     // pinned parent Teams team id (one channel per deal); empty = find/create
param teamsAppCatalogId = ''              // org-catalog teamsApp id (install Deal Dashboard app + bot); empty skips install
param m365PublishGroup = 'Private Equity Deals'  // group whose members each deal channel is published to
// Teams tab SSO (per-user context).
param teamsTabClientId = ''               // Entra app (client) id for the tab SSO
// In-channel conversational bot.
param deployBot = false                   // true (with botAppId + deployTeamsApp) registers the Azure Bot + Teams channel
param botAppId = ''                       // MSA App id backing the bot
param botAppType = 'MultiTenant'

// ── Hardening ────────────────────────────────────────────────────────────────
// Container Apps here run on a Consumption (public) environment, so leave this
// false to keep Cosmos publicly reachable. Only set true if you also provision a
// VNet-integrated Container Apps environment + Cosmos private endpoint.
param enablePrivateEndpoints = false
param keyVaultPurgeProtection = false     // true for prod (blocks immediate same-name redeploys)

// ── Fabric / OneLake live binding (only when deployFabric or an external WS) ──
param fabricLive = false
param fabricSqlEndpoint = ''
param onelakeWorkspaceId = ''
param onelakeLakehouseId = ''
