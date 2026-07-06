//==============================================================================
//  dealhub · AI domain — Foundry account + project, model deployments,
//  Document Intelligence, Content Safety, Speech, AI Search
//  RG: rg-dealhub-ai-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param workload string
param environmentName string
param suffix string
param tags object
param enablePrivateEndpoints bool
param searchSku string
param openAiDeployments array
@description('Principal ID of the core UAMI granted data-plane access to the AI services.')
param uamiPrincipalId string

var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
var pnaSearch = enablePrivateEndpoints ? 'disabled' : 'enabled'
var netDefaultAction = enablePrivateEndpoints ? 'Deny' : 'Allow'

var roleIds = {
  cognitiveServicesOpenAIUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
  cognitiveServicesUser: 'a97b65f3-24c7-4388-baec-2e87135dc908'
  searchIndexDataContributor: '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
  searchServiceContributor: '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
}

// Azure AI Foundry (AIServices account with project management) — hosts Azure OpenAI deployments
resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'aif-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    allowProjectManagement: true
    customSubDomainName: 'aif-${workload}-${environmentName}-${suffix}'
    disableLocalAuth: false
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: 'proj-${workload}-${environmentName}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Deal Room (${environmentName})'
    description: 'Hosts the Deal Orchestrator and specialist deal-flow agents.'
  }
}

@batchSize(1)
resource modelDeployments 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = [
  for d in openAiDeployments: {
    parent: foundry
    name: d.name
    sku: {
      name: d.sku.name
      capacity: d.sku.capacity
    }
    properties: {
      model: {
        format: d.model.format
        name: d.model.name
        version: d.model.version
      }
    }
  }
]

resource docIntelligence 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'di-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'di-${workload}-${environmentName}-${suffix}'
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource contentSafety 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'cs-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'ContentSafety'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'cs-${workload}-${environmentName}-${suffix}'
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource speech 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'spch-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'SpeechServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'spch-${workload}-${environmentName}-${suffix}'
    publicNetworkAccess: pna
    networkAcls: {
      defaultAction: netDefaultAction
    }
  }
}

resource search 'Microsoft.Search/searchServices@2023-11-01' = {
  name: 'srch-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  sku: { name: searchSku }
  identity: { type: 'SystemAssigned' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    semanticSearch: 'standard'
    publicNetworkAccess: pnaSearch
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http401WithBearerChallenge'
      }
    }
  }
}

// RBAC — core UAMI gets least-privilege data-plane access to the AI services.
resource raFoundryOpenAIUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uamiPrincipalId, roleIds.cognitiveServicesOpenAIUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesOpenAIUser)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raFoundryCogUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uamiPrincipalId, roleIds.cognitiveServicesUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raSearchIndexContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, uamiPrincipalId, roleIds.searchIndexDataContributor)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchIndexDataContributor)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raSearchServiceContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, uamiPrincipalId, roleIds.searchServiceContributor)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchServiceContributor)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output foundryId string = foundry.id
output foundryAccountName string = foundry.name
output foundryEndpoint string = foundry.properties.endpoint
output foundryProjectName string = foundryProject.name
output deployedModels array = [for (d, i) in openAiDeployments: d.name]
output documentIntelligenceEndpoint string = docIntelligence.properties.endpoint
output contentSafetyEndpoint string = contentSafety.properties.endpoint
output speechEndpoint string = speech.properties.endpoint
output searchId string = search.id
output searchName string = search.name
output searchEndpoint string = 'https://${search.name}.search.windows.net'
