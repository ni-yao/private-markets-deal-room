//==============================================================================
//  The Deal Room — Target-State Azure infrastructure (single resource group)
//------------------------------------------------------------------------------
//  Scope        : resourceGroup  (subscription is chosen at deploy time, so you
//                 can retarget subscriptions without editing this file)
//  Region       : Sweden Central (default) — EU data residency
//  Naming       : {type}-{workload}-{env}-swc  (globally-unique names add a
//                 short hash suffix and drop separators)
//
//  Deploy:
//    az group create -n rg-dealroom-dev-swc -l swedencentral --subscription <SUB>
//    az deployment group create --subscription <SUB> \
//        -g rg-dealroom-dev-swc -f infra/main.bicep -p infra/main.bicepparam
//
//  NOTE: Microsoft 365 / Copilot, Dynamics 365, Power Platform / Dataverse,
//  SharePoint and Purview tenant configuration are SaaS / tenant-level and are
//  NOT provisioned by Bicep — they are licensing / admin-portal steps.
//==============================================================================

targetScope = 'resourceGroup'

//------------------------------------------------------------------------------
// Parameters
//------------------------------------------------------------------------------
@description('Azure region for all resources. Default: Sweden Central (EU residency).')
param location string = 'swedencentral'

@description('Short location token used in resource names.')
param locationShort string = 'swc'

@description('Workload token used in resource names.')
param workload string = 'dealroom'

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

@description('Container image for the orchestrator Container App. Defaults to a placeholder until the app image is pushed to ACR and deployed.')
param orchestratorImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Port the orchestrator container listens on (the Deal Room app uses 8080).')
param containerTargetPort int = 8080

@description('Model deployment name the orchestrator app calls for chat/agents.')
param appModelDeployment string = 'gpt-5-mini'

@description('Name of the Foundry "Deal Room Analyst" agent (all-deals access, per-deal scoping).')
param dealAgentName string = 'deal-room-analyst'

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

@description('Static read-only key for the /mcp-ro surface, used by Foundry-hosted agents (Teams). Empty disables the key path (Entra still works).')
@secure()
param mcpReadonlyKey string = ''

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
var suffix = toLower(substring(uniqueString(resourceGroup().id), 0, 5))
var tags = {
  workload: workload
  env: environmentName
  costCenter: costCenter
  managedBy: 'bicep'
  solution: 'deal-room'
}

// Public network access flags (Cognitive / KV / Cosmos / SB use Enabled/Disabled, Search uses lowercase)
var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
var pnaSearch = enablePrivateEndpoints ? 'disabled' : 'enabled'
var netDefaultAction = enablePrivateEndpoints ? 'Deny' : 'Allow'

// Built-in role definition IDs
var roleIds = {
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  cognitiveServicesOpenAIUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
  cognitiveServicesUser: 'a97b65f3-24c7-4388-baec-2e87135dc908'
  searchIndexDataContributor: '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
  searchServiceContributor: '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  serviceBusDataOwner: '090c5cfd-751d-490a-894a-3ce6f1109419'
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
}

//==============================================================================
// Identity, monitoring, secrets
//==============================================================================

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

//==============================================================================
// Data layer — ADLS Gen2 (OneLake landing / deal estate) + Fabric capacity
//==============================================================================

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
  for c in [ 'landing', 'bronze', 'silver', 'gold', 'filings' ]: {
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

//==============================================================================
// AI & Intelligence layer
//==============================================================================

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

// Azure AI Document Intelligence
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

// Azure AI Content Safety
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

// Azure AI Speech (call / meeting transcription)
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

// Azure AI Search — RAG grounding index for agent citations
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

//==============================================================================
// Integration & compute layer
//==============================================================================

// API Management — AI Gateway (token limits, load balancing, semantic caching, MCP, logging)
resource apim 'Microsoft.ApiManagement/service@2024-05-01' = if (deployApim) {
  name: 'apim-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  sku: {
    name: apimSkuName
    capacity: 1
  }
  identity: { type: 'SystemAssigned' }
  properties: {
    publisherEmail: apimPublisherEmail
    publisherName: apimPublisherName
  }
}

// Container Apps environment + orchestrator placeholder app (custom agent / MCP back-end)
resource caEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${namePrefix}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Azure Container Registry — hosts the orchestrator (Deal Room app) image
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${workload}${environmentName}${suffix}'
  location: location
  tags: tags
  sku: { name: acrSku }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: pna
  }
}

