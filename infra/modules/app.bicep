//==============================================================================
//  dealhub · APP domain — Container Apps env + ACR, the SHARED BACKEND
//  orchestrator (single data source: /api + /mcp), an optional Teams-interface
//  Container App (forwards to the shared backend), and the events Function App.
//  RG: rg-dealhub-app-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param locationShort string
param namePrefix string
param workload string
param environmentName string
@minLength(5)
param suffix string
param tags object
param enablePrivateEndpoints bool
param acrSku string
param containerTargetPort int
param orchestratorImage string
param appModelDeployment string
param dealAgentName string
param entraTenantId string
param mcpAudience string
param mcpRequiredScope string
param m365ClientId string
param m365TenantId string
@secure()
param m365ClientSecret string
@secure()
param mcpReadonlyKey string = ''
param m365TeamId string
param workspaceTenant string

@description('Tenant-specific Teams app catalog id (org-catalog teamsApp) used to install the Deal Dashboard app + bot into deal teams. Empty skips the app install (non-fatal).')
param teamsAppCatalogId string = ''
@description('Entra/M365 group whose members every deal channel is auto-published to.')
param m365PublishGroup string = 'Private Equity Deals'

@description('Deploy the Teams-interface Container App (forwards to the shared backend). Enabled in the Teams phase once the teams-app image exists.')
param deployTeamsApp bool = false
@description('Container image for the Teams-interface Container App.')
param teamsImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
@description('Port the Teams-interface container listens on.')
param teamsTargetPort int = 8090

@description('Orchestrator replica floor. Keep 1: the shared backend holds the M365 delegated token in-memory and a single writer avoids datastore races.')
@minValue(1)
param orchestratorMinReplicas int = 1
@description('Orchestrator replica ceiling. Keep equal to the floor (1) unless you have externalised the M365 token and validated multi-writer behaviour.')
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

// Cross-domain wiring (from core + ai modules)
param uamiResourceId string
param uamiClientId string
param uamiPrincipalId string
param coreResourceGroupName string
param logAnalyticsName string
param appInsightsConnectionString string
param foundryEndpoint string
param contentSafetyEndpoint string = ''
param cosmosEndpoint string = ''
param cosmosDatabase string = 'dealroom'

// Fabric / OneLake market-intelligence binding (external workspace; not provisioned here).
param fabricLive bool = false
param fabricSqlEndpoint string = ''
param fabricSqlDatabase string = 'deal_room_starter'
param fabricWorkspace string = 'Deal Room'
param fabricLakehouse string = 'deal_room_starter'
param onelakeWorkspaceId string = ''
param onelakeLakehouseId string = ''

@description('Identity-aware RBAC (prefab roles) — Entra object IDs (users/groups) per role.')
param partnerIds array = []
param dealTeamIds array = []
param analystIds array = []
@allowed([ 'partner', 'deal-team', 'analyst', 'member' ])
param defaultAgentRole string = 'deal-team'
@description('Shared Teams->orchestrator secret (per-user identity + OBO Graph token). Empty = auto-derived.')
@secure()
param botBackendKey string = ''

var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
// Stable per-customer internal key when not supplied.
var botKey = empty(botBackendKey) ? uniqueString(subscription().id, workload, environmentName, 'bot-backend-key') : botBackendKey
var roleIds = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
}

// Log Analytics lives in the core RG — reference it to wire Container Apps logs.
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsName
  scope: resourceGroup(coreResourceGroupName)
}

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

