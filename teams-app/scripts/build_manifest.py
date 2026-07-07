#!/usr/bin/env python3
"""Build a sideloadable Teams app package (tab-only) for The Deal Room.

Generates manifest.json + color.png + outline.png and zips them so the channel
tab can be uploaded to a team without needing an Azure Bot or SSO app first.
Bot notifications and the Copilot declarative agent are added later (they need
their own registrations); this package is the fastest path to a channel tab.

Usage:
  python3 scripts/build_manifest.py --host <teams-app-fqdn>
"""
import argparse
import json
import os
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


def build(host: str, sso_client_id=None) -> None:
    os.makedirs(OUT, exist_ok=True)
    base = f"https://{host}"
    # Stable app id derived from the host (idempotent rebuilds).
    app_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{base}/deal-room-teams"))

    manifest = {
        "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        "manifestVersion": "1.19",
        "version": "0.1.0",
        "id": app_id,
        "developer": {
            "name": "Private Markets Deal Room",
            "websiteUrl": base,
            "privacyUrl": f"{base}/privacy",
            "termsOfUseUrl": f"{base}/terms",
        },
        "name": {"short": "Deal Room", "full": "The Deal Room"},
        "description": {
            "short": "AI-native private-equity deal flow in Teams.",
            "full": "A Teams channel dashboard for The Deal Room, backed by the shared Deal Room backend (single data source).",
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

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(OUT, "color.png"), "wb") as f:
        f.write(_png(192, 192, color_icon))
    with open(os.path.join(OUT, "outline.png"), "wb") as f:
        f.write(_png(32, 32, outline_icon))

    zip_path = os.path.join(OUT, "deal-room-teams.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for name in ("manifest.json", "color.png", "outline.png"):
            z.write(os.path.join(OUT, name), name)

    print(f"app id : {app_id}")
    print(f"host   : {host}")
    print(f"package: {zip_path}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True, help="Teams app FQDN (no scheme), e.g. ca-dealhub-teams-...azurecontainerapps.io")
    p.add_argument("--sso-client-id", default=None, help="Entra SSO app (client) id to emit webApplicationInfo for per-user SSO.")
    args = p.parse_args()
    build(args.host, args.sso_client_id)
