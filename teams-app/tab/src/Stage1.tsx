import { useEffect, useState } from 'react';

// Native Stage 1 — Origination & Screening. Brings the webapp's sourcing funnel
// and candidate pipeline into the tab, reading the shared backend:
//   /api/stage1/funnel, /api/stage1/pipeline, /api/stage1/pass-reasons,
//   POST /api/candidates/:id/{screen|triage|gate}, /api/candidates/:id/assess.
// Screen (O2), Triage (O3) and Gate (O4) decisions move a candidate along the
// funnel; a PURSUE at the gate creates a Stage-2 deal (parent refreshes deals).

type Assessment = { action?: string; rationale?: string; confidence?: number; agent?: string; source?: string };
type Candidate = {
  id: string; company: string; sector?: string; subSector?: string; region?: string; country?: string;
  dealSize?: number; ownership?: string; score?: number; band?: string;
  stage?: string; disposition?: string; passReasonLabel?: string | null; passStage?: string | null;
  matchedScreen?: { id: string; name: string } | null; keywords?: string[]; sources?: string[];
  assessment?: Assessment | null;
};
type FunnelStage = { key: string; step?: string; label?: string; count?: number; active?: boolean };
type Funnel = { fundName?: string; fundStrategy?: string; discovered?: number; funnel?: FunnelStage[]; counts?: Record<string, number> };
type Pipeline = { fundName?: string; funnel?: FunnelStage[]; candidates?: Candidate[] };

const BAND_CLASS: Record<string, string> = { strong: 'ok', moderate: 'warn', weak: 'bad', excluded: 'bad' };
const STAGE_LABEL: Record<string, string> = { O1: 'Sourced', O2: 'Screen', O3: 'Prioritize', O4: 'Gate', pursued: 'Pursued' };

// Per-stage decision endpoints + actions.
const STAGE_ACTIONS: Record<string, { endpoint: string; actions: { k: string; label: string; cls: string }[] }> = {
  O2: { endpoint: 'screen', actions: [{ k: 'advance', label: 'Advance →', cls: 'primary' }, { k: 'pass', label: 'Pass', cls: 'ghost' }] },
  O3: { endpoint: 'triage', actions: [{ k: 'advance', label: 'Advance →', cls: 'primary' }, { k: 'park', label: 'Park', cls: '' }, { k: 'pass', label: 'Pass', cls: 'ghost' }] },
  O4: { endpoint: 'gate', actions: [{ k: 'pursue', label: '⚡ Pursue →', cls: 'primary' }, { k: 'park', label: 'Park', cls: '' }, { k: 'pass', label: 'Pass', cls: 'ghost' }] },
};