// SHARED BACKEND — the single data source for web, Teams and Copilot.
resource orchestratorApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${workload}-orch-${environmentName}-${locationShort}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uamiResourceId}': {}
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
        { name: 'bot-backend-key', value: botKey }
      ]
      ingress: {
        external: true
        targetPort: containerTargetPort
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: uamiResourceId
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
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: containerTargetPort }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: containerTargetPort }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 6
            }
          ]
          env: [
            { name: 'PORT', value: string(containerTargetPort) }
            { name: 'AZURE_OPENAI_ENDPOINT', value: foundryEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: appModelDeployment }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2024-12-01-preview' }
            { name: 'AZURE_CLIENT_ID', value: uamiClientId }
            { name: 'DEAL_ROOM_REGION', value: location }
            { name: 'WORKSPACE_TENANT', value: workspaceTenant }
            { name: 'CONTENT_SAFETY_ENDPOINT', value: contentSafetyEndpoint }
            { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
            { name: 'COSMOS_DATABASE', value: cosmosDatabase }
            { name: 'FABRIC_LIVE', value: string(fabricLive) }
            { name: 'FABRIC_SQL_ENDPOINT', value: fabricSqlEndpoint }
            { name: 'FABRIC_SQL_DATABASE', value: fabricSqlDatabase }
            { name: 'FABRIC_WORKSPACE', value: fabricWorkspace }
            { name: 'FABRIC_LAKEHOUSE', value: fabricLakehouse }
            { name: 'ONELAKE_WORKSPACE_ID', value: onelakeWorkspaceId }
            { name: 'ONELAKE_LAKEHOUSE_ID', value: onelakeLakehouseId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'DEAL_AGENT_NAME', value: dealAgentName }
            { name: 'DEAL_AGENT_MODEL', value: appModelDeployment }
            { name: 'ENTRA_TENANT_ID', value: entraTenantId }
            { name: 'MCP_AUDIENCE', value: mcpAudience }
            { name: 'MCP_REQUIRED_SCOPE', value: mcpRequiredScope }
            { name: 'M365_CLIENT_ID', value: m365ClientId }
            { name: 'M365_TENANT_ID', value: empty(m365TenantId) ? entraTenantId : m365TenantId }
            { name: 'M365_TEAM_ID', value: m365TeamId }
            { name: 'TEAMS_APP_CATALOG_ID', value: teamsAppCatalogId }
            { name: 'M365_PUBLISH_GROUP', value: m365PublishGroup }
            { name: 'M365_CLIENT_SECRET', secretRef: 'm365-client-secret' }
            { name: 'MCP_READONLY_KEY', secretRef: 'mcp-readonly-key' }
            { name: 'BOT_BACKEND_KEY', secretRef: 'bot-backend-key' }
            { name: 'PARTNER_IDS', value: join(partnerIds, ',') }
            { name: 'DEAL_TEAM_IDS', value: join(dealTeamIds, ',') }
            { name: 'ANALYST_IDS', value: join(analystIds, ',') }
            { name: 'DEFAULT_AGENT_ROLE', value: defaultAgentRole }
          ]
        }
      ]
      scale: {
        minReplicas: orchestratorMinReplicas
        maxReplicas: orchestratorMaxReplicas
      }
    }
  }
}

