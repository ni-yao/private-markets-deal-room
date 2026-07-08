import { useEffect, useState } from 'react';

// Native Deal Workspace (single-deal scope) — brings the webapp's Stages,
// Orchestration and Deal Workspace into the tab. Reads/drives the shared backend:
// /api/deals/:id, /api/flow, launch, steps/:key/run, advance, back, teams/ensure,
// ic-readiness. The all-deals dashboard drills into this per deal.

type KeyFigure = { label: string; value: string; source?: string; confidence?: string };
type Workstream = { lane: string; owner?: string; status?: string; progress?: number; findings?: unknown[] };
type MemoSection = { key: string; title: string; status?: string; content?: string };
type DealFull = {
  id: string; company: string; sector?: string; subSector?: string; hq?: string;
  stage?: string; stageName?: string; status?: string; dealSize?: number;
  readiness?: number; daysToIC?: number; thesis?: string; keyFigures?: KeyFigure[]; workstreams?: Workstream[];
  currentStep?: string; stepNumber?: number; totalSteps?: number; completedSteps?: string[];
  workspaceReady?: boolean; memoSections?: MemoSection[]; artifacts?: Record<string, any>; workspace?: any;
};
type Verdict = { state?: string; headline?: string; gating?: string[] };
type Artifact = { key: string; label: string; complete: boolean; detail?: string };
type ICReadiness = { verdict?: Verdict; requiredArtifacts?: { items?: Artifact[] } };
type Step = { key: string; stage: string };
type Flow = { stages?: { id: string; name: string }[]; steps?: Step[] };

const STEP_LABEL: Record<string, string> = {
  O1: 'Sourcing', O2: 'Screen', O3: 'Prioritize', O4: 'Gate',
  D1: 'Plan', D2: 'Diligence', D3: 'Synthesis', D4: 'IC Approval', D5: 'Archive',
};
const LANE_LABEL: Record<string, string> = {
  commercial: 'Commercial', financial: 'Financial', legal: 'Legal', tax: 'Tax',
  techai: 'Tech / AI', operations: 'Operations', esg: 'ESG',
};
const STATUS_LABEL: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Complete', blocked: 'Blocked' };
const VERDICT_CLASS: Record<string, string> = { READY: 'ok', CONDITIONAL: 'warn', 'NOT-READY': 'bad' };

function sourceHint(src?: string): string {
  if (!src) return '';
  const s = src.toLowerCase();
  if (/10-k|10-q|8-k|sec|edgar|form d/.test(s)) return 'As reported by the company in this SEC filing (as-filed figure, not modeled).';
  if (s.includes('screen')) return 'From the screening model (pre-diligence estimate).';
  if (s.includes('cim')) return 'From the confidential information memorandum.';
  if (s.includes('deriv')) return 'Derived from other figures on the record.';
  return `Source: ${src}.`;
}

type Tab = 'stages' | 'overview' | 'workspace' | 'ic';

