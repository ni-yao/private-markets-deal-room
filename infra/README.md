# dealhub — Azure Infrastructure (Bicep)

Subscription-scoped, **domain-split** infrastructure-as-code for the target-state
**Deal Room** (AI-native private-equity deal flow). One command stands up the
whole platform across purpose-built resource groups. Fully parameterized and
customer-deployable — no author-specific tenant/subscription/resource IDs.

| File | Purpose |
|------|---------|
| `main.bicep` | Subscription-scoped orchestrator (`targetScope = 'subscription'`): creates the domain resource groups and calls the domain modules. |
| `modules/core.bicep` | Identity (UAMI), Log Analytics, App Insights, Key Vault. |
| `modules/ai.bicep` | Foundry account + project, model deployments, Document Intelligence, Content Safety, Speech, AI Search. |
| `modules/data.bicep` | ADLS Gen2, Microsoft Fabric *(conditional)*, Cosmos DB. |
| `modules/app.bicep` | ACR, Container Apps env, shared-backend orchestrator, optional Teams-interface app, Functions. |
| `modules/integration.bicep` | API Management (AI Gateway), Service Bus, Event Grid. |
| `modules/network.bicep` | VNet + optional Private Endpoints / Private DNS. |
| `main.dev.bicepparam` | Dev values (public, fast iteration). |
| `main.test.bicepparam` | Test/UAT values (mirrors dev, separate subscription). |
| `main.prod.bicepparam` | Prod values (private endpoints, purge protection, ZRS, APIM SLA). |
| `../.github/workflows/deal-room-infra.yml` | CI/CD: OIDC login, lint, what-if on PR, deploy-as-stack on merge. |
| `../.github/workflows/deal-room-app.yml` | CI/CD: build the app image in ACR and roll it out to the Container App. |

> The **application** that runs in the orchestrator Container App lives in
> [`../app`](../app/README.md). This template provisions the registry (ACR),
> Container App, and the Foundry environment variables it needs; the app
> workflow builds and deploys the image.

## What gets deployed — domain-split resource groups

`main.bicep` (subscription scope) creates six resource groups
`rg-dealhub-{domain}-{env}-{loc}` and deploys each domain's resources + its
co-located RBAC into it. The core UAMI is granted least-privilege data-plane
access to the AI, data, app and integration resources.

| Resource group | Domain | Resources |
|----------------|--------|-----------|
| `rg-dealhub-core-{env}-{loc}` | Identity & ops | User-assigned managed identity, Log Analytics, Application Insights, Key Vault (RBAC) |
| `rg-dealhub-ai-{env}-{loc}` | AI & intelligence | Foundry account + project, model deployments (gpt-5-mini, gpt-5-nano, text-embedding-3-large), Document Intelligence, Content Safety, Speech, AI Search |
| `rg-dealhub-data-{env}-{loc}` | Data | ADLS Gen2 (`landing`/`bronze`/`silver`/`gold`), Microsoft Fabric *(conditional)*, Cosmos DB (serverless) |
| `rg-dealhub-app-{env}-{loc}` | App platform | ACR, Container Apps env, **shared-backend** orchestrator (`ca-dealhub-orch`), optional **Teams** interface app (`ca-dealhub-teams`), Azure Functions (Flex Consumption) |
| `rg-dealhub-integration-{env}-{loc}` | Integration | API Management (AI Gateway), Service Bus, Event Grid |
| `rg-dealhub-network-{env}-{loc}` | Networking | VNet + 4 subnets; optional Private Endpoints + Private DNS *(off by default)* |

## Prerequisites

- Azure CLI `>= 2.61` with the Bicep extension (`az bicep version`); the
  `az stack sub` commands ship in-box with current CLI.
- **Owner** (or Contributor + User Access Administrator) at the **subscription**
  scope — the template creates resource groups and assigns roles.

## Deploy — one command (subscription-scoped stack)

Deploy as a **subscription-scoped deployment stack** so every resource group and
resource is managed as one lifecycle unit: resources you later remove from the
template are cleaned up automatically, and `--deny-settings-mode` protects the
live resources from accidental deletion.

```powershell
# 1. Pick the subscription (this is the only place it is set)
az account set --subscription "<SUBSCRIPTION_ID_OR_NAME>"

# 2. Preview changes (creates net-new rg-dealhub-* groups only)
az deployment sub what-if `
  --location swedencentral `
  -f main.bicep -p main.dev.bicepparam

# 3. Deploy as a subscription stack
az stack sub create `
  --name stack-dealhub-dev `
  --location swedencentral `
  -f main.bicep -p main.dev.bicepparam `
  --deny-settings-mode none `
  --action-on-unmanage deleteResources `
  --yes
```

For **prod**, use the hardened params and protect the resources from deletion:

```powershell
az account set --subscription "<PROD_SUBSCRIPTION>"
az stack sub create `
  --name stack-dealhub-prod `
  --location swedencentral `
  -f main.bicep -p main.prod.bicepparam `
  --deny-settings-mode denyDelete `
  --action-on-unmanage deleteResources `
  --yes
```

> A plain `az deployment sub create --location swedencentral -f main.bicep -p main.dev.bicepparam`
> also works for a quick smoke test, but a stack gives drift cleanup and delete
> protection — prefer the stack.

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
| `openAiDeployments` | gpt-5-mini, gpt-5-nano, text-embedding-3-large | Edit list / capacities to taste. |
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

- **Deploy as a stack** (`az stack sub create`) rather than a one-off
  deployment so the whole platform is managed as one lifecycle unit with
  drift cleanup and delete-protection.
- Globally-unique names (storage, Key Vault, Cosmos, Search, APIM, Foundry
  sub-domain, Fabric) append a deterministic hash derived from the
  **subscription** id + workload + env — stable across the domain RGs and per
  customer.
- Model deployments are serialized (`@batchSize(1)`) because a Cognitive
  Services account cannot create multiple deployments in parallel.
- Azure Functions uses managed-identity access to its storage account
  (`AzureWebJobsStorage__accountName`) — no storage keys are stored.
- As the solution grows, consider splitting into two stacks by change cadence:
  a slow **platform** stack (networking, APIM, Fabric, Foundry, Cosmos) and a
  fast **app** stack (Container App, Functions) so the ~40-min APIM provision
  doesn't gate everyday app changes.
