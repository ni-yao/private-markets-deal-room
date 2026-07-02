using './main.bicep'

// ─── PROD ────────────────────────────────────────────────────────────────────
// Hardened posture: private endpoints on, public access off, KV purge protection,
// zone-redundant storage, APIM with an SLA. Deploy into its own subscription
// (own GitHub Environment with required reviewers).

param location = 'swedencentral'
param locationShort = 'swc'
param workload = 'dealroom'
param environmentName = 'prod'
param costCenter = 'private-markets'

param openAiDeployments = [
  {
    name: 'gpt-4o'
    model: { format: 'OpenAI', name: 'gpt-4o', version: '2024-11-20' }
    sku: { name: 'GlobalStandard', capacity: 100 }
  }
  {
    name: 'gpt-4o-mini'
    model: { format: 'OpenAI', name: 'gpt-4o-mini', version: '2024-07-18' }
    sku: { name: 'GlobalStandard', capacity: 200 }
  }
  {
    name: 'text-embedding-3-large'
    model: { format: 'OpenAI', name: 'text-embedding-3-large', version: '1' }
    sku: { name: 'Standard', capacity: 100 }
  }
]

param searchSku = 'standard'
param storageSku = 'Standard_ZRS'

// IMPORTANT: set a real Fabric administrator (UPN or objectId) for prod, else Fabric is skipped.
param deployFabric = true
param fabricSkuName = 'F2'
param fabricAdminMembers = []

param deployApim = true
param apimSkuName = 'StandardV2'
param apimPublisherEmail = 'deal-room-platform@contoso.com'
param apimPublisherName = 'Private Markets Deal Room'

// Replace with your built orchestrator image (e.g. from Azure Container Registry).
param orchestratorImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

param enablePrivateEndpoints = true
param keyVaultPurgeProtection = true
