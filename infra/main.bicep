//==============================================================================
//  dealhub — Target-State Azure infrastructure (subscription-scoped, domain-split)
//------------------------------------------------------------------------------
//  Scope   : subscription — one command stands up the whole platform across
//            domain-split resource groups (rg-dealhub-{domain}-{env}-{loc}).
//  Region  : Sweden Central (default) — EU data residency.
//  Naming  : {type}-{workload}-{env}-{loc}; globally-unique names add a short
//            hash suffix derived from the SUBSCRIPTION (stable across the split
//            RGs and per customer) and drop separators.
//
//  Deploy (dev):
//    az deployment sub create \
//      --location swedencentral \
//      --template-file infra/main.bicep \
//      --parameters infra/main.dev.bicepparam
//
//  Customer-deployable: fully parameterized, no author-specific tenant/sub/
//  resource IDs. Supply your own params (fabric admin, apim email, entra IDs).
//
//  NOTE: Microsoft 365 / Copilot, Power Platform / Dataverse, SharePoint and
//  Purview are SaaS / tenant-level and are NOT provisioned by Bicep.
//==============================================================================

targetScope = 'subscription'

//------------------------------------------------------------------------------
// Parameters
//------------------------------------------------------------------------------
@description('Azure region for all resources. Default: Sweden Central (EU residency).')
param location string = 'swedencentral'

@description('Short location token used in resource names.')
param locationShort string = 'swc'

@description('Workload token used in resource + resource-group names.')
param workload string = 'dealhub'

@allowed([
  'dev'
  'test'
  'prod'
])
@description('Environment token used in resource names and tags.')
param environmentName string = 'dev'

@description('Cost center tag value.')
param costCenter string = 'private-markets'

@description('Azure OpenAI / Foundry model deployments to create on the AI Foundry account.')
param openAiDeployments array = [
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

@description('Azure AI Search SKU.')
@allowed([
  'basic'
  'standard'
  'standard2'
  'standard3'
])
param searchSku string = 'standard'

@description('Storage SKU for the ADLS Gen2 deal-estate landing account.')
@allowed([
  'Standard_LRS'
  'Standard_ZRS'
  'Standard_GRS'
])
param storageSku string = 'Standard_LRS'

@description('Cosmos SQL database name (kept as the app default for data compatibility).')
param cosmosDatabaseName string = 'dealroom'

@description('Deploy a Microsoft Fabric capacity. Requires at least one Fabric admin member.')
param deployFabric bool = true

@description('Fabric capacity SKU (F-series).')
param fabricSkuName string = 'F2'

@description('Fabric capacity administrators (UPNs or object IDs). Required if deployFabric is true.')
param fabricAdminMembers array = []

@description('Deploy Azure API Management as the AI Gateway (Developer SKU ~ 30-45 min to provision).')
param deployApim bool = true

@description('API Management SKU.')
@allowed([
  'Developer'
  'Basic'
  'Standard'
  'Premium'
  'StandardV2'
  'BasicV2'
])
param apimSkuName string = 'Developer'

@description('API Management publisher email.')
param apimPublisherEmail string = 'deal-room-platform@contoso.com'

@description('API Management publisher organization name.')
param apimPublisherName string = 'Private Markets Deal Room'

@description('Container image for the shared-backend orchestrator Container App.')
param orchestratorImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Port the orchestrator container listens on (the Deal Room app uses 8080).')
param containerTargetPort int = 8080

@description('Deploy the Teams-interface Container App (enable once the teams-app image exists).')
param deployTeamsApp bool = false

@description('Container image for the Teams-interface Container App.')
param teamsImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Port the Teams-interface container listens on.')
param teamsTargetPort int = 8090

@description('Orchestrator replica floor/ceiling. Keep both = 1: the shared backend holds the M365 delegated token in-memory and a single writer avoids datastore races.')
@minValue(1)
param orchestratorMinReplicas int = 1
@minValue(1)
param orchestratorMaxReplicas int = 1

@description('Entra app (client) ID for the Teams tab SSO (access_as_user). Empty disables per-user SSO.')
param teamsTabClientId string = ''

@description('Client secret for the Teams tab SSO app registration.')
@secure()
param teamsTabClientSecret string = ''

@description('Deploy an Azure Bot registration for the in-channel conversational bot (requires botAppId + deployTeamsApp).')
param deployBot bool = false

@description('Entra app (client) ID / MSA App ID backing the Teams bot. Empty disables the bot.')
param botAppId string = ''

@description('Client secret for the Teams bot app registration.')
@secure()
param botAppPassword string = ''

@allowed([ 'MultiTenant', 'SingleTenant', 'UserAssignedMSI' ])
@description('Bot app type.')
param botAppType string = 'MultiTenant'

@description('Model deployment name the orchestrator app calls for chat/agents.')
param appModelDeployment string = 'gpt-5-mini'

@description('Name of the Foundry "Deal Room Analyst" agent (all-deals access, per-deal scoping).')
param dealAgentName string = 'deal-room-analyst'

@description('Tenant used to build deal SharePoint/Teams deep links (<tenant>.sharepoint.com).')
param workspaceTenant string = 'contoso'

@description('Entra tenant ID that gates the Deal MCP server (/mcp). Empty leaves /mcp fail-closed (503).')
param entraTenantId string = ''

@description('Accepted audiences for the Deal MCP server bearer token (comma-separated: client ID and/or api:// URI).')
param mcpAudience string = ''

@description('Optional delegated scope / app role the MCP token must carry (e.g. deals.read). Empty = audience+tenant only.')
param mcpRequiredScope string = ''

@description('Entra app (client) ID for the in-app M365 delegated login. Empty disables the M365 connector.')
param m365ClientId string = ''

@description('Entra tenant ID for the M365 delegated login (defaults to entraTenantId when set).')
param m365TenantId string = ''

@description('Client secret for the M365 delegated login app registration.')
@secure()
param m365ClientSecret string = ''

@description('Static read-only key for the /mcp read-only surface, used by Foundry-hosted (Teams) agents. Empty disables the key path (Entra still works).')
@secure()
param mcpReadonlyKey string = ''

@description('Bind the market-intelligence layer to a live Microsoft Fabric lakehouse (external workspace).')
param fabricLive bool = false
param fabricSqlEndpoint string = ''
param fabricSqlDatabase string = 'deal_room_starter'
param fabricWorkspace string = 'Deal Room'
param fabricLakehouse string = 'deal_room_starter'
param onelakeWorkspaceId string = ''
param onelakeLakehouseId string = ''

@description('Optional pinned parent Teams team ID that holds one channel per deal. Empty = find/create "The Deal Room".')
param m365TeamId string = ''

@description('Container Registry SKU.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param acrSku string = 'Basic'

@description('Lock data-plane services behind Private Endpoints and disable public network access.')
param enablePrivateEndpoints bool = false

@description('Enable Key Vault purge protection (recommended for prod; blocks immediate redeploys of the same name).')
param keyVaultPurgeProtection bool = false

//------------------------------------------------------------------------------
// Variables
//------------------------------------------------------------------------------
var namePrefix = '${workload}-${environmentName}-${locationShort}'
// Stable per customer + env (subscription-derived), consistent across all RGs.
var suffix = toLower(substring(uniqueString(subscription().id, workload, environmentName), 0, 5))
var tags = {
  workload: workload
  env: environmentName
  costCenter: costCenter
  managedBy: 'bicep'
  solution: 'deal-room'
}

var rgNames = {
  core: 'rg-${workload}-core-${environmentName}-${locationShort}'
  ai: 'rg-${workload}-ai-${environmentName}-${locationShort}'
  data: 'rg-${workload}-data-${environmentName}-${locationShort}'
  app: 'rg-${workload}-app-${environmentName}-${locationShort}'
  integration: 'rg-${workload}-integration-${environmentName}-${locationShort}'
  network: 'rg-${workload}-network-${environmentName}-${locationShort}'
}

//------------------------------------------------------------------------------
// Domain resource groups
//------------------------------------------------------------------------------
resource rgCore 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgNames.core
  location: location
  tags: tags
}
resource rgAi 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgNames.ai
  location: location
  tags: tags
}
resource rgData 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgNames.data
  location: location
  tags: tags
}
resource rgApp 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgNames.app
  location: location
  tags: tags
}
resource rgIntegration 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgNames.integration
  location: location
  tags: tags
}
resource rgNetwork 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgNames.network
  location: location
  tags: tags
}