resource orchestratorApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${workload}-orch-${environmentName}-${locationShort}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uami.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        // Non-empty placeholder keeps the template valid when M365 isn't configured;
        // the app gates the M365 connector on M365_CLIENT_ID, so the placeholder is inert.
        { name: 'm365-client-secret', value: empty(m365ClientSecret) ? 'unset' : m365ClientSecret }
        // Read-only MCP key for Foundry-hosted (Teams) agents; the app gates the key
        // path on a non-empty value, so the placeholder is inert until a key is set.
        { name: 'mcp-readonly-key', value: empty(mcpReadonlyKey) ? 'unset' : mcpReadonlyKey }
      ]
      ingress: {
        external: true
        targetPort: containerTargetPort
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: uami.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'orchestrator'
          image: orchestratorImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'PORT', value: string(containerTargetPort) }
            { name: 'AZURE_OPENAI_ENDPOINT', value: foundry.properties.endpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: appModelDeployment }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2024-12-01-preview' }
            { name: 'AZURE_CLIENT_ID', value: uami.properties.clientId }
            { name: 'DEAL_ROOM_REGION', value: location }
            { name: 'DEAL_BLOB_ENDPOINT', value: dataStorage.properties.primaryEndpoints.blob }
            { name: 'DEAL_FILINGS_CONTAINER', value: 'filings' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'DEAL_AGENT_NAME', value: dealAgentName }
            { name: 'DEAL_AGENT_MODEL', value: appModelDeployment }
            { name: 'ENTRA_TENANT_ID', value: entraTenantId }
            { name: 'MCP_AUDIENCE', value: mcpAudience }
            { name: 'MCP_REQUIRED_SCOPE', value: mcpRequiredScope }
            { name: 'M365_CLIENT_ID', value: m365ClientId }
            { name: 'M365_TENANT_ID', value: empty(m365TenantId) ? entraTenantId : m365TenantId }
            { name: 'M365_CLIENT_SECRET', secretRef: 'm365-client-secret' }
            { name: 'MCP_READONLY_KEY', secretRef: 'mcp-readonly-key' }
          ]
        }
      ]
      scale: {
        // Cosmos is the authoritative datastore: deal writes use optimistic
        // concurrency (_etag read-modify-write in lib/store.mutateDeal) so a stale
        // replica can never clobber a newer write, and every replica re-reads from
        // Cosmos on a short interval (lib/store background sync) so reads converge.
        // That makes horizontal scale-out safe, so we run multiple replicas.
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Azure Functions — Flex Consumption (event-driven glue)
resource funcStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${workload}fn${environmentName}${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource funcStorageBlob 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: funcStorage
  name: 'default'
}

resource funcDeployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: funcStorageBlob
  name: 'deployments'
}

resource funcPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'asp-${namePrefix}'
  location: location
  tags: tags
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'func-${workload}-events-${environmentName}-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: funcPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${funcStorage.properties.primaryEndpoints.blob}deployments'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'python'
        version: '3.11'
      }
    }
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: funcStorage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
      ]
    }
  }
}

// Messaging
resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: 'sb-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: pna
  }
}

resource sbDealEvents 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: 'deal-events'
  properties: {
    maxDeliveryCount: 10
    lockDuration: 'PT1M'
  }
}

resource eventGrid 'Microsoft.EventGrid/topics@2022-06-15' = {
  name: 'evgt-${workload}-${environmentName}-${suffix}'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    inputSchema: 'EventGridSchema'
    publicNetworkAccess: pna
  }
}

