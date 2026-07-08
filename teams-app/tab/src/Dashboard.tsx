import type { Analytics, Pipeline, Deal, MarketIntel, BackendConfig } from './types';

function money(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n)}`;
}

export default function Dashboard({ analytics, pipeline, deals, market, config, agentCount, onAsk }: {
  analytics: Analytics | null; pipeline: Pipeline | null; deals: Deal[]; market: MarketIntel | null;
  config: BackendConfig | null; agentCount: number; onAsk: (dealId: string) => void;
}) {
  const fabric = config?.fabric || market?.info;
  const comps = market?.comparableDeals || [];
  const precedents = market?.icPrecedents || [];
  const benchmarks = market?.benchmarkFindings || [];

  const kpis = [
    { label: 'Live deals', value: String(analytics?.deals ?? deals.length ?? 0), sub: `${analytics?.inDiligence ?? 0} in diligence` },
    { label: 'Avg IC readiness', value: `${analytics?.avgReadiness ?? 0}%`, sub: `${analytics?.cycleReductionPct ?? 0}% cycle cut` },
    { label: 'Fabric market intel', value: fabric?.mode === 'live' ? 'Live' : (fabric?.mode || '—'), sub: `${comps.length} comps · ${precedents.length} IC precedents` },
    { label: 'Deal-flow agents', value: String(agentCount), sub: config?.newsAgent === 'live' ? 'news scout live' : 'agents ready' },
  ];

  return (
    <div className="dash">
      {/* KPI row */}
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <div className="kpi-v">{k.value}</div>
            <div className="kpi-l">{k.label}</div>
            <div className="kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Origination funnel */}
      {pipeline?.funnel?.length ? (
        <section className="panel">
          <div className="panel-h"><span>Origination funnel</span><span className="muted">{pipeline.fundName}</span></div>
          <div className="funnel">
            {pipeline.funnel.map((f) => (
              <div key={f.key} className="fstep">
                <div className="fcount">{f.count}</div>
                <div className="flabel">{f.label}</div>
                <div className="fkey">{f.key}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Deals */}
      <section className="panel">
        <div className="panel-h"><span>Pipeline deals</span><span className="muted">{deals.length} active</span></div>
        {deals.length === 0 ? (
          <div className="empty-panel">
            No deals are live yet. Sourced candidates that clear the screening gate appear here.
            <button className="linkbtn" onClick={() => onAsk('')}>Ask an agent what to source next →</button>
          </div>
        ) : (
          <div className="deals">
            {deals.map((d) => (
              <div key={d.id} className="dealcard">
                <div className="dc-top">
                  <div className="dc-co">{d.company}</div>
                  <div className="dc-size">{money(d.dealSize ? d.dealSize * 1e6 : undefined)}</div>
                </div>
                <div className="dc-meta">{d.sector || '—'} · {d.stageName || d.stage || '—'}{d.status ? ` · ${d.status}` : ''}</div>
                <div className="dc-bar"><span style={{ width: `${Math.max(0, Math.min(100, d.readiness ?? 0))}%` }} /></div>
                <div className="dc-foot">
                  <span className="muted">IC readiness {d.readiness ?? 0}%{typeof d.daysToIC === 'number' ? ` · IC in ${d.daysToIC}d` : ''}</span>
                  <button className="askbtn" onClick={() => onAsk(d.id)}>Ask ▸</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Market intelligence — live Fabric */}
      <section className="panel">
        <div className="panel-h">
          <span>Market intelligence</span>
          <span className="muted">{fabric?.source ? `${fabric.source}${fabric?.freshness?.label ? ` · ${fabric.freshness.label}` : ''}` : 'Microsoft Fabric / OneLake'}</span>
        </div>
        <div className="mi">
          <div className="mi-col">
            <div className="mi-h">Comparable deals</div>
            {comps.length ? comps.slice(0, 6).map((c, i) => (
              <div key={i} className="mi-row">
                <span className="mi-name">{c.company}{c.ticker ? ` (${c.ticker})` : ''}</span>
                <span className="mi-val">{c.dealType || '—'} · {money(c.impliedValuation)}</span>
                {c.status ? <span className={`pill ${String(c.status).toLowerCase().replace(/\s+/g, '-')}`}>{c.status}</span> : null}
              </div>
            )) : <div className="muted">No comparables loaded.</div>}
          </div>
          <div className="mi-col">
            <div className="mi-h">IC voting precedents</div>
            {precedents.length ? precedents.slice(0, 6).map((p, i) => (
              <div key={i} className="mi-row">
                <span className="mi-name">{p.deal}</span>
                <span className="mi-val">{p.decision} · {(p.votesFor ?? 0)}–{(p.votesAgainst ?? 0)}{typeof p.votesAbstain === 'number' ? `–${p.votesAbstain}` : ''}</span>
              </div>
            )) : <div className="muted">No precedents loaded.</div>}
            {benchmarks.length ? (
              <div className="mi-bench">
                <div className="mi-h" style={{ marginTop: 10 }}>Benchmark findings</div>
                <div className="chips">{benchmarks.map((b) => (<span key={b.workstream} className="chip">{b.workstream} · {b.total}</span>))}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