//------------------------------------------------------------------------------
// Domain modules
//------------------------------------------------------------------------------
module core 'modules/core.bicep' = {
  name: 'core'
  scope: rgCore
  params: {
    location: location
    namePrefix: namePrefix
    workload: workload
    environmentName: environmentName
    suffix: suffix
    tags: tags
    enablePrivateEndpoints: enablePrivateEndpoints
    keyVaultPurgeProtection: keyVaultPurgeProtection
  }
}

module ai 'modules/ai.bicep' = {
  name: 'ai'
  scope: rgAi
  params: {
    location: location
    workload: workload
    environmentName: environmentName
    suffix: suffix
    tags: tags
    enablePrivateEndpoints: enablePrivateEndpoints
    searchSku: searchSku
    openAiDeployments: openAiDeployments
    uamiPrincipalId: core.outputs.uamiPrincipalId
  }
}

module data 'modules/data.bicep' = {
  name: 'data'
  scope: rgData
  params: {
    location: location
    workload: workload
    environmentName: environmentName
    suffix: suffix
    tags: tags
    enablePrivateEndpoints: enablePrivateEndpoints
    storageSku: storageSku
    deployFabric: deployFabric
    fabricSkuName: fabricSkuName
    fabricAdminMembers: fabricAdminMembers
    cosmosDatabaseName: cosmosDatabaseName
    uamiPrincipalId: core.outputs.uamiPrincipalId
  }
}

module integration 'modules/integration.bicep' = {
  name: 'integration'
  scope: rgIntegration
  params: {
    location: location
    workload: workload
    environmentName: environmentName
    suffix: suffix
    tags: tags
    enablePrivateEndpoints: enablePrivateEndpoints
    deployApim: deployApim
    apimSkuName: apimSkuName
    apimPublisherEmail: apimPublisherEmail
    apimPublisherName: apimPublisherName
    uamiPrincipalId: core.outputs.uamiPrincipalId
  }
}

