"""Provision the standalone Bing-grounded news-scout agent in Foundry Agent Service.

Creates (or updates) a prompt agent on proj-dealroom-dev that uses Grounding with
Bing Search to find real, recent M&A catalysts about mid-market European companies
matching the fund mandate, and returns STRICT JSON the Deal Room can ingest.

NOTE: gpt-4o is retired in this environment (mid-2026) and cannot be deployed, so
the agent uses gpt-5-mini (closest live mid-tier, tool-capable model).

Run:  python scripts/create_news_agent.py
Prints the agent id; also writes it to scripts/news-agent.env for the app to read.
"""
import os
from azure.identity import AzureCliCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    PromptAgentDefinition,
    BingGroundingTool,
    BingGroundingSearchToolParameters,
    BingGroundingSearchConfiguration,
)

ENDPOINT = os.environ.get(
    "FOUNDRY_PROJECT_ENDPOINT",
    "https://aif-dealroom-dev-7j3ok.services.ai.azure.com/api/projects/proj-dealroom-dev",
)
BING_CONNECTION_ID = os.environ.get(
    "BING_PROJECT_CONNECTION_ID",
    "/subscriptions/bf278d8a-49ed-4d34-bae7-3ba55e9c8183/resourceGroups/rg-dealroom-dev-swc/"
    "providers/Microsoft.CognitiveServices/accounts/aif-dealroom-dev-7j3ok/projects/"
    "proj-dealroom-dev/connections/bing-dealroom-conn",
)
MODEL = os.environ.get("NEWS_AGENT_MODEL", "gpt-5-mini")
AGENT_NAME = "deal-room-news-scout"

INSTRUCTIONS = """You are the Deal Room News Scout — a sourcing analyst for a European mid-market
private-equity fund. Given a fund mandate (permitted sectors, geographies, enterprise-value band)
and optional focus themes, use Grounding with Bing Search to find REAL, RECENT public catalysts
about actual companies that could become buyout or structured-minority targets.

Focus on these catalyst types: ownership/succession, sponsor-exit clock, strategic review/carve-out,
distress, leadership change, capital event, regulatory/macro tailwind.

Process (follow exactly):
1. ALWAYS call the Bing search tool at least twice with different queries before answering.
2. From what you actually retrieved, select the best 3-6 real companies that plausibly fit the
   mandate's sectors and geographies. Mandate fit is best-effort, not a hard filter — prefer
   founder/family-owned or sponsor-held mid-market businesses in the permitted sectors/regions.
3. If the enterprise value isn't stated in a source, put your best estimate (or null) in dealSize —
   do NOT drop a good, grounded company just because EV is uncertain.
4. Ground every company in at least one real source you retrieved via Bing. Never invent a company,
   a headline, or a URL. Only return [] if Bing genuinely surfaced nothing usable.

Respond with STRICT JSON ONLY — no prose, no markdown fences — an array of up to 6 objects, each:
{
  "name": "<company legal/common name>",
  "sector": "<one of the permitted sectors, best fit>",
  "region": "<one of the permitted geographies>",
  "country": "<country>",
  "hq": "<city, country>",
  "ownership": "founder|family|sponsor|public|unknown",
  "dealSize": <approx enterprise value in EUR millions as integer, or null if unknown>,
  "catalyst": "ownership|sponsor-exit|strategic-review|distress|leadership|capital|regulatory",
  "why": "<= 20 word why-now",
  "findings": [
    { "headline": "<real headline>", "detail": "<1-2 sentence specifics>",
      "url": "<real source URL>", "source": "<publisher>", "when": "<ISO date or YYYY-MM>" }
  ]
}"""


def main() -> None:
    cred = AzureCliCredential()
    project = AIProjectClient(endpoint=ENDPOINT, credential=cred)

    tool = BingGroundingTool(
        bing_grounding=BingGroundingSearchToolParameters(
            search_configurations=[
                BingGroundingSearchConfiguration(
                    project_connection_id=BING_CONNECTION_ID,
                    count=10,
                    market="en-GB",
                )
            ]
        )
    )

    definition = PromptAgentDefinition(
        model=MODEL,
        instructions=INSTRUCTIONS,
        tools=[tool],
    )

    # create_version is create-or-new-version, idempotent by agent name.
    agent = project.agents.create_version(agent_name=AGENT_NAME, definition=definition)
    version = getattr(agent, "version", None)
    print(f"provisioned agent: name={AGENT_NAME} version={version} (model={MODEL})")

    out = os.path.join(os.path.dirname(__file__), "news-agent.env")
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"NEWS_AGENT_NAME={AGENT_NAME}\n")
        f.write(f"NEWS_AGENT_VERSION={version}\n")
        f.write(f"FOUNDRY_PROJECT_ENDPOINT={ENDPOINT}\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
