#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Auto-provision the Microsoft Entra app registrations the Deal Room accelerator needs
  and grant tenant admin consent. Idempotent: re-running finds and updates the existing
  apps by display name (safe to run repeatedly).

  Creates / ensures:
    1. "<prefix> Teams SSO"   — Teams tab SSO (exposes access_as_user; delegated Graph
                                 User.Read, Files.ReadWrite, Sites.ReadWrite.All,
                                 offline_access for the per-user OBO document flow).
    2. "<prefix> M365 Connector" — delegated Graph for Teams channels + SharePoint VDR.
    3. "<prefix> Bot"         — the in-channel conversational bot app (+ service principal).
    4. "<prefix> MCP"         — the Deal MCP server audience (exposes deals.read).

.DESCRIPTION
  Run this AFTER the infrastructure deploy (so the Container App FQDNs exist) while signed
  in to `az` as an admin who can create app registrations and grant admin consent
  (Application Administrator, Cloud Application Administrator, or Global Administrator).

  It emits:
    • entra.generated.bicepparam  — a using-less fragment with the created app/client IDs
      (non-secret) to `--parameters` into `az deployment sub create`.
    • the three secret parameters to pass at deploy time (printed once, not written to disk).

.EXAMPLE
  # After: az deployment sub create ... (which outputs teamsAppFqdn + orchestratorFqdn)
  ./scripts/provision-entra.ps1 -Workload dealhub -EnvironmentName dev `
      -TeamsFqdn ca-dealhub-teams-dev-swc.<env>.swedencentral.azurecontainerapps.io `
      -OrchFqdn  ca-dealhub-orch-dev-swc.<env>.swedencentral.azurecontainerapps.io
#>
[CmdletBinding()]
param(
  [string]$Workload = 'dealhub',
  [string]$EnvironmentName = 'dev',
  [string]$DisplayPrefix = '',                       # default: "Deal Room (<env>)"
  [string]$TeamsFqdn = '',                           # from infra output `teamsAppFqdn`
  [string]$OrchFqdn = '',                            # from infra output `orchestratorFqdn`
  [string]$McpScope = 'deals.read',
  [string]$OutFile = './entra.generated.bicepparam',
  [switch]$SkipConsent                               # create apps but don't grant admin consent
)

$ErrorActionPreference = 'Stop'
$GRAPH_APPID = '00000003-0000-0000-c000-000000000000'
if (-not $DisplayPrefix) { $DisplayPrefix = "Deal Room ($EnvironmentName)" }

function Invoke-AzJson {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $out = az @Args 2>$null
  if ($LASTEXITCODE -ne 0) { throw "az $($Args -join ' ') failed" }
  if (-not $out) { return $null }
  return ($out | ConvertFrom-Json)
}

