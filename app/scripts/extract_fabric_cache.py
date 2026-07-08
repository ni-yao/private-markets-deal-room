"""Materialize the real Fabric/OneLake 'Deal Room' lakehouse into the app datastore.

The fund's market intelligence — comparable & historical deals, benchmark diligence
findings, IC voting precedents, company financials and real SEC filing metrics —
lives in the Microsoft Fabric workspace "Deal Room" (lakehouse deal_room_starter,
capacity dealroomfabric / rg-deal-room-data). This reads that OneLake data through
the lakehouse SQL analytics endpoint and writes a compact, real snapshot into the
app's Cosmos datastore (connectors container, id='fabric-cache'), so the Deal Room
grounds its artifacts and IC cockpit in the real Fabric data today.

When the app's managed identity is granted Viewer on the Fabric workspace, lib/fabric.js
can bind directly to the SQL endpoint for live reads; until then this snapshot is the
materialized projection (a standard OneLake consumption pattern), refreshed by re-running
this extract.

Run:  python scripts/extract_fabric_cache.py
Requires: az login as a Fabric workspace member + Cosmos Data Contributor (user3 has both).
"""
import os, struct, json, datetime
import pyodbc
from azure.identity import AzureCliCredential
from azure.cosmos import CosmosClient

SERVER = os.environ.get("FABRIC_SQL_ENDPOINT",
    "a64b6mf4xwwexabphg3h6kmlnq-vohf2iaot5lu5l5wepkbscocq4.datawarehouse.fabric.microsoft.com")
DB = os.environ.get("FABRIC_SQL_DATABASE", "deal_room_starter")
COSMOS_ENDPOINT = os.environ.get("COSMOS_ENDPOINT", "https://cosmos-dealroom-dev-7j3ok.documents.azure.com:443/")
COSMOS_DATABASE = os.environ.get("COSMOS_DATABASE", "dealroom")

cred = AzureCliCredential()


def sql_conn():
    tok = cred.get_token("https://database.windows.net/.default").token.encode("utf-16-le")
    ts = struct.pack(f"<I{len(tok)}s", len(tok), tok)
    return pyodbc.connect(
        f"Driver={{ODBC Driver 18 for SQL Server}};Server={SERVER};Database={DB};Encrypt=yes;TrustServerCertificate=no",
        attrs_before={1256: ts}, timeout=30)


def rows(cur, q):
    cur.execute(q)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def num(v):
    return None if v is None else (round(float(v)) if isinstance(v, float) else v)


def build_snapshot():
    cn = sql_conn(); cur = cn.cursor()

    companies = [
        {"ticker": r["ticker"], "name": r["name"], "sector": r["sector"], "industry": r["industry"],
         "employees": num(r["employees"]), "marketCap": num(r["market_cap"]), "revenue": num(r["revenue"])}
        for r in rows(cur, "SELECT ticker,name,sector,industry,employees,market_cap,revenue FROM silver.dim_company")
    ]

    comps = [
        {"company": r["company_name"], "ticker": r["ticker"], "dealType": r["deal_type"],
         "dealValue": num(r["deal_value"]), "impliedValuation": num(r["implied_valuation"]),
         "evEbitda": None, "stage": r["stage"], "status": r["status"], "thesis": (r["investment_thesis"] or "")[:240],
         "dealDate": r["deal_date"]}
        for r in rows(cur, "SELECT company_name,ticker,deal_type,deal_value,implied_valuation,stage,status,investment_thesis,deal_date FROM silver.fact_deal ORDER BY deal_date DESC")
    ]

    # Benchmark diligence findings: counts by workstream x risk + a few real samples per workstream.
    fcounts = rows(cur, "SELECT workstream, risk_level, COUNT(*) c FROM bronze.bronze_diligence_findings GROUP BY workstream, risk_level")
    by_ws = {}
    for r in fcounts:
        ws = r["workstream"]; by_ws.setdefault(ws, {"workstream": ws, "total": 0, "byRisk": {}})
        by_ws[ws]["byRisk"][r["risk_level"]] = r["c"]; by_ws[ws]["total"] += r["c"]
    samples = rows(cur, """SELECT workstream, finding_type, description, risk_level, remediation, status, owner, target_resolution
                           FROM bronze.bronze_diligence_findings
                           WHERE risk_level IN ('Critical','High') ORDER BY workstream""")
    ws_samples = {}
    for r in samples:
        ws_samples.setdefault(r["workstream"], [])
        if len(ws_samples[r["workstream"]]) < 3:
            ws_samples[r["workstream"]].append({
                "type": r["finding_type"], "description": (r["description"] or "")[:280], "risk": r["risk_level"],
                "remediation": (r["remediation"] or "")[:200], "status": r["status"], "owner": r["owner"],
                "targetResolution": r["target_resolution"]})
    benchmark_findings = []
    for ws, agg in sorted(by_ws.items()):
        agg["samples"] = ws_samples.get(ws, [])
        benchmark_findings.append(agg)

    ic_precedents = [
        {"deal": r["deal_name"], "decision": r["decision"], "votesFor": num(r["votes_for"]),
         "votesAgainst": num(r["votes_against"]), "votesAbstain": num(r["votes_abstain"]),
         "conditions": [c.strip() for c in (r["conditions"] or "").split("|") if c.strip()],
         "closingStatus": r["closing_conditions_status"], "meetingDate": r["ic_meeting_date"]}
        for r in rows(cur, "SELECT deal_name,decision,votes_for,votes_against,votes_abstain,conditions,closing_conditions_status,ic_meeting_date FROM bronze.bronze_ic_approvals")
    ]

    # Latest real SEC metric per (ticker, metric) — real financials from filings.
    sec = rows(cur, """SELECT ticker, metric, value, unit, form, filed
                       FROM bronze.bronze_sec_filings f
                       WHERE filed = (SELECT MAX(filed) FROM bronze.bronze_sec_filings g WHERE g.ticker=f.ticker AND g.metric=f.metric)""")
    fin_by_ticker = {}
    for r in sec:
        fin_by_ticker.setdefault(r["ticker"], {})
        # keep the largest-magnitude value per metric on the latest filing date (dedupe multi-period rows)
        cur_v = fin_by_ticker[r["ticker"]].get(r["metric"])
        if cur_v is None or abs(num(r["value"]) or 0) > abs(cur_v.get("value") or 0):
            fin_by_ticker[r["ticker"]][r["metric"]] = {"value": num(r["value"]), "unit": r["unit"], "form": r["form"], "filed": r["filed"]}

    cn.close()
    return {
        "source": "fabric:Deal Room/deal_room_starter",
        "sqlEndpoint": SERVER,
        "capacity": "dealroomfabric",
        "extractedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "companies": companies,
        "comparableDeals": comps,
        "benchmarkFindings": benchmark_findings,
        "icPrecedents": ic_precedents,
        "companyFinancials": fin_by_ticker,
        "counts": {"companies": len(companies), "comparableDeals": len(comps),
                   "benchmarkFindingWorkstreams": len(benchmark_findings), "icPrecedents": len(ic_precedents),
                   "secTickers": len(fin_by_ticker)}
    }


def main():
    snap = build_snapshot()
    print("snapshot counts:", json.dumps(snap["counts"]))
    client = CosmosClient(COSMOS_ENDPOINT, credential=cred)
    cont = client.get_database_client(COSMOS_DATABASE).get_container_client("connectors")
    doc = {"id": "fabric-cache", "record": snap, "updatedAt": snap["extractedAt"]}
    cont.upsert_item(doc)
    print("wrote connectors/fabric-cache to Cosmos")


if __name__ == "__main__":
    main()
