import { useEffect, useState } from 'react';
import type { AnalystResearch, ResearchCompany, ResearchView, CompanyResearch } from '../types';
import { api } from '../api';
import { timeAgo } from './Bits';

interface Props {
  onBack: () => void;
}

const OUTLOOK_META: Record<string, { label: string; color: string; tint: string }> = {
  positive: { label: 'Positive', color: '#0d9488', tint: 'var(--positive-tint)' },
  neutral: { label: 'Neutral', color: '#64748b', tint: 'var(--canvas-2)' },
  caution: { label: 'Caution', color: '#b45309', tint: 'var(--amber-tint)' }
};

const KIND_META: Record<string, { label: string; color: string }> = {
  'sell-side': { label: 'Sell-side', color: '#6d28d9' },
  independent: { label: 'Independent', color: '#0369a1' },
  expert: { label: 'Expert call', color: '#0f766e' }
};

export function AnalystReports({ onBack }: Props) {
  const [data, setData] = useState<AnalystResearch | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.research().then((d) => {
      setData(d);
      if (d.companies[0]) setExpanded(d.companies[0].id);
    });
  }, []);

  if (!data) {
    return (
      <div className="loading" style={{ height: 'calc(100vh - 60px)' }}>
        <div><div className="spin" /><div>Loading analyst research…</div></div>
      </div>
    );
  }

  return (
    <div className="research-page">
      <div className="desk-head">
        <button className="back-btn" onClick={onBack}>← Back to Deal Sourcing</button>
        <div className="desk-titles">
          <div className="sig-eyebrow">O1 · Deal Sourcing · Analyst Reports</div>
          <h2 className="sig-title">Thesis context — is this a good business in a good market?</h2>
        </div>
        <div className="sig-sub">
          Third-party, already-interpreted research <b>attached to each discovered company</b> —
          sector outlook, competitive rank and sell-side view. Sources: <b>Analyst reports (GS / MS)</b>,
          FactSet, Capital IQ.
        </div>
      </div>

      <div className="research-list">
        {data.companies.map((c) => (
          <ResearchCard key={c.id} c={c} open={expanded === c.id} onToggle={() => setExpanded(expanded === c.id ? null : c.id)} />
        ))}
      </div>
    </div>
  );
}

function ResearchCard({ c, open, onToggle }: { c: ResearchCompany; open: boolean; onToggle: () => void }) {
  const r = c.research;
  const outlook = OUTLOOK_META[r.sector.outlook];
  return (
    <div className={`research-card ${open ? 'open' : ''}`}>
      <button className="rc-hd" onClick={onToggle}>
        <span className="rc-caret">{open ? '▾' : '▸'}</span>
        <div className="rc-main">
          <div className="rc-name">
            {c.name}
            {c.justDiscovered && <span className="new-badge">✦ new</span>}
            <span className={`coverage-tag ${r.coverage}`}>{r.coverage === 'direct' ? 'Direct coverage' : 'Read-across'}</span>
          </div>
          <div className="rc-meta">{c.sector} · {c.region} · ${c.dealSize}M · {c.ownership}</div>
        </div>
        <span className="rc-outlook" style={{ background: outlook.tint, color: outlook.color }}>Sector · {outlook.label}</span>
      </button>

      {open && <ResearchDetail r={r} />}
    </div>
  );
}

// The analyst-research body (sector outlook · competitive rank · sell-side view).
// Reused both on the Analyst Reports page and inline under each ranked target.
export function ResearchDetail({ r }: { r: CompanyResearch }) {
  const outlook = OUTLOOK_META[r.sector.outlook];
  return (
    <div className="rc-body">
      <div className="rc-thesis">💡 {r.thesis}</div>

      <div className="rc-grid">
        {/* Sector outlook */}
        <div className="rc-panel">
          <div className="rc-panel-hd"><span className="rc-ic">🌍</span>Sector outlook</div>
          <div className="rc-sector-name">{r.sector.name}</div>
          <div className="rc-stats">
            <span><i>Market</i>{r.sector.market}</span>
            <span><i>Growth</i>{r.sector.growth}</span>
            <span><i>Horizon</i>{r.sector.horizon}</span>
            <span><i>Outlook</i><b style={{ color: outlook.color }}>{outlook.label}</b></span>
          </div>
          <div className="rc-summary">{r.sector.summary}</div>
          <div className="rc-sources">{r.sector.sources.map((s) => <span className="rc-src" key={s}>{s}</span>)}</div>
        </div>

        {/* Competitive rank */}
        <div className="rc-panel">
          <div className="rc-panel-hd"><span className="rc-ic">🏆</span>Competitive rank</div>
          <div className="rc-rank">
            <span className="rc-rank-badge">#{r.competitive.rank}</span>
            <span className="rc-rank-of">of {r.competitive.of}</span>
            <span className="rc-rank-label">{r.competitive.label}</span>
          </div>
          <div className="rc-moat"><b>Moat:</b> {r.competitive.moat}</div>
          <div className="rc-peers">
            {r.competitive.peers.map((p) => (
              <div className="rc-peer" key={p.name}>
                <span className={`peer-dot ${p.listed ? 'listed' : 'private'}`} />
                <span className="rc-peer-name">{p.name}</span>
                <span className="rc-peer-note">{p.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sell-side / expert views */}
      <div className="rc-panel wide">
        <div className="rc-panel-hd"><span className="rc-ic">📑</span>Sell-side &amp; expert view</div>
        <div className="rc-views">
          {r.views.map((v, i) => <ViewRow key={i} v={v} />)}
        </div>
        {r.coverage === 'read-across' && (
          <div className="rc-note">Private target — no direct equity research; context is read-across from listed comps, sector research and expert-network calls.</div>
        )}
      </div>
    </div>
  );
}

function ViewRow({ v }: { v: ResearchView }) {
  const k = KIND_META[v.kind];
  return (
    <div className="view-row">
      <div className="view-top">
        <span className="view-firm">{v.firm}</span>
        <span className="view-kind" style={{ background: k.color }}>{k.label}</span>
        {v.rating && <span className="view-rating">{v.rating}</span>}
        <span className="view-when">{timeAgo(v.when)}</span>
      </div>
      <div className="view-text">{v.view}</div>
      {v.valuation && <div className="view-val">📊 {v.valuation}</div>}
    </div>
  );
}
