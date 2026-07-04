import { useState } from 'react';
import type { AppConfig, PipelineFunnel, DealSummary } from '../types';
import { CHANGELOG } from '../changelog';
import { ConnectivityPanel } from './ConnectivityPanel';

interface Props {
  config: AppConfig;
  pipeline: PipelineFunnel | null;
  deals: DealSummary[];
  onNavigate: (viewKey: string) => void;
  onGoToDeal: (id: string, stepKey: string) => void;
  onOpenPipeline: (stage?: string) => void;
}

const STEP_TITLES: Record<string, string> = {
  D1: 'Launch Orchestration',
  D2: 'Diligence',
  D3: 'Synthesis',
  D4: 'Approval & Execution',
  D5: 'Archive'
};

// The landing page — a command centre that ties the two stages together so a
// refresh drops you here (not into whatever step the first deal happens to be
// on). Stage 1 is the sourcing funnel; Stage 2 is the deals in flight.
export function Home({ config, pipeline, deals, onNavigate, onGoToDeal, onOpenPipeline }: Props) {
  const diligence = deals.filter((d) => d.stageId === 'diligence');
  const live = diligence.filter((d) => d.stage !== 'D5');
  const counts = pipeline?.counts;
  const sourced = pipeline?.funnel[0]?.count ?? 0;
  const gateReady = pipeline?.funnel[pipeline.funnel.length - 1]?.count ?? 0;
  const activeInFunnel = counts?.active ?? 0;
  const passedParked = (counts?.passed ?? 0) + (counts?.parked ?? 0);
  const nearest = live
    .filter((d) => d.daysToIC > 0)
    .reduce((m, d) => (m == null || d.daysToIC < m ? d.daysToIC : m), null as number | null);

  const dSteps = [
    { key: 'D1', label: 'Launch' },
    { key: 'D2', label: 'Diligence' },
    { key: 'D3', label: 'Synthesis' },
    { key: 'D4', label: 'Approval' },
    { key: 'D5', label: 'Archive' }
  ];
  const countFor = (k: string) => diligence.filter((d) => d.stage === k).length;
  const upNext = live
    .filter((d) => d.daysToIC > 0)
    .sort((a, b) => a.daysToIC - b.daysToIC)
    .slice(0, 3);

  return (
    <div className="home">
      {/* Hero */}
      <div className="home-hero">
        <div className="hh-left">
          <div className="hh-logo">DR</div>
          <div>
            <h1>The Deal Room</h1>
            <p>{pipeline?.fundName ?? 'Private-markets deal flow'} · {pipeline?.fundStrategy ?? 'AI-native origination to IC'}</p>
          </div>
        </div>
        <div className={`hh-mode ${config.mode}`}>
          <span className="dot" />
          {config.mode === 'live' ? <span><b>Live AI</b> · {config.model}</span> : <span><b>Demo mode</b> · seeded AI</span>}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="home-kpis">
        <Kpi v={sourced} l="Sourced" s="candidates in pipeline" />
        <Kpi v={activeInFunnel} l="Active in funnel" s="awaiting a decision" accent="blue" />
        <Kpi v={gateReady} l="Gate-ready" s="pursued to date" accent="violet" />
        <Kpi v={passedParked} l="Passed / parked" s="killed or watchlisted" accent="red" />
        <Kpi v={live.length} l="In diligence" s="active deals" accent="green" />
        <Kpi v={nearest == null ? '—' : `${nearest}d`} l="Nearest IC" s="days to committee" accent={nearest != null && nearest <= 7 ? 'red' : undefined} />
      </div>

      {/* Two-stage cards */}
      <div className="home-cards">
        <div className="home-card">
          <div className="hc-head">
            <div>
              <span className="hc-tag stage1">Stage 1</span>
              <h3>Origination funnel</h3>
            </div>
            <button className="hc-cta" onClick={() => onOpenPipeline()}>View pipeline →</button>
          </div>
          <p className="hc-sub">Sourced → screened → triaged → gate. Click a stage to open the pipeline filtered to it.</p>
          <div className="hc-funnel">
            {(pipeline?.funnel ?? []).map((f, i) => (
              <div className="hcf-wrap" key={f.key}>
                <button className={`hcf-stage clickable ${f.key.toLowerCase()}`} onClick={() => onOpenPipeline(f.key)}>
                  <div className="hcf-count">{f.count}</div>
                  <div className="hcf-label">{f.label}</div>
                  <div className="hcf-step">{f.key} · {f.step}</div>
                </button>
                {i < (pipeline?.funnel.length ?? 0) - 1 && <span className="hcf-arrow">›</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="home-card">
          <div className="hc-head">
            <div>
              <span className="hc-tag stage2">Stage 2</span>
              <h3>Deals in diligence</h3>
            </div>
            <button className="hc-cta" onClick={() => onNavigate('READY')}>View all deals ready →</button>
          </div>
          <p className="hc-sub">Deals that cleared the gate, by where they sit in the diligence-to-IC flow.</p>
          <div className="hc-dist">
            {dSteps.map((s) => (
              <div className="hcd-stage" key={s.key}>
                <div className="hcd-count">{countFor(s.key)}</div>
                <div className="hcd-label">{s.label}</div>
                <div className="hcd-step">{s.key}</div>
              </div>
            ))}
          </div>

          <div className="hc-upnext">
            <div className="hc-upnext-hd">Up next · nearest to IC</div>
            {upNext.map((d) => (
              <button key={d.id} className="upnext-row" onClick={() => onGoToDeal(d.id, d.stage)}>
                <span className={`rr-badge d${d.stageStepNumber}`}>D{d.stageStepNumber}</span>
                <span className="un-co">{d.company}</span>
                <span className="un-meta">{d.currency} {d.dealSize}M · {STEP_TITLES[d.stage] ?? d.stageName}</span>
                <span className={`un-days ${d.daysToIC <= 7 ? 'warn' : ''}`}>{d.daysToIC}d</span>
                <span className="un-go">→</span>
              </button>
            ))}
            {upNext.length === 0 && <div className="finding empty">No active deals approaching IC.</div>}
          </div>
        </div>
      </div>

      {/* Quick start */}
      <div className="home-quick">
        <span className="hq-label">Jump in</span>
        <button className="hq-btn" onClick={() => onNavigate('O1')}>🔍 Source new deals</button>
        <button className="hq-btn" onClick={() => onNavigate('READY')}>📋 Deals ready</button>
        {upNext[0] && (
          <button className="hq-btn primary" onClick={() => onGoToDeal(upNext[0].id, upNext[0].stage)}>
            ▶ Resume {upNext[0].company}
          </button>
        )}
      </div>

      {/* Data-source connectivity */}
      <ConnectivityPanel />

      {/* Release history — collapsed by default */}
      <Changelog />
    </div>
  );
}

function Changelog() {
  const [open, setOpen] = useState(false);
  const latest = CHANGELOG[0];
  return (
    <div className={`changelog ${open ? 'open' : ''}`}>
      <button className="cl-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cl-caret">{open ? '▾' : '▸'}</span>
        <span className="cl-toggle-t">Changelog</span>
        <span className="cl-toggle-s">{CHANGELOG.length} releases · latest {latest.version}</span>
        <span className="cl-toggle-x">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="cl-body">
          {CHANGELOG.map((e) => (
            <div className="cl-entry" key={e.version}>
              <div className="cl-rail"><span className="cl-node" /></div>
              <div className="cl-content">
                <div className="cl-head">
                  <span className="cl-ver">{e.version}</span>
                  <span className={`cl-tag ${e.tag}`}>{e.tag}</span>
                  <span className="cl-title">{e.title}</span>
                  <span className="cl-date">{e.date}</span>
                </div>
                <ul className="cl-highlights">
                  {e.highlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
                <div className="cl-meta">
                  <span className="cl-chip">📦 {e.image}</span>
                  <span className="cl-chip">⟳ {e.revision}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ v, l, s, accent }: { v: string | number; l: string; s: string; accent?: string }) {
  return (
    <div className="kpi-tile">
      <div className={`kpi-v ${accent ?? ''}`}>{v}</div>
      <div className="kpi-l">{l}</div>
      <div className="kpi-s">{s}</div>
    </div>
  );
}
