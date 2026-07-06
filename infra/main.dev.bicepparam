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

param enablePrivateEndpoints = false
param keyVaultPurgeProtection = false
