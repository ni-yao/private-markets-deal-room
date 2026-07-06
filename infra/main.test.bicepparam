using './main.bicep'

// ─── TEST / UAT ──────────────────────────────────────────────────────────────
// Mirrors dev topology; deploy into a separate subscription (own GitHub Environment).

param location = 'swedencentral'
param locationShort = 'swc'
param workload = 'dealhub'
param environmentName = 'test'
param costCenter = 'private-markets'

param openAiDeployments = [
  {
    name: 'gpt-4o'
    model: { format: 'OpenAI', name: 'gpt-4o', version: '2024-11-20' }
    sku: { name: 'GlobalStandard', capacity: 50 }
  }
  {
    name: 'gpt-4o-mini'
    model: { format: 'OpenAI', name: 'gpt-4o-mini', version: '2024-07-18' }
    sku: { name: 'GlobalStandard', capacity: 100 }
  }
  {
    name: 'text-embedding-3-large'
    model: { format: 'OpenAI', name: 'text-embedding-3-large', version: '1' }
    sku: { name: 'Standard', capacity: 50 }
  }
]

param searchSku = 'standard'
param storageSku = 'Standard_LRS'

param deployFabric = true
param fabricSkuName = 'F2'
param fabricAdminMembers = []

param deployApim = true
param apimSkuName = 'Developer'
param apimPublisherEmail = 'deal-room-platform@contoso.com'
param apimPublisherName = 'Private Markets Deal Room'

param orchestratorImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

param enablePrivateEndpoints = false
param keyVaultPurgeProtection = false