module app 'modules/app.bicep' = {
  name: 'app'
  scope: rgApp
  params: {
    location: location
    locationShort: locationShort
    namePrefix: namePrefix
    workload: workload
    environmentName: environmentName
    suffix: suffix
    tags: tags
    enablePrivateEndpoints: enablePrivateEndpoints
    acrSku: acrSku
    containerTargetPort: containerTargetPort
    orchestratorImage: orchestratorImage
    appModelDeployment: appModelDeployment
    dealAgentName: dealAgentName
    entraTenantId: entraTenantId
    mcpAudience: mcpAudience
    mcpRequiredScope: mcpRequiredScope
    m365ClientId: m365ClientId
    m365TenantId: m365TenantId
    m365ClientSecret: m365ClientSecret
    mcpReadonlyKey: mcpReadonlyKey
    m365TeamId: m365TeamId
    workspaceTenant: workspaceTenant
    deployTeamsApp: deployTeamsApp
    teamsImage: teamsImage
    teamsTargetPort: teamsTargetPort
    orchestratorMinReplicas: orchestratorMinReplicas
    orchestratorMaxReplicas: orchestratorMaxReplicas
    teamsTabClientId: teamsTabClientId
    teamsTabClientSecret: teamsTabClientSecret
    deployBot: deployBot
    botAppId: botAppId
    botAppPassword: botAppPassword
    botAppType: botAppType
    uamiResourceId: core.outputs.uamiResourceId
    uamiClientId: core.outputs.uamiClientId
    uamiPrincipalId: core.outputs.uamiPrincipalId
    coreResourceGroupName: rgCore.name
    logAnalyticsName: core.outputs.logAnalyticsName
    appInsightsConnectionString: core.outputs.appInsightsConnectionString
    foundryEndpoint: ai.outputs.foundryEndpoint
    contentSafetyEndpoint: ai.outputs.contentSafetyEndpoint
    cosmosEndpoint: data.outputs.cosmosEndpoint
    cosmosDatabase: data.outputs.cosmosDatabaseName
    fabricLive: fabricLive
    fabricSqlEndpoint: fabricSqlEndpoint
    fabricSqlDatabase: fabricSqlDatabase
    fabricWorkspace: fabricWorkspace
    fabricLakehouse: fabricLakehouse
    onelakeWorkspaceId: onelakeWorkspaceId
    onelakeLakehouseId: onelakeLakehouseId
  }
}

module network 'modules/network.bicep' = {
  name: 'network'
  scope: rgNetwork
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    enablePrivateEndpoints: enablePrivateEndpoints
    foundryId: ai.outputs.foundryId
    searchId: ai.outputs.searchId
    keyVaultId: core.outputs.keyVaultId
    cosmosId: data.outputs.cosmosId
    serviceBusId: integration.outputs.serviceBusId
    dataStorageId: data.outputs.dataStorageId
  }
}

//------------------------------------------------------------------------------
// Outputs
//------------------------------------------------------------------------------
output resourceGroups object = rgNames
output location string = location
output managedIdentityClientId string = core.outputs.uamiClientId
output managedIdentityPrincipalId string = core.outputs.uamiPrincipalId
output keyVaultName string = core.outputs.keyVaultName
output appInsightsConnectionString string = core.outputs.appInsightsConnectionString
output foundryAccountName string = ai.outputs.foundryAccountName
output foundryEndpoint string = ai.outputs.foundryEndpoint
output foundryProjectName string = ai.outputs.foundryProjectName
output deployedModels array = ai.outputs.deployedModels
output documentIntelligenceEndpoint string = ai.outputs.documentIntelligenceEndpoint
output contentSafetyEndpoint string = ai.outputs.contentSafetyEndpoint
output speechEndpoint string = ai.outputs.speechEndpoint
output searchName string = ai.outputs.searchName
output searchEndpoint string = ai.outputs.searchEndpoint
output dataStorageName string = data.outputs.dataStorageName
output cosmosAccountName string = data.outputs.cosmosAccountName
output cosmosEndpoint string = data.outputs.cosmosEndpoint
output cosmosDatabaseName string = data.outputs.cosmosDatabaseName
output fabricCapacityName string = data.outputs.fabricCapacityName
output apimGatewayUrl string = integration.outputs.apimGatewayUrl
output serviceBusNamespace string = integration.outputs.serviceBusNamespace
output eventGridEndpoint string = integration.outputs.eventGridEndpoint
output acrName string = app.outputs.acrName
output acrLoginServer string = app.outputs.acrLoginServer
output containerAppName string = app.outputs.containerAppName
output containerAppFqdn string = app.outputs.containerAppFqdn
output containerAppUrl string = app.outputs.containerAppUrl
output teamsAppName string = app.outputs.teamsAppName
output teamsAppUrl string = app.outputs.teamsAppUrl
output botName string = app.outputs.botName
output functionAppName string = app.outputs.functionAppName
output vnetName string = network.outputs.vnetName