# Write a JSON body to a temp file and PATCH/POST it via `az rest` (robust cross-platform
# quoting for nested Graph objects). Retries on transient failures — a freshly created app
# takes a few seconds to replicate before it accepts api/identifierUri PATCHes.
function Invoke-GraphRest {
  param([string]$Method, [string]$Url, $Body, [int]$Retries = 6)
  $tmp = New-TemporaryFile
  try {
    ($Body | ConvertTo-Json -Depth 20 -Compress) | Set-Content -Path $tmp -Encoding utf8
    for ($i = 1; $i -le $Retries; $i++) {
      $out = az rest --method $Method --url $Url --headers 'Content-Type=application/json' --body "@$tmp" 2>&1
      if ($LASTEXITCODE -eq 0) { return ($out | ConvertFrom-Json -ErrorAction SilentlyContinue) }
      if ($i -eq $Retries) { throw "graph $Method $Url failed: $out" }
      Start-Sleep -Seconds ([Math]::Min(5 * $i, 20))
    }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

Write-Host "== Deal Room — Entra provisioning ==" -ForegroundColor Cyan
$ctx = Invoke-AzJson account show
$tenantId = $ctx.tenantId
Write-Host "Tenant : $tenantId"
Write-Host "Signed-in: $($ctx.user.name)"

# Resolve Microsoft Graph delegated scope IDs by NAME (avoids hardcoding GUIDs).
$graphSp = Invoke-AzJson ad sp show --id $GRAPH_APPID
$scopeById = @{}
foreach ($s in $graphSp.oauth2PermissionScopes) { $scopeById[$s.value] = $s.id }
function ScopeAccess([string[]]$names) {
  $acc = @()
  foreach ($n in $names) {
    if (-not $scopeById.ContainsKey($n)) { throw "Unknown Graph scope '$n'" }
    $acc += @{ id = $scopeById[$n]; type = 'Scope' }
  }
  return , @(@{ resourceAppId = $GRAPH_APPID; resourceAccess = $acc })
}

# Find an app by display name or create it. Returns the Graph application object.
function Ensure-App {
  param([string]$Name, [string]$SignInAudience = 'AzureADMyOrg')
  $found = Invoke-AzJson ad app list --filter "displayName eq '$Name'" --query "[0]"
  if ($found) {
    Write-Host "  found  $Name  ($($found.appId))" -ForegroundColor DarkGray
    return $found
  }
  Write-Host "  create $Name" -ForegroundColor Green
  return Invoke-AzJson ad app create --display-name $Name --sign-in-audience $SignInAudience
}

function Ensure-Sp {
  param([string]$AppId)
  $sp = az ad sp show --id $AppId 2>$null | ConvertFrom-Json
  if (-not $sp) { $sp = Invoke-AzJson ad sp create --id $AppId }
  return $sp
}

function Grant-Consent {
  param([string]$AppId)
  if ($SkipConsent) { return }
  az ad app permission admin-consent --id $AppId 2>$null | Out-Null
}

# Create (rotate) a client secret and return its value — never printed by the caller.
function New-AppSecret {
  param([string]$AppId, [string]$Display = 'accelerator')
  $c = Invoke-AzJson ad app credential reset --id $AppId --display-name $Display --years 2 --query "{p:password}"
  return $c.p
}

$results = [ordered]@{}

# 1) TEAMS TAB SSO ------------------------------------------------------------
Write-Host "`n[1/4] Teams tab SSO" -ForegroundColor Yellow
$sso = Ensure-App -Name "$DisplayPrefix Teams SSO"
$ssoObj = $sso.id; $ssoAppId = $sso.appId
$identifierUri = $TeamsFqdn ? "api://$TeamsFqdn/$ssoAppId" : "api://$ssoAppId"
# Standard Microsoft Teams / Office first-party client IDs that pre-consent to SSO.
$teamsClients = @(
  '1fec8e78-bce4-4aaf-ab1b-5451cc387264','5e3ce6c0-2b1f-4285-8d4b-75ee78787346',
  '4765445b-32c6-49b0-83e6-1d93765276ca','0ec893e0-5785-4de6-99da-4ed124e5296c',
  'd3590ed6-52b3-4102-aeff-aad2292ab01c','bc59ab01-8403-45c6-8796-ac3ef710b3e3',
  '27922004-5251-4030-b22d-91ecd9a37ea4'
)
$scopeId = (Invoke-AzJson ad app show --id $ssoAppId --query "api.oauth2PermissionScopes[?value=='access_as_user'].id | [0]")
if (-not $scopeId) { $scopeId = [guid]::NewGuid().ToString() }
$apiObj = @{
  api = @{
    requestedAccessTokenVersion = 2
    oauth2PermissionScopes = @(@{
      id = $scopeId; value = 'access_as_user'; type = 'User'; isEnabled = $true
      adminConsentDisplayName = 'Access Deal Room as the signed-in user'
      adminConsentDescription = 'Allows the Deal Room Teams app to call its API as the signed-in user.'
      userConsentDisplayName = 'Access Deal Room as you'
      userConsentDescription = 'Allows the Deal Room Teams app to call its API as you.'
    })
    preAuthorizedApplications = @($teamsClients | ForEach-Object { @{ appId = $_; delegatedPermissionIds = @($scopeId) } })
  }
  identifierUris = @($identifierUri)
  requiredResourceAccess = ScopeAccess @('User.Read','Files.ReadWrite','Sites.ReadWrite.All','offline_access')
}
if ($TeamsFqdn) { $apiObj.spa = @{ redirectUris = @("https://$TeamsFqdn/auth-end.html") } }
Invoke-GraphRest PATCH "https://graph.microsoft.com/v1.0/applications/$ssoObj" $apiObj | Out-Null
Ensure-Sp $ssoAppId | Out-Null
Grant-Consent $ssoAppId
$ssoSecret = New-AppSecret $ssoAppId 'teams-tab'
$results.teamsTabClientId = $ssoAppId
Write-Host "  identifierUri: $identifierUri"

# 2) M365 DELEGATED CONNECTOR -------------------------------------------------
Write-Host "`n[2/4] M365 connector" -ForegroundColor Yellow
$m365 = Ensure-App -Name "$DisplayPrefix M365 Connector"
$m365Redirects = @()
if ($OrchFqdn)  { $m365Redirects += "https://$OrchFqdn/api/m365/callback" }
if ($TeamsFqdn) { $m365Redirects += "https://$TeamsFqdn/api/m365/callback" }
$m365Body = @{
  web = @{ redirectUris = $m365Redirects }
  requiredResourceAccess = ScopeAccess @(
    'offline_access','openid','profile','email','User.Read',
    'Team.ReadBasic.All','Team.Create','Channel.Create',
    'ChannelSettings.ReadWrite.All','Sites.ReadWrite.All','Files.ReadWrite.All',
    'GroupMember.Read.All','TeamMember.ReadWrite.All','TeamsAppInstallation.ReadWriteForTeam'
  )
}
Invoke-GraphRest PATCH "https://graph.microsoft.com/v1.0/applications/$($m365.id)" $m365Body | Out-Null
Ensure-Sp $m365.appId | Out-Null
Grant-Consent $m365.appId
$m365Secret = New-AppSecret $m365.appId 'm365-connector'
$results.m365ClientId = $m365.appId

# 3) TEAMS BOT ----------------------------------------------------------------
Write-Host "`n[3/4] Teams bot" -ForegroundColor Yellow
$bot = Ensure-App -Name "$DisplayPrefix Bot" -SignInAudience 'AzureADMultipleOrgs'
Ensure-Sp $bot.appId | Out-Null   # REQUIRED: without the SP the bot cannot acquire a reply token (AADSTS7000229)
$botSecret = New-AppSecret $bot.appId 'bot'
$results.botAppId = $bot.appId

# 4) DEAL MCP SERVER ----------------------------------------------------------
Write-Host "`n[4/4] Deal MCP server" -ForegroundColor Yellow
$mcp = Ensure-App -Name "$DisplayPrefix MCP"
$mcpScopeId = (Invoke-AzJson ad app show --id $mcp.appId --query "api.oauth2PermissionScopes[?value=='$McpScope'].id | [0]")
if (-not $mcpScopeId) { $mcpScopeId = [guid]::NewGuid().ToString() }
$mcpBody = @{
  identifierUris = @("api://$($mcp.appId)")
  api = @{ oauth2PermissionScopes = @(@{
    id = $mcpScopeId; value = $McpScope; type = 'User'; isEnabled = $true
    adminConsentDisplayName = "Read Deal Room deals"; adminConsentDescription = "Read the Deal Room deal pipeline via the MCP server."
    userConsentDisplayName = "Read deals"; userConsentDescription = "Read the Deal Room deal pipeline."
  }) }
}
Invoke-GraphRest PATCH "https://graph.microsoft.com/v1.0/applications/$($mcp.id)" $mcpBody | Out-Null
Ensure-Sp $mcp.appId | Out-Null
$results.entraTenantId = $tenantId
$results.mcpAudience = "api://$($mcp.appId)"
$results.mcpRequiredScope = $McpScope
$results.m365TenantId = $tenantId

# ---- Emit the bicepparam fragment (non-secret IDs) --------------------------
$lines = @('// GENERATED by scripts/provision-entra.ps1 — merge into your main.<env>.bicepparam')
foreach ($k in $results.Keys) { $lines += "param $k = '$($results[$k])'" }
$lines += "param deployBot = true"
$lines += "param deployTeamsApp = true"
Set-Content -Path $OutFile -Value ($lines -join "`n") -Encoding utf8

Write-Host "`n== Done ==" -ForegroundColor Cyan
Write-Host "Wrote non-secret IDs -> $OutFile" -ForegroundColor Green
Write-Host "`nPass these SECRET parameters at deploy time (shown once, not saved):" -ForegroundColor Yellow
Write-Host "  --parameters ``"
Write-Host "    teamsTabClientSecret=$ssoSecret ``"
Write-Host "    m365ClientSecret=$m365Secret ``"
Write-Host "    botAppPassword=$botSecret"
if (-not $TeamsFqdn) {
  Write-Host "`nNOTE: -TeamsFqdn was not supplied, so the SSO identifierUri is host-less" -ForegroundColor DarkYellow
  Write-Host "      (api://<appId>). Re-run with -TeamsFqdn once the Teams Container App exists" -ForegroundColor DarkYellow
  Write-Host "      so Teams SSO can match the tab domain." -ForegroundColor DarkYellow
}
