"""Grant the Deal Room app's managed identity write access to the Fabric workspace.

The deployed app writes SEC filings into the Fabric lakehouse's Files/Filings folder
(and reads market-intelligence tables via live Fabric SQL) using its Azure managed
identity. Those runtime operations need the managed identity to hold a Fabric
*workspace role* — Contributor is the minimum that permits OneLake writes.

This is a one-time grant that MUST be run by a Fabric **workspace Admin** of the
"Deal Room" workspace (a Viewer cannot assign roles). Run it with that admin's
`az login`:

    az login --tenant 301fb807-bdbc-4bac-802f-39b67f298b6c
    python scripts/grant_onelake_access.py

It is idempotent: if the identity already has a role it reports and exits cleanly.

Prerequisite tenant setting (Fabric Admin portal -> Tenant settings):
  "Service principals can use Fabric APIs" must allow this identity (all, or a
  security group that contains it). Managed identities are service principals in
  Entra, so this setting governs whether they can be added/act.
"""
import sys
import requests
from azure.identity import AzureCliCredential

WORKSPACE_ID = "205d8eab-9f0e-4e57-afb6-23d41909c287"   # "Deal Room"
MI_PRINCIPAL_ID = "2efd346a-f4bb-4423-ba1b-243fd4977db8"  # id-dealroom-dev-swc (object id)
MI_NAME = "id-dealroom-dev-swc"
ROLE = "Contributor"  # Admin | Member | Contributor | Viewer  (Contributor = least privilege that writes OneLake)

BASE = "https://api.fabric.microsoft.com/v1"


def main() -> int:
    cred = AzureCliCredential()
    token = cred.get_token("https://api.fabric.microsoft.com/.default").token
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Confirm the caller can manage roles (admin-only read); a Viewer gets 403 here.
    ra = requests.get(f"{BASE}/workspaces/{WORKSPACE_ID}/roleAssignments", headers=h, timeout=30)
    if ra.status_code == 403:
        print("ERROR: your account is not a Workspace Admin of 'Deal Room' -- it cannot assign roles.")
        print("Ask a workspace Admin (e.g. the capacity/workspace owner) to run this, or add the")
        print("identity via the Fabric portal (Workspace -> Manage access -> Add people or groups).")
        return 2
    ra.raise_for_status()

    existing = ra.json().get("value", [])
    for a in existing:
        pid = (a.get("principal") or {}).get("id")
        if pid and pid.lower() == MI_PRINCIPAL_ID.lower():
            print(f"Already assigned: {MI_NAME} has role '{a.get('role')}' on 'Deal Room'. Nothing to do.")
            return 0

    body = {"principal": {"id": MI_PRINCIPAL_ID, "type": "ServicePrincipal"}, "role": ROLE}
    r = requests.post(f"{BASE}/workspaces/{WORKSPACE_ID}/roleAssignments", headers=h, json=body, timeout=30)
    if r.status_code in (200, 201):
        print(f"SUCCESS: granted {MI_NAME} the '{ROLE}' role on the 'Deal Room' workspace.")
        print("The app can now write SEC filings to OneLake and query Fabric SQL live at runtime.")
        return 0

    print(f"FAILED ({r.status_code}): {r.text[:500]}")
    if r.status_code == 400 and "principal" in (r.text or "").lower():
        print("\nIf the principal type is rejected, the managed identity may need to be added via the")
        print("Fabric portal instead (Manage access -> Add people or groups -> search 'id-dealroom-dev-swc').")
    return 1


if __name__ == "__main__":
    sys.exit(main())
