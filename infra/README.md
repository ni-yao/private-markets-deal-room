# The Deal Room — Azure Infrastructure (Bicep)

Single-file, single-resource-group infrastructure-as-code for the target-state
**Deal Room** (AI-native private-equity deal flow). The subscription is **not**
hard-coded — you choose it at deploy time, so you can retarget subscriptions
without editing any file.

| File | Purpose |
|------|---------|
| `main.bicep` | Full Azure bill-of-materials (`targetScope = 'resourceGroup'`). |
| `main.dev.bicepparam` | Dev values (public, fast iteration). |
| `main.test.bicepparam` | Test/UAT values (mirrors dev, separate subscription). |
| `main.prod.bicepparam` | Prod values (private endpoints, purge protection, ZRS, APIM SLA). |
| `../.github/workflows/deal-room-infra.yml` | CI/CD: OIDC login, lint, what-if on PR, deploy-as-stack on merge. |
| `../.github/workflows/deal-room-app.yml` | CI/CD: build the app image in ACR and roll it out to the Container App. |

> The **application** that runs in the orchestrator Container App lives in
> [`../app`](../app/README.md). This template provisions the registry (ACR),
> Container App, and the Foundry environment variables it needs; the app
> workflow builds and deploys the image.

## What gets deployed (45 resources)

| Layer | Resources |
|-------|-----------|
| Identity & ops | User-assigned managed identity, Log Analytics, Application Insights, Key Vault (RBAC) |
| Data | ADLS Gen2 storage (`landing`/`bronze`/`silver`/`gold`), Microsoft Fabric capacity *(conditional)* |
| AI & intelligence | Azure AI Foundry account + project, model deployments (gpt-4o, gpt-4o-mini, text-embedding-3-large), Document Intelligence, Content Safety, Speech, Azure AI Search |
| App platform | Azure Container Registry, Container Apps env + **Deal Room** orchestrator app (wired to Foundry via managed identity) |
| Integration & compute | API Management (AI Gateway), Azure Functions (Flex Consumption), Service Bus, Event Grid, Cosmos DB (serverless) |
| Networking | VNet + 4 subnets; optional Private Endpoints + Private DNS *(off by default)* |
| Security | Least-privilege RBAC for the managed identity + function app (incl. AcrPull, Cognitive Services OpenAI User) |

## Prerequisites

- Azure CLI `>= 2.61` with the Bicep extension (`az bicep version`); the
  `az stack group` commands ship in-box with current CLI.
- Permission to create a resource group and assign roles (Owner or
  User Access Administrator) in the target subscription.

## Deploy — the recommended way (Azure Deployment Stack)

Deploy the solution as a **deployment stack**, not a one-off deployment. A stack
manages every resource as one lifecycle unit: resources you later remove from
`main.bicep` are cleaned up automatically, and `--deny-settings-mode` protects
the live resources from accidental deletion.

```powershell
# 1. Pick the subscription (this is the only place it is set)
az account set --subscription "<SUBSCRIPTION_ID_OR_NAME>"

# 2. Create the resource group
az group create -n rg-dealroom-dev-swc -l swedencentral

# 3. Preview changes
az deployment group what-if `
  -g rg-dealroom-dev-swc `
  -f main.bicep -p main.dev.bicepparam

# 4. Deploy as a stack
az stack group create `
  --name stack-dealroom-dev `
  -g rg-dealroom-dev-swc `
  -f main.bicep -p main.dev.bicepparam `
  --deny-settings-mode none `
  --action-on-unmanage deleteResources `
  --yes
```

For **prod**, use the hardened params and protect the resources from deletion:

```powershell
az account set --subscription "<PROD_SUBSCRIPTION>"
az group create -n rg-dealroom-prod-swc -l swedencentral
az stack group create `
  --name stack-dealroom-prod `
  -g rg-dealroom-prod-swc `
  -f main.bicep -p main.prod.bicepparam `
  --deny-settings-mode denyDelete `
  --action-on-unmanage deleteResources `
  --yes
```

