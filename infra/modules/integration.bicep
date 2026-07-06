//==============================================================================
//  dealhub · INTEGRATION domain — API Management (AI Gateway), Service Bus,
//  Event Grid
//  RG: rg-dealhub-integration-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param workload string
param environmentName string
param suffix string
param tags object
param enablePrivateEndpoints bool
param deployApim bool
param apimSkuName string
param apimPublisherEmail string
param apimPublisherName string
@description('Principal ID of the core UAMI granted data-plane access to Service Bus.')
param uamiPrincipalId string

var pna = enablePrivateEndpoints ? 'Disabled' : 'Enabled'
var serviceBusDataOwnerRoleId = '090c5cfd-751d-490a-894a-3ce6f1109419'

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

// RBAC — core UAMI owns Service Bus data-plane.
resource raServiceBusOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, uamiPrincipalId, serviceBusDataOwnerRoleId)
  scope: serviceBus
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', serviceBusDataOwnerRoleId)
    principalId: uamiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output serviceBusId string = serviceBus.id
output serviceBusNamespace string = serviceBus.name
output eventGridEndpoint string = eventGrid.properties.endpoint
output apimGatewayUrl string = deployApim ? (apim.?properties.gatewayUrl ?? 'provisioning') : 'not-deployed'