export default function Stage1({ onChanged, onOpenDeal }: { onChanged: () => void; onOpenDeal: (id: string) => void }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pipe, setPipe] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>('active');
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<string>('');

  async function load() {
    const [f, p] = await Promise.all([
      fetch('/api/stage1/funnel').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/stage1/pipeline').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setFunnel(f); setPipe(p);
  }
  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, []);

  async function decide(cand: Candidate, action: string) {
    const cfg = STAGE_ACTIONS[cand.stage || ''];
    if (!cfg) return;
    setBusy(cand.id + action); setNote('');
    try {
      const r = await fetch(`/api/candidates/${cand.id}/${cfg.endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: `${action} from Deal Dashboard` }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(`Action failed (${r.status}).`); }
      else if (data.deal) { setNote(`${cand.company} pursued — Stage 2 deal created.`); onChanged(); }
      await load();
    } catch (e: any) { setNote(`Action failed (${String(e?.message || e)}).`); }
    finally { setBusy(''); }
  }

  async function reassess(cand: Candidate) {
    setBusy(cand.id + 'assess'); setNote('');
    try {
      await fetch(`/api/candidates/${cand.id}/assess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await load();
    } catch { /* ignore */ } finally { setBusy(''); }
  }

  const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);
  const all = pipe?.candidates || [];
  const candidates = all.filter((c) => {
    if (stageFilter === 'all') return true;
    if (stageFilter === 'active') return c.disposition === 'active';
    if (stageFilter === 'pursued') return c.disposition === 'pursued' || c.stage === 'pursued';
    if (stageFilter === 'passed') return c.disposition === 'passed' || c.disposition === 'parked';
    return c.stage === stageFilter;
  });

  return (
    <div className="stage1">
      <section className="panel">
        <div className="panel-h">Origination & Screening<span className="muted">{funnel?.fundName || 'Fund'} · {funnel?.fundStrategy || ''}</span></div>
        <div className="funnel">
          {(funnel?.funnel || []).map((s) => (
            <button key={s.key} className={`fstep${stageFilter === s.key ? ' on' : ''}`} onClick={() => setStageFilter(s.key === 'O1' ? 'all' : s.key)} title="Filter the pipeline to this stage">
              <div className="fcount">{s.count ?? 0}</div>
              <div className="flabel">{s.label || STAGE_LABEL[s.key] || s.key}</div>
              <div className="fkey">{s.key}{s.step ? ` · ${s.step}` : ''}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          Candidate pipeline
          <select className="scope" style={{ flex: '0 0 auto', maxWidth: 200 }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="active">Active (open)</option>
            <option value="O2">O2 — Screen</option>
            <option value="O3">O3 — Prioritize</option>
            <option value="O4">O4 — Gate</option>
            <option value="pursued">Pursued → Stage 2</option>
            <option value="passed">Passed / Parked</option>
            <option value="all">All</option>
          </select>
        </div>
        {note ? <div className="dd-actionnote" style={{ margin: '10px 16px 0' }}>{note}</div> : null}
        {loading ? (
          <div className="empty-panel">Loading sourcing pipeline…</div>
        ) : !candidates.length ? (
          <div className="empty-panel">No candidates for this filter.</div>
        ) : (
          <div className="cand-list">
            {candidates.map((c) => {
              const cfg = STAGE_ACTIONS[c.stage || ''];
              const pursued = c.disposition === 'pursued' || c.stage === 'pursued';
              const passed = c.disposition === 'passed' || c.disposition === 'parked';
              return (
                <div className="cand" key={c.id}>
                  <div className="cand-main">
                    <div className="cand-top">
                      <span className="cand-co">{c.company}</span>
                      <span className={`pill ${BAND_CLASS[c.band || ''] || ''}`}>{c.score ?? 0} · {c.band || '—'}</span>
                    </div>
                    <div className="cand-meta">{[c.sector, c.region, c.country].filter(Boolean).join(' · ')} · {money(c.dealSize)}{c.ownership ? ` · ${c.ownership}` : ''}</div>
                    <div className="cand-tags">
                      <span className="chip">{STAGE_LABEL[c.stage || ''] || c.stage}</span>
                      {c.matchedScreen ? <span className="chip" title="Matched screen">🎯 {c.matchedScreen.name}</span> : null}
                      {passed && c.passReasonLabel ? <span className="chip" title={`Passed at ${c.passStage || ''}`}>⛔ {c.passReasonLabel}</span> : null}
                      {(c.keywords || []).slice(0, 2).map((k, i) => (<span className="chip" key={i}>{k}</span>))}
                    </div>
                    {c.assessment?.rationale ? (
                      <div className="cand-assess" title={`${c.assessment.agent || 'agent'} · ${c.assessment.source || ''}`}>
                        <b>{(c.assessment.action || '').toUpperCase()}</b> — {c.assessment.rationale}{typeof c.assessment.confidence === 'number' ? ` (${Math.round(c.assessment.confidence * 100)}%)` : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="cand-actions">
                    {pursued ? (
                      <button className="btn primary" onClick={() => onOpenDeal(c.id)}>Open deal →</button>
                    ) : passed ? (
                      <span className="muted">Closed</span>
                    ) : cfg ? (
                      <>
                        {cfg.actions.map((a) => (
                          <button key={a.k} className={`btn ${a.cls}`} disabled={!!busy} onClick={() => decide(c, a.k)}>
                            {busy === c.id + a.k ? '…' : a.label}
                          </button>
                        ))}
                        <button className="btn ghost" disabled={!!busy} title="Re-run the AI assessment" onClick={() => reassess(c)}>{busy === c.id + 'assess' ? '…' : '↻'}</button>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