// Cosmos DB (serverless) — agent state, conversation history, deal-record metadata index
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
  name: 'dealroom'
  properties: {
    resource: { id: 'dealroom' }
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

//==============================================================================
// Networking — VNet (always) + optional Private Endpoints & Private DNS
//==============================================================================

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'vnet-${namePrefix}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [ '10.40.0.0/16' ]
    }
    subnets: [
      {
        name: 'snet-ai'
        properties: { addressPrefix: '10.40.1.0/24' }
      }
      {
        name: 'snet-data'
        properties: { addressPrefix: '10.40.2.0/24' }
      }
      {
        name: 'snet-app'
        properties: {
          addressPrefix: '10.40.3.0/24'
          delegations: [
            {
              name: 'aca'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
      {
        name: 'snet-pe'
        properties: {
          addressPrefix: '10.40.4.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var privateDnsZoneNames = [
  'privatelink.cognitiveservices.azure.com'
  'privatelink.openai.azure.com'
  'privatelink.services.ai.azure.com'
  'privatelink.search.windows.net'
  'privatelink.vaultcore.azure.net'
  'privatelink.documents.azure.com'
  'privatelink.servicebus.windows.net'
  'privatelink.blob.${environment().suffixes.storage}'
  'privatelink.dfs.${environment().suffixes.storage}'
]

var privateEndpoints = [
  {
    name: 'foundry'
    serviceId: foundry.id
    groupId: 'account'
    zones: [
      'privatelink.cognitiveservices.azure.com'
      'privatelink.openai.azure.com'
      'privatelink.services.ai.azure.com'
    ]
  }
  {
    name: 'search'
    serviceId: search.id
    groupId: 'searchService'
    zones: [ 'privatelink.search.windows.net' ]
  }
  {
    name: 'kv'
    serviceId: keyVault.id
    groupId: 'vault'
    zones: [ 'privatelink.vaultcore.azure.net' ]
  }
  {
    name: 'cosmos'
    serviceId: cosmos.id
    groupId: 'Sql'
    zones: [ 'privatelink.documents.azure.com' ]
  }
  {
    name: 'sb'
    serviceId: serviceBus.id
    groupId: 'namespace'
    zones: [ 'privatelink.servicebus.windows.net' ]
  }
  {
    name: 'stblob'
    serviceId: dataStorage.id
    groupId: 'blob'
    zones: [ 'privatelink.blob.${environment().suffixes.storage}' ]
  }
  {
    name: 'stdfs'
    serviceId: dataStorage.id
    groupId: 'dfs'
    zones: [ 'privatelink.dfs.${environment().suffixes.storage}' ]
  }
]

resource privateDnsZones 'Microsoft.Network/privateDnsZones@2020-06-01' = [
  for z in (enablePrivateEndpoints ? privateDnsZoneNames : []): {
    name: z
    location: 'global'
    tags: tags
  }
]

resource privateDnsLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = [
  for z in (enablePrivateEndpoints ? privateDnsZoneNames : []): {
    name: '${z}/link-${namePrefix}'
    location: 'global'
    tags: tags
    properties: {
      registrationEnabled: false
      virtualNetwork: { id: vnet.id }
    }
    dependsOn: [ privateDnsZones ]
  }
]

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = [
  for pe in (enablePrivateEndpoints ? privateEndpoints : []): {
    name: 'pe-${pe.name}-${namePrefix}'
    location: location
    tags: tags
    properties: {
      subnet: { id: '${vnet.id}/subnets/snet-pe' }
      privateLinkServiceConnections: [
        {
          name: 'plsc-${pe.name}'
          properties: {
            privateLinkServiceId: pe.serviceId
            groupIds: [ pe.groupId ]
          }
        }
      ]
    }
  }
]

resource privateEndpointDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = [
  for pe in (enablePrivateEndpoints ? privateEndpoints : []): {
    name: 'pe-${pe.name}-${namePrefix}/default'
    properties: {
      privateDnsZoneConfigs: [
        for z in pe.zones: {
          name: replace(z, '.', '-')
          properties: {
            privateDnsZoneId: resourceId('Microsoft.Network/privateDnsZones', z)
          }
        }
      ]
    }
    dependsOn: [
      privateEndpoint
      privateDnsZones
    ]
  }
]

//==============================================================================
// RBAC — grant the user-assigned identity least-privilege data-plane access
//==============================================================================

resource raKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, roleIds.keyVaultSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.keyVaultSecretsUser)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource raFoundryOpenAIUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uami.id, roleIds.cognitiveServicesOpenAIUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesOpenAIUser)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource raFoundryCogUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundry.id, uami.id, roleIds.cognitiveServicesUser)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource raSearchIndexContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, uami.id, roleIds.searchIndexDataContributor)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchIndexDataContributor)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource raSearchServiceContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, uami.id, roleIds.searchServiceContributor)
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.searchServiceContributor)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource raStorageBlobContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(dataStorage.id, uami.id, roleIds.storageBlobDataContributor)
  scope: dataStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageBlobDataContributor)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource raServiceBusOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, uami.id, roleIds.serviceBusDataOwner)
  scope: serviceBus
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.serviceBusDataOwner)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function app's system-assigned identity needs blob data ownership for Flex deployment + AzureWebJobsStorage (managed identity)
resource raFuncStorageOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(funcStorage.id, functionApp.id, roleIds.storageBlobDataOwner)
  scope: funcStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageBlobDataOwner)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Orchestrator Container App pulls its image from ACR using the user-assigned identity
resource raAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, roleIds.acrPull)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.acrPull)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cosmos DB data-plane access for the user-assigned identity (built-in Data Contributor)
resource cosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, uami.id, '00000000-0000-0000-0000-000000000002')
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: uami.properties.principalId
    scope: cosmos.id
  }
}

//==============================================================================
// Outputs
//==============================================================================

output resourceGroupName string = resourceGroup().name
output location string = location
output managedIdentityClientId string = uami.properties.clientId
output managedIdentityPrincipalId string = uami.properties.principalId
output keyVaultName string = keyVault.name
output dataStorageName string = dataStorage.name
output foundryAccountName string = foundry.name
output foundryEndpoint string = foundry.properties.endpoint
output foundryProjectName string = foundryProject.name
output deployedModels array = [for (d, i) in openAiDeployments: d.name]
output documentIntelligenceEndpoint string = docIntelligence.properties.endpoint
output contentSafetyEndpoint string = contentSafety.properties.endpoint
output speechEndpoint string = speech.properties.endpoint
output searchName string = search.name
output searchEndpoint string = 'https://${search.name}.search.windows.net'
output apimGatewayUrl string = deployApim ? (apim.?properties.gatewayUrl ?? 'provisioning') : 'not-deployed'
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output containerAppName string = orchestratorApp.name
output containerAppFqdn string = orchestratorApp.properties.configuration.ingress.fqdn
output containerAppUrl string = 'https://${orchestratorApp.properties.configuration.ingress.fqdn}'
output functionAppName string = functionApp.name
output serviceBusNamespace string = serviceBus.name
output eventGridEndpoint string = eventGrid.properties.endpoint
output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output fabricCapacityName string = (deployFabric && !empty(fabricAdminMembers)) ? fabric.name : 'not-deployed'
output appInsightsConnectionString string = appInsights.properties.ConnectionString
