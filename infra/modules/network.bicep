//==============================================================================
//  dealhub · NETWORK domain — VNet (always) + optional Private Endpoints and
//  Private DNS for the data-plane services (conditional on enablePrivateEndpoints).
//  RG: rg-dealhub-network-{env}-{loc}
//==============================================================================
targetScope = 'resourceGroup'

param location string
param namePrefix string
param tags object
param enablePrivateEndpoints bool

// Service resource IDs (from ai / data / integration / core modules) to link.
param foundryId string
param searchId string
param keyVaultId string
param cosmosId string
param serviceBusId string
param dataStorageId string

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
    serviceId: foundryId
    groupId: 'account'
    zones: [
      'privatelink.cognitiveservices.azure.com'
      'privatelink.openai.azure.com'
      'privatelink.services.ai.azure.com'
    ]
  }
  {
    name: 'search'
    serviceId: searchId
    groupId: 'searchService'
    zones: [ 'privatelink.search.windows.net' ]
  }
  {
    name: 'kv'
    serviceId: keyVaultId
    groupId: 'vault'
    zones: [ 'privatelink.vaultcore.azure.net' ]
  }
  {
    name: 'cosmos'
    serviceId: cosmosId
    groupId: 'Sql'
    zones: [ 'privatelink.documents.azure.com' ]
  }
  {
    name: 'sb'
    serviceId: serviceBusId
    groupId: 'namespace'
    zones: [ 'privatelink.servicebus.windows.net' ]
  }
  {
    name: 'stblob'
    serviceId: dataStorageId
    groupId: 'blob'
    zones: [ 'privatelink.blob.${environment().suffixes.storage}' ]
  }
  {
    name: 'stdfs'
    serviceId: dataStorageId
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

output vnetId string = vnet.id
output vnetName string = vnet.name
