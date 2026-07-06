//==============================================================================
//  dealhub · DATA domain — ADLS Gen2 (OneLake landing / deal estate),
//  Microsoft Fabric capacity, Cosmos DB (serverless)
//  RG: rg-dealhub-data-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param workload string
param environmentName string
param suffix string
param tags object
param enablePrivateEndpoints bool
param storageSku string
param deployFabric bool
param fabricSkuName string
param fabricAdminMembers array
@description('Cosmos SQL database name. Defaults to dealroom for data compatibility with existing app defaults.')
param cosmosDatabaseName string = 'dealroom'
@description('Principal ID of the core UAMI granted data-plane access to storage + Cosmos.')
param uamiPrincipalId string

var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
var netDefaultAction = enablePrivateEndpoints ? 'Deny' : 'Allow'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource dataStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${workload}data${environmentName}${suffix}'
  location: location
  tags: tags
  sku: { name: storageSku }
  kind: 'StorageV2'
  identity: { type: 'SystemAssigned' }
  properties: {
    isHnsEnabled: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: pna
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: netDefaultAction
    }
  }
}

resource dataBlob 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: dataStorage
  name: 'default'
}

resource dataContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [
  for c in [ 'landing', 'bronze', 'silver', 'gold' ]: {
    parent: dataBlob
    name: c
  }
]

resource fabric 'Microsoft.Fabric/capacities@2023-11-01' = if (deployFabric && !empty(fabricAdminMembers)) {
  name: 'fab${workload}${environmentName}${suffix}'
  location: location
  tags: tags
  sku: {
    name: fabricSkuName
    tier: 'Fabric'
  }
  properties: {
    administration: {
      members: fabricAdminMembers
    }
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cosmos-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    publicNetworkAccess: pna
    disableLocalAuth: false
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: cosmosDatabaseName
  properties: {
    resource: { id: cosmosDatabaseName }
  }
}

resource cosmosAgentState 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: 'agent-state'
  properties: {
    resource: {
      id: 'agent-state'
      partitionKey: {
        paths: [ '/dealId' ]
        kind: 'Hash'
      }
    }
  }
}

// RBAC — core UAMI gets blob data + Cosmos data-plane access.
resource raStorageBlobContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(dataStorage.id, uamiPrincipalId, storageBlobDataContributorRoleId)
  scope: dataStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource cosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, uamiPrincipalId, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: uamiPrincipalId
    scope: cosmos.id
  }
}

output dataStorageId string = dataStorage.id
output dataStorageName string = dataStorage.name
output cosmosId string = cosmos.id
output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosDatabaseName string = cosmosDatabaseName
output fabricCapacityName string = (deployFabric && !empty(fabricAdminMembers)) ? fabric.name : 'not-deployed'
