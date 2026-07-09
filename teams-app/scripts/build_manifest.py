#!/usr/bin/env python3
"""Build a sideloadable Teams app package for The Deal Room.

Generates manifest.json + color.png + outline.png and zips them. Flags layer on
the optional surfaces once their registrations exist:
  --sso-client-id  adds webApplicationInfo (Entra SSO for the tab)
  --bot-id         adds a conversational bot (@mention it in a channel; it also
                   posts proactive Adaptive Card alerts)
  --copilot        bundles the M365 Copilot declarative agent (reads deals via
                   the Entra-secured MCP) and emits copilotAgents
  --oauth-ref-id   fills the Teams Developer Portal OAuth registration id into
                   the bundled apiPlugin.json

Usage (full package):
  python3 scripts/build_manifest.py --host <fqdn> \
    --sso-client-id <id> --bot-id <id> --copilot [--oauth-ref-id <id>]
"""
import argparse
import json
import os
import shutil
import struct
import uuid
import zipfile
import zlib

HERE = os.path.dirname(__file__)
OUT = os.path.abspath(os.path.join(HERE, "..", "package"))

ACCENT = (98, 100, 167, 255)  # #6264A7
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def _png(width, height, rgba):
    def chunk(typ, data):
        body = typ + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        for x in range(width):
            raw += bytes(rgba(x, y))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def color_icon(x, y):
    cx, cy, r = 96, 96, 52
    return WHITE if (x - cx) ** 2 + (y - cy) ** 2 < r * r else ACCENT


def outline_icon(x, y):
    return WHITE if (x < 2 or x >= 30 or y < 2 or y >= 30) else CLEAR


def build(host: str, sso_client_id=None, bot_id=None, copilot=False, oauth_ref_id=None) -> None:
    os.makedirs(OUT, exist_ok=True)
    base = f"https://{host}"
    # Stable app id derived from the host (idempotent rebuilds).
    app_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{base}/deal-room-teams"))

    manifest = {
        "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        "manifestVersion": "1.19",
        "version": "0.2.2",
        "id": app_id,
        "developer": {
            "name": "Private Markets Deal Room",
            "websiteUrl": base,
            "privacyUrl": f"{base}/privacy",
            "termsOfUseUrl": f"{base}/terms",
        },
        "name": {"short": "Deal Room Assistant", "full": "Deal Room Assistant"},
        "description": {
            "short": "AI-native private-equity deal flow in Teams.",
            "full": "Deal Dashboard brings your fund's live deal flow into Teams: a channel dashboard and personal tab (Entra SSO) over the shared Deal Room backend (single data source), proactive Adaptive Card alerts as deals advance, and an M365 Copilot agent that answers deal questions through the Entra-secured MCP. The deal chat is grounded in live data and screened by Azure AI Content Safety; a Bing-grounded news scout surfaces fresh M&A catalysts.",
        },
        "icons": {"color": "color.png", "outline": "outline.png"},
        "accentColor": "#6264A7",
        "configurableTabs": [
            {
                "configurationUrl": f"{base}/config",
                "canUpdateConfiguration": True,
                "scopes": ["team", "groupChat"],
                "context": ["channelTab"],
            }
        ],
        "staticTabs": [
            {"entityId": "dealroom-home", "name": "Deal Room", "contentUrl": f"{base}/", "scopes": ["personal"]}
        ],
        "permissions": ["identity"],
        "validDomains": [host],
    }

    if sso_client_id:
        manifest["webApplicationInfo"] = {
            "id": sso_client_id,
            "resource": f"api://{host}/{sso_client_id}",
        }

    # Conversational bot — users @mention it in a deal channel and it answers,
    # grounded in that channel's deal (it also posts proactive Adaptive Cards).
    if bot_id:
        manifest["bots"] = [
            {
                "botId": bot_id,
                "scopes": ["team", "groupChat", "personal"],
                "supportsFiles": False,
                "isNotificationOnly": False,
            }
        ]

    # M365 Copilot declarative agent (reads deals via the Entra-secured /mcp).
    if copilot:
        manifest["copilotAgents"] = {
            "declarativeAgents": [{"id": "dealRoomAnalyst", "file": "declarativeAgent.json"}]
        }

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(OUT, "color.png"), "wb") as f:
        f.write(_png(192, 192, color_icon))
    with open(os.path.join(OUT, "outline.png"), "wb") as f:
        f.write(_png(32, 32, outline_icon))

    files_to_zip = ["manifest.json", "color.png", "outline.png"]
    if copilot:
        src_dir = os.path.join(HERE, "..", "declarative-agent")
        shutil.copy(os.path.join(src_dir, "declarativeAgent.json"), os.path.join(OUT, "declarativeAgent.json"))
        shutil.copy(os.path.join(src_dir, "deal-mcp-openapi.yaml"), os.path.join(OUT, "deal-mcp-openapi.yaml"))
        with open(os.path.join(src_dir, "apiPlugin.json"), "r", encoding="utf-8") as f:
            plugin = f.read()
        if oauth_ref_id:
            plugin = plugin.replace("<OAUTH_REGISTRATION_ID>", oauth_ref_id)
        with open(os.path.join(OUT, "apiPlugin.json"), "w", encoding="utf-8") as f:
            f.write(plugin)
        files_to_zip += ["declarativeAgent.json", "apiPlugin.json", "deal-mcp-openapi.yaml"]

    zip_path = os.path.join(OUT, "deal-room-teams.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for name in files_to_zip:
            z.write(os.path.join(OUT, name), name)

    print(f"app id : {app_id}")
    print(f"host   : {host}")
    print(f"package: {zip_path}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True, help="Teams app FQDN (no scheme), e.g. ca-dealhub-teams-...azurecontainerapps.io")
    p.add_argument("--sso-client-id", default=None, help="Entra SSO app (client) id to emit webApplicationInfo for per-user SSO.")
    p.add_argument("--bot-id", default=None, help="Azure Bot app id to emit the bots block for Adaptive Card notifications.")
    p.add_argument("--copilot", action="store_true", help="Bundle the M365 Copilot declarative agent + emit copilotAgents.")
    p.add_argument("--oauth-ref-id", default=None, help="Teams Developer Portal OAuth registration id to fill into apiPlugin.json.")
    args = p.parse_args()
    build(args.host, args.sso_client_id, args.bot_id, args.copilot, args.oauth_ref_id)