> A plain `az deployment group create -f main.bicep -p main.dev.bicepparam`
> still works for a quick smoke test, but it leaves orphans behind and offers no
> delete protection — prefer the stack.

## Deploy — the automated way (CI/CD with OIDC)

`../.github/workflows/deal-room-infra.yml` runs the proper pipeline:

- **PR → `main`**: lint (`az bicep build`) + `what-if` against dev (posted to the
  job summary). No secrets — login is OIDC / federated workload identity.
- **Merge to `main`**: deploys the dev stack.
- **Manual run** (`workflow_dispatch`): pick `dev` / `test` / `prod`.

### One-time setup

1. Create three **GitHub Environments**: `dev`, `test`, `prod`. Add **required
   reviewers** to `prod` for an approval gate.
2. In each environment, create an **app registration / managed identity** with a
   **federated credential** trusting this repo + environment, then store these as
   **environment secrets** (each environment can point at a *different
   subscription* — this is how you "switch subscriptions" with zero code change):

   | Secret | Value |
   |--------|-------|
   | `AZURE_CLIENT_ID` | App registration (client) ID. |
   | `AZURE_TENANT_ID` | Directory (tenant) ID. |
   | `AZURE_SUBSCRIPTION_ID` | Target subscription for that environment. |

3. Grant each identity **Owner** (or Contributor + User Access Administrator) on
   its subscription/resource group so it can assign the RBAC roles in the template.

## Environment & subscription strategy

- One subscription per environment (dev / test / prod). The template is
  subscription-agnostic; only the per-env `.bicepparam` values and the GitHub
  Environment secrets differ.
- Same `main.bicep` is promoted unchanged across all environments.

## Key parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `location` | `swedencentral` | EU data residency. |
| `environmentName` | `dev` | `dev` / `test` / `prod`. |
| `openAiDeployments` | gpt-4o, gpt-4o-mini, text-embedding-3-large | Edit list / capacities to taste. |
| `deployFabric` | `true` | Fabric also needs **`fabricAdminMembers`**; if that list is empty Fabric is skipped. |
| `fabricAdminMembers` | `[]` | Add a UPN/objectId to actually provision Fabric. |
| `deployApim` | `true` | Developer SKU takes ~30–45 min. Set `false` for faster dev loops. |
| `enablePrivateEndpoints` | `false` | `true` locks data-plane services to the VNet and disables public access. |
| `keyVaultPurgeProtection` | `false` | Keep `false` in dev so you can redeploy the same vault name. |

## Not provisioned by this template

These are **SaaS / tenant-level** or **subscription-scope** and must be handled
via licensing and admin portals, not Bicep:

- Microsoft 365 / Microsoft 365 Copilot, SharePoint Online
- Dynamics 365, Power Platform / Dataverse, Copilot Studio
- Microsoft Purview tenant configuration (labels, DLP, audit)
- Microsoft Defender for Cloud plans and Azure Policy assignments
  (subscription-scope — deploy separately with a `targetScope='subscription'`
  template/stack via `az stack sub create`).

## Notes

- **Deploy as a stack** (`az stack group create`) rather than a one-off
  deployment so the whole Deal Room is managed as one lifecycle unit with
  drift cleanup and delete-protection.
- Globally-unique names (storage, Key Vault, Cosmos, Search, APIM, Foundry
  sub-domain, Fabric) append a deterministic hash of the resource group id.
- Model deployments are serialized (`@batchSize(1)`) because a Cognitive
  Services account cannot create multiple deployments in parallel.
- Azure Functions uses managed-identity access to its storage account
  (`AzureWebJobsStorage__accountName`) — no storage keys are stored.
- As the solution grows, consider splitting into two stacks by change cadence:
  a slow **platform** stack (networking, APIM, Fabric, Foundry, Cosmos) and a
  fast **app** stack (Container App, Functions) so the ~40-min APIM provision
  doesn't gate everyday app changes.