export default function DealDetail({ dealId, canViewStage2, onClose, onAsk }: { dealId: string; canViewStage2: boolean; onClose: () => void; onAsk: (id: string) => void }) {
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [ic, setIc] = useState<ICReadiness | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [selStep, setSelStep] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [cfg, setCfg] = useState<any>(null);

  async function load(setSel = false) {
    const [d, i] = await Promise.all([
      fetch(`/api/deals/${dealId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/deals/${dealId}/ic-readiness`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setDeal(d); setIc(i);
    if (setSel && d?.currentStep) setSelStep(d.currentStep);
    return d;
  }

  useEffect(() => {
    setLoading(true); setNote(''); setDeal(null); setIc(null);
    fetch('/api/flow').then((r) => r.json()).then(setFlow).catch(() => {});
    fetch('/api/config').then((r) => r.json()).then(setCfg).catch(() => {});
    load(true).finally(() => setLoading(false));
  }, [dealId]);

  async function act(label: string, url: string, body: unknown = {}) {
    setBusy(label); setNote('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) setNote(`Blocked: ${data?.headline || data?.reason || 'IC gate not satisfied (Partner override required).'}`);
        else setNote(`Action failed (${r.status}).`);
      }
      const d = await load(true);
      if (r.ok && d) setSelStep(d.currentStep || selStep);
    } catch (e: any) {
      setNote(`Action failed (${String(e?.message || e)}).`);
    } finally { setBusy(''); }
  }

  // Create (or open) a Teams channel dedicated to this deal so the team can converse
  // about it. Provisions a per-deal Team + SharePoint data room via the backend.
  async function dealChannel() {
    const url = deal?.workspace?.teamsUrl;
    if (deal?.workspace?.teamsProvisioned && url) { window.open(url, '_blank', 'noopener'); return; }
    if (cfg?.m365 && cfg.m365.connected === false) { setNote('Connect M365 (from the Deal Dashboard) to create a deal channel where the team can converse.'); return; }
    setBusy('channel'); setNote('');
    try {
      const r = await fetch(`/api/deals/${dealId}/teams/ensure`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) setNote('Launch the deal first (Stages → Launch), then create its channel.');
      else if (!r.ok || data.error) setNote(`Could not create the deal channel${data.error ? `: ${data.error}` : ''}.${cfg?.m365?.connected === false ? ' Connect M365 first.' : ''}`);
      else { await load(true); if (data.teamsUrl) window.open(data.teamsUrl, '_blank', 'noopener'); else setNote('Deal channel created.'); }
    } catch (e: any) { setNote(`Could not create the deal channel (${String(e?.message || e)}).`); }
    finally { setBusy(''); }
  }

  const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);
  const steps = flow?.steps || [];
  const curIdx = steps.findIndex((s) => s.key === deal?.currentStep);
  const completed = new Set(deal?.completedSteps || []);
  const viewStep = selStep || deal?.currentStep || '';
  const artifact = deal?.artifacts?.[viewStep];
  const verdict = ic?.verdict;
  const ws = deal?.workspace || {};
  // Stage 2 (Diligence & Approval) is deal-team only. A deal is "in Stage 2"
  // once its stage code is D* or its stage name mentions diligence/approval.
  const inStage2 = /^d/i.test(String(deal?.stage || '')) || /diligence|approval/i.test(String(deal?.stageName || ''));
  const stage2Locked = inStage2 && !canViewStage2;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
          <div className="drawer-title">{deal?.company || 'Loading…'}</div>
          {deal ? <button className="chbtn" onClick={dealChannel} disabled={busy === 'channel'} title="Create or open a Teams channel to converse about this deal">{deal.workspace?.teamsProvisioned ? '# Open channel ↗' : busy === 'channel' ? 'Creating…' : '# Deal channel'}</button> : null}
          <button className="askbtn" onClick={() => onAsk(dealId)}>💬 Ask agents</button>
        </div>

        {loading || !deal ? (
          <div className="drawer-body"><div className="muted">{loading ? 'Loading deal workspace…' : 'Deal not found.'}</div></div>
        ) : (
          <>
            <div className="dd-topmeta">
              <div className="dd-sub">{[deal.sector, deal.subSector, deal.hq].filter(Boolean).join(' · ')}</div>
              <div className="dd-meta">
                <span className="chip">{deal.stageName || deal.stage}</span>
                <span className="chip">Step {deal.stepNumber}/{deal.totalSteps} · {STEP_LABEL[deal.currentStep || ''] || deal.currentStep}</span>
                <span className="chip">{money(deal.dealSize)}</span>
                <span className="chip">IC readiness {deal.readiness ?? 0}%</span>
              </div>
            </div>

            {!stage2Locked && (
            <div className="dd-tabs">
              {(['overview', 'stages', 'workspace', 'ic'] as Tab[]).map((t) => (
                <button key={t} className={`dd-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'stages' ? 'Stages & orchestration' : t === 'overview' ? 'Overview' : t === 'workspace' ? 'Workspace' : 'IC readiness'}
                </button>
              ))}
            </div>
            )}

            <div className="drawer-body">
              {stage2Locked ? (
                <div className="dd-panel" style={{ textAlign: 'center', padding: '28px 18px' }}>
                  <div style={{ fontSize: 26 }}>🔒</div>
                  <div style={{ fontWeight: 700, marginTop: 6 }}>Stage 2 — Diligence &amp; Approval</div>
                  <div className="muted" style={{ marginTop: 6 }}>This deal has entered Stage 2, which is restricted to the deal team. Ask a deal-team member (user1–user4) for access.</div>
                </div>
              ) : (
              <>
              {note ? <div className="dd-actionnote">{note}</div> : null}

              {tab === 'stages' && (
                <>
                  {(flow?.stages || []).map((st) => (
                    <div className="stage-group" key={st.id}>
                      <div className="stage-name">{st.name}</div>
                      <div className="stage-steps">
                        {steps.filter((s) => s.stage === st.id).map((s) => {
                          const done = completed.has(s.key) || (curIdx >= 0 && steps.findIndex((x) => x.key === s.key) < curIdx);
                          const cur = s.key === deal.currentStep;
                          const on = s.key === viewStep;
                          const lockedStep = /^d/i.test(s.key) && !canViewStage2;
                          return (
                            <button key={s.key} className={`fstep-btn${cur ? ' cur' : ''}${done ? ' done' : ''}${on ? ' on' : ''}`} disabled={lockedStep} title={lockedStep ? 'Stage 2 — deal team only' : ''} style={lockedStep ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => { if (!lockedStep) setSelStep(s.key); }}>
                              <span className="fs-key">{lockedStep ? '🔒' : done ? '✓' : s.key}</span>
                              <span className="fs-label">{STEP_LABEL[s.key] || s.key}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="orch-bar">
                    {!deal.workspaceReady ? (
                      canViewStage2 ? (
                      <button className="btn primary" disabled={!!busy} onClick={() => act('launch', `/api/deals/${dealId}/launch`)}>
                        {busy === 'launch' ? 'Launching…' : '▶ Launch diligence (provision workspace)'}
                      </button>
                      ) : (
                        <span className="muted">🔒 Launching diligence (Stage 2) is restricted to the deal team.</span>
                      )
                    ) : (
                      <>
                        <button className="btn" disabled={!!busy} onClick={() => act('run', `/api/deals/${dealId}/steps/${deal.currentStep}/run`)}>
                          {busy === 'run' ? 'Running…' : `⚙ Run ${STEP_LABEL[deal.currentStep || ''] || deal.currentStep}`}
                        </button>
                        <button className="btn primary" disabled={!!busy} onClick={() => act('advance', `/api/deals/${dealId}/advance`)}>
                          {busy === 'advance' ? 'Advancing…' : 'Advance →'}
                        </button>
                        <button className="btn ghost" disabled={!!busy} onClick={() => act('back', `/api/deals/${dealId}/back`)}>← Back</button>
                      </>
                    )}
                  </div>

                  <section className="dd-panel">
                    <div className="dd-panel-h">{STEP_LABEL[viewStep] || viewStep} — deliverable</div>
                    {artifact ? (
                      <div className="artifact-view">
                        <div className="av-kind">{artifact.kind || 'artifact'}</div>
                        {Array.isArray(artifact.workstreams) ? (
                          <ul className="av-list">{artifact.workstreams.map((w: any, i: number) => (<li key={i}><b>{w.label || w.key}</b>{w.adviser ? ` · ${w.adviser}` : ''}</li>))}</ul>
                        ) : Array.isArray(artifact.sections) ? (
                          <ul className="av-list">{artifact.sections.map((s: any, i: number) => (<li key={i}><b>{s.title || s.key}</b> — {s.status}</li>))}</ul>
                        ) : Array.isArray(artifact.findings) ? (
                          <ul className="av-list">{artifact.findings.slice(0, 8).map((f: any, i: number) => (<li key={i}>{f.text || f.title || JSON.stringify(f).slice(0, 100)}</li>))}</ul>
                        ) : (
                          <div className="muted">Deliverable generated. Open the full record for the complete document.</div>
                        )}
                      </div>
                    ) : (
                      <div className="dd-empty-p">No deliverable yet for this step. {viewStep === deal.currentStep && deal.workspaceReady ? 'Run the step to generate it.' : ''}</div>
                    )}
                  </section>
                </>
              )}

              {tab === 'overview' && (
                <>
                  {deal.thesis ? <p className="dd-thesis">{deal.thesis}</p> : null}
                  {deal.keyFigures?.length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">Key figures</div>
                      <div className="dd-figs">
                        {deal.keyFigures.map((f, i) => (
                          <div className="dd-fig" key={i} title={sourceHint(f.source)}>
                            <div className="fig-v">{f.value}</div>
                            <div className="fig-l">{f.label}</div>
                            {f.source ? <div className="fig-src">source: {f.source}{f.confidence ? ` · ${f.confidence} confidence` : ''}</div> : null}
                          </div>
                        ))}
                      </div>
                      <div className="dd-note">Hover a figure for provenance. Figures sourced from an SEC form are the values the company reported in that filing (as-filed, not modeled).</div>
                    </section>
                  ) : null}
                  {deal.workstreams?.length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">Diligence lanes</div>
                      <div className="dd-lanes">
                        {deal.workstreams.map((w, i) => (
                          <div className="dd-lane" key={i}>
                            <div className="lane-top"><span className="lane-name">{LANE_LABEL[w.lane] || w.lane}</span><span className="lane-status">{STATUS_LABEL[w.status || ''] || w.status || '—'}</span></div>
                            <div className="lane-bar"><span style={{ width: `${Math.max(0, Math.min(100, w.progress ?? 0))}%` }} /></div>
                            <div className="lane-owner">{w.owner || 'unassigned'}{w.findings?.length ? ` · ${w.findings.length} finding(s)` : ''}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}

              {tab === 'workspace' && (
                <section className="dd-panel">
                  <div className="dd-panel-h">Deal workspace</div>
                  <div className="ws-grid">
                    <div className="ws-row"><span>Teams channel</span><span>{ws.teamsProvisioned ? <a href={ws.teamsUrl} target="_blank" rel="noreferrer">{ws.teamsChannelName || 'Open ↗'}</a> : 'not provisioned'}</span></div>
                    <div className="ws-row"><span>SharePoint data room</span><span>{ws.sharePointProvisioned ? <a href={ws.sharePointUrlResolved || ws.sharePointUrl} target="_blank" rel="noreferrer">Open ↗</a> : 'not provisioned'}</span></div>
                    <div className="ws-row"><span>IC date</span><span>{ws.icDate ? new Date(ws.icDate).toLocaleDateString() : '—'}</span></div>
                    <div className="ws-row"><span>Provisioned by</span><span>{ws.provisionedBy || '—'}</span></div>
                  </div>
                  {!ws.teamsProvisioned || !ws.sharePointProvisioned ? (
                    <div className="orch-bar">
                      <button className="btn" disabled={!!busy} onClick={() => act('teams', `/api/deals/${dealId}/teams/ensure`)}>
                        {busy === 'teams' ? 'Provisioning…' : '☁ Provision Teams + SharePoint'}
                      </button>
                    </div>
                  ) : null}
                  {Array.isArray(ws.swimlanes) && ws.swimlanes.length ? (
                    <div className="dd-lanes" style={{ padding: '0 14px 14px' }}>
                      {ws.swimlanes.map((s: any, i: number) => (
                        <div className="dd-lane" key={i}>
                          <div className="lane-top"><span className="lane-name">{LANE_LABEL[s.lane] || s.lane}</span><span className="lane-status">{s.md || s.owner || 'unassigned'}</span></div>
                          {s.channelUrl ? <a className="lane-owner" href={s.channelUrl} target="_blank" rel="noreferrer">channel ↗</a> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              {tab === 'ic' && (
                <section className="dd-panel">
                  <div className="dd-panel-h">IC readiness</div>
                  {verdict ? (
                    <div className={`verdict ${VERDICT_CLASS[verdict.state || ''] || ''}`}>
                      <span className="verdict-state">{verdict.state}</span>
                      <span className="verdict-head">{verdict.headline}</span>
                    </div>
                  ) : <div className="dd-empty-p">IC readiness available once diligence is underway.</div>}
                  {(ic?.requiredArtifacts?.items || []).length ? (
                    <div className="dd-artifacts">
                      {ic!.requiredArtifacts!.items!.map((a) => (
                        <div key={a.key} className={`artifact ${a.complete ? 'done' : 'todo'}`}>
                          <span className="a-ic">{a.complete ? '✓' : '○'}</span>
                          <span className="a-label">{a.label}</span>
                          {a.detail ? <span className="a-detail">{a.detail}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              )}
              </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
