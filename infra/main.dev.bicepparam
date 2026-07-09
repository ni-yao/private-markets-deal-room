using './main.bicep'

// ─── DEV ─────────────────────────────────────────────────────────────────────
// Fast, public dev deploy. Hardening toggles off so you can iterate and redeploy.

param location = 'swedencentral'
param locationShort = 'swc'
param workload = 'dealhub'
param environmentName = 'dev'
param costCenter = 'private-markets'

param openAiDeployments = [
  {
    name: 'gpt-5-mini'
    model: { format: 'OpenAI', name: 'gpt-5-mini', version: '2025-08-07' }
    sku: { name: 'GlobalStandard', capacity: 30 }
  }
  {
    name: 'gpt-5-nano'
    model: { format: 'OpenAI', name: 'gpt-5-nano', version: '2025-08-07' }
    sku: { name: 'GlobalStandard', capacity: 30 }
  }
  {
    name: 'text-embedding-3-large'
    model: { format: 'OpenAI', name: 'text-embedding-3-large', version: '1' }
    sku: { name: 'Standard', capacity: 30 }
  }
]

param appModelDeployment = 'gpt-5-mini'

param searchSku = 'basic'
param storageSku = 'Standard_LRS'

// Fabric needs an admin — leave empty to skip, or add a UPN/objectId to provision.
param deployFabric = true
param fabricSkuName = 'F2'
param fabricAdminMembers = []

// APIM Developer SKU (~30-45 min). Off in dev for fast/cheap inner-loop deploys
// (the AI Gateway isn't required by the app or Teams). Prod keeps it on.
param deployApim = false
param apimSkuName = 'Developer'
param apimPublisherEmail = 'deal-room-platform@contoso.com'
param apimPublisherName = 'Private Markets Deal Room'

param orchestratorImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Teams interface Container App (ca-dealhub-teams). The image is rolled out
// separately after infra (like the orchestrator), so this stays portable.
param deployTeamsApp = true

// Orchestrator MUST stay single-replica: it holds the M365 delegated token in
// memory and a single writer avoids datastore races (see docs/SOLUTION.md §6).
param orchestratorMinReplicas = 1
param orchestratorMaxReplicas = 1

// Teams tab SSO (per-user context) + in-channel bot. IDs are non-secret; the
// matching secrets (teamsTabClientSecret / botAppPassword / m365ClientSecret) are
// passed at deploy time (--parameters name=value) or sourced from Key Vault — never git.
param teamsTabClientId = ''   // Entra app (client) id for the Teams tab SSO
param deployBot = false        // set true (with botAppId + deployTeamsApp) to register the Azure Bot
param botAppId = ''            // MSA App id backing the Teams bot
param botAppType = 'MultiTenant'

// M365 channel/VDR provisioning (org-catalog app id is NOT a secret; group name is configurable).
param teamsAppCatalogId = '55a506df-b5f9-4096-9719-5fad2261eb38'
param m365PublishGroup = 'Private Equity Deals'

param enablePrivateEndpoints = false
param keyVaultPurgeProtection = false

// Live Microsoft Fabric / OneLake market-intelligence binding (external "Deal Room"
// workspace). The app's managed identity must hold a workspace role (Contributor).
param fabricLive = true
param fabricSqlEndpoint = 'a64b6mf4xwwexabphg3h6kmlnq-vohf2iaot5lu5l5wepkbscocq4.datawarehouse.fabric.microsoft.com'
param fabricSqlDatabase = 'deal_room_starter'
param fabricWorkspace = 'Deal Room'
param fabricLakehouse = 'deal_room_starter'
param onelakeWorkspaceId = '205d8eab-9f0e-4e57-afb6-23d41909c287'
param onelakeLakehouseId = '544efa34-5a8d-4b3a-8aad-216dabe71c37'
