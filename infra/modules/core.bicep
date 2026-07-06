//==============================================================================
//  dealhub · CORE domain — identity, monitoring, secrets
//  RG: rg-dealhub-core-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param namePrefix string
param workload string
param environmentName string
param suffix string
param tags object
param enablePrivateEndpoints bool
param keyVaultPurgeProtection bool

var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
var netDefaultAction = enablePrivateEndpoints ? 'Deny' : 'Allow'

// Built-in role definition IDs (global constants — identical in every tenant)
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${namePrefix}'
  location: location
  tags: tags
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${namePrefix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${namePrefix}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: keyVaultPurgeProtection ? true : null
    publicNetworkAccess: pna
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: netDefaultAction
    }
  }
}

// The UAMI reads its secrets from Key Vault (Key Vault Secrets User).
resource raKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output uamiResourceId string = uami.id
output uamiPrincipalId string = uami.properties.principalId
output uamiClientId string = uami.properties.clientId
output logAnalyticsName string = logAnalytics.name
output logAnalyticsId string = logAnalytics.id
output logAnalyticsCustomerId string = logAnalytics.properties.customerId
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