// TEAMS INTERFACE — thin front-end + SSO/bot; forwards data to the shared backend.
resource teamsApp 'Microsoft.App/containerApps@2024-03-01' = if (deployTeamsApp) {
  name: 'ca-${workload}-teams-${environmentName}-${locationShort}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uamiResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        // Inert placeholders keep the template valid until SSO / bot are configured;
        // the Teams app gates SSO on TEAMS_TAB_CLIENT_ID and the bot on BOT_APP_ID.
        { name: 'teams-tab-client-secret', value: empty(teamsTabClientSecret) ? 'unset' : teamsTabClientSecret }
        { name: 'bot-app-password', value: empty(botAppPassword) ? 'unset' : botAppPassword }
        { name: 'bot-backend-key', value: botKey }
      ]
      ingress: {
        external: true
        targetPort: teamsTargetPort
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: uamiResourceId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'teams'
          image: teamsImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/healthz', port: teamsTargetPort }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/healthz', port: teamsTargetPort }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 6
            }
          ]
          env: [
            { name: 'PORT', value: string(teamsTargetPort) }
            { name: 'AZURE_CLIENT_ID', value: uamiClientId }
            // Single source of truth — the Teams app forwards to the shared backend.
            { name: 'SHARED_BACKEND_URL', value: 'https://${orchestratorApp.properties.configuration.ingress.fqdn}' }
            { name: 'APP_BASE_URL', value: 'https://ca-${workload}-teams-${environmentName}-${locationShort}.${caEnv.properties.defaultDomain}' }
            { name: 'ENTRA_TENANT_ID', value: entraTenantId }
            // Per-user Teams tab SSO (access_as_user).
            { name: 'TEAMS_TAB_CLIENT_ID', value: teamsTabClientId }
            { name: 'TEAMS_TAB_CLIENT_SECRET', secretRef: 'teams-tab-client-secret' }
            // In-channel conversational bot (context-aware, login-free via managed identity).
            { name: 'BOT_APP_ID', value: botAppId }
            { name: 'BOT_APP_PASSWORD', secretRef: 'bot-app-password' }
            { name: 'BOT_APP_TYPE', value: botAppType }
            { name: 'BOT_BACKEND_KEY', secretRef: 'bot-backend-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// Azure Bot registration for the in-channel conversational bot. Global resource;
// its messaging endpoint targets the Teams app /api/messages. Optional — gated on
// deployBot + a bot app id + the Teams app (which hosts the messaging endpoint).
//
// PREREQUISITE (SingleTenant): the botAppId app registration MUST also have a
// service principal in the tenant (`az ad sp create --id <botAppId>`). Without it
// the bot receives messages but every reply fails token acquisition with
// AADSTS7000229 ("missing service principal") and the bot stays silent. The SP is
// a directory object created outside this template — see infra/README.md runbook.
resource bot 'Microsoft.BotService/botServices@2022-09-15' = if (deployBot && !empty(botAppId) && deployTeamsApp) {
  name: 'bot-${workload}-${environmentName}-${suffix}'
  location: 'global'
  tags: tags
  sku: { name: 'F0' }
  kind: 'azurebot'
  properties: {
    displayName: 'Deal Room'
    endpoint: deployTeamsApp ? 'https://${teamsApp!.properties.configuration.ingress.fqdn}/api/messages' : ''
    msaAppId: botAppId
    msaAppType: botAppType
    msaAppTenantId: botAppType == 'MultiTenant' ? '' : entraTenantId
  }
}

resource botTeamsChannel 'Microsoft.BotService/botServices/channels@2022-09-15' = if (deployBot && !empty(botAppId) && deployTeamsApp) {
  parent: bot
  name: 'MsTeamsChannel'
  location: 'global'
  properties: {
    channelName: 'MsTeamsChannel'
    properties: {
      isEnabled: true
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
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
      ]
    }
  }
}

// RBAC — UAMI pulls the app image from ACR; the Function App owns its deploy storage.
resource raAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uamiPrincipalId, roleIds.acrPull)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.acrPull)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource raFuncStorageOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(funcStorage.id, functionApp.id, roleIds.storageBlobDataOwner)
  scope: funcStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageBlobDataOwner)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output containerAppName string = orchestratorApp.name
output containerAppFqdn string = orchestratorApp.properties.configuration.ingress.fqdn
output containerAppUrl string = 'https://${orchestratorApp.properties.configuration.ingress.fqdn}'
output teamsAppName string = deployTeamsApp ? teamsApp!.name : 'not-deployed'
output teamsAppUrl string = deployTeamsApp ? 'https://${teamsApp!.properties.configuration.ingress.fqdn}' : 'not-deployed'
output teamsAppFqdn string = deployTeamsApp ? teamsApp!.properties.configuration.ingress.fqdn : 'not-deployed'
output orchestratorFqdn string = orchestratorApp.properties.configuration.ingress.fqdn
output botName string = (deployBot && !empty(botAppId) && deployTeamsApp) ? bot!.name : 'not-deployed'
output functionAppName string = functionApp.name
