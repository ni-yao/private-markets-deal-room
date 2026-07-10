import { useEffect, useState } from 'react';
import { getSsoToken } from './teams';

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

// Deep-dive market research shapes.
type Comp = { company: string; ticker?: string; dealType?: string; impliedValuation?: number; status?: string };
type Precedent = { deal: string; decision?: string; votesFor?: number; votesAgainst?: number; votesAbstain?: number };
type Benchmark = { workstream: string; total: number; byRisk?: Record<string, number>; samples?: { description?: string }[] };
type MarketIntel = { info?: { mode?: string; source?: string | null; freshness?: { label?: string } | null }; comparableDeals?: Comp[]; icPrecedents?: Precedent[]; benchmarkFindings?: Benchmark[] };
type CitationFig = { label: string; value: string; source?: string | null; sourced?: boolean };
type CitationClaim = { section: string; figure: string; sourced?: boolean; via?: string | null };
type Citations = { score?: number; totalClaims?: number; sourcedClaims?: number; unsourcedClaims?: CitationClaim[]; keyFigures?: CitationFig[]; unsourcedFigures?: CitationFig[]; clean?: boolean; summary?: string };

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

// Raw-dollar formatter for market-intel valuations (impliedValuation is in $, not $M).
const bigMoney = (n?: number) => (n == null ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${Math.round(n)}`);

type Tab = 'stages' | 'overview' | 'workspace' | 'research' | 'ic' | 'documents';

export default function DealDetail({ dealId, canViewStage2, onClose, onAsk }: { dealId: string; canViewStage2: boolean; onClose: () => void; onAsk: (id: string) => void }) {
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [ic, setIc] = useState<ICReadiness | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [market, setMarket] = useState<MarketIntel | null>(null);
  const [citations, setCitations] = useState<Citations | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [selStep, setSelStep] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [cfg, setCfg] = useState<any>(null);
  const [docs, setDocs] = useState<{ folderUrl?: string; documents?: any[]; canWrite?: boolean; error?: string; notConnected?: boolean } | null>(null);
  const [docsBusy, setDocsBusy] = useState<string>('');

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

  // Lazily pull the deal's market-research deep dive (Fabric/OneLake comps,
  // IC precedents, benchmark findings) + the source-citation audit.
  useEffect(() => {
    if (tab !== 'research') return;
    if (!market) {
      const sector = encodeURIComponent(String(deal?.sector || ''));
      Promise.all([
        fetch('/api/market-intel').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        sector ? fetch(`/api/market-intel/comps?sector=${sector}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
      ]).then(([mi, comps]) => setMarket({ ...(mi || {}), comparableDeals: (comps && comps.length ? comps : mi?.comparableDeals) || [] }));
    }
    if (!citations) fetch(`/api/deals/${dealId}/citations`).then((r) => (r.ok ? r.json() : null)).then(setCitations).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dealId]);

  // Lazily list the deal's SharePoint data-room documents when the tab opens.
  useEffect(() => {
    if (tab !== 'documents') return;
    setDocs(null);
    fetch(`/api/deals/${dealId}/documents`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); setDocs(r.ok ? d : { error: d?.error || `Failed (${r.status})`, notConnected: !!d?.notConnected }); })
      .catch((e) => setDocs({ error: String(e?.message || e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dealId]);

  // Generate a Word IC memo / Excel model from the live record — as the signed-in
  // user (SSO). 'download' streams a personal working copy; 'sharepoint' publishes
  // into the shared deal data room (write-gated).
  async function genDoc(kind: 'ic-memo' | 'model', dest: 'download' | 'sharepoint') {
    setDocsBusy(`${kind}:${dest}`); setNote('');
    try {
      const sso = await getSsoToken();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (sso) headers['authorization'] = `Bearer ${sso}`;
      const r = await fetch(`/api/deals/${dealId}/documents/${kind}?dest=${dest}`, { method: 'POST', headers, body: '{}' });
      if (dest === 'download') {
        if (!r.ok) { const d = await r.json().catch(() => ({})); setNote(d?.reason || d?.error || 'Could not generate the document.'); return; }
        const blob = await r.blob();
        const cd = r.headers.get('content-disposition') || '';
        const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
        const name = m ? decodeURIComponent(m[1]) : (kind === 'ic-memo' ? 'IC Memo.docx' : 'Deal Model.xlsx');
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(href);
      } else {
        const d = await r.json().catch(() => ({}));
        if (r.ok && d?.document?.webUrl) window.open(d.document.webUrl, '_blank', 'noopener');
        else setNote(d?.reason || d?.error || 'Could not save the document.');
        const lr = await fetch(`/api/deals/${dealId}/documents`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (lr) setDocs(lr);
      }
    } catch (e: any) {
      setNote(`Could not generate the document (${String(e?.message || e)}).`);
    } finally { setDocsBusy(''); }
  }

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

  // Open the deal's SharePoint data room (VDR). If not yet provisioned, provision
  // it on demand (idempotent) via the same ensure endpoint, then open it.
  async function openDataRoom() {
    const ws0 = deal?.workspace || {};
    const url = ws0.sharePointUrlResolved ? ws0.sharePointUrl : ws0.sharePointUrl;
    if (ws0.sharePointProvisioned && url) { window.open(url, '_blank', 'noopener'); return; }
    if (cfg?.m365 && cfg.m365.connected === false) { setNote('Connect M365 (from the Deal Dashboard) to provision the SharePoint data room.'); return; }
    setBusy('dataroom'); setNote('');
    try {
      const r = await fetch(`/api/deals/${dealId}/teams/ensure`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) setNote('Launch the deal first (Stages → Launch), then open its data room.');
      else if (!r.ok || data.error) setNote(`Could not open the SharePoint data room${data.error ? `: ${data.error}` : ''}.`);
      else { const d = await load(true); const u = d?.workspace?.sharePointUrl; if (d?.workspace?.sharePointProvisioned && u) window.open(u, '_blank', 'noopener'); else setNote('SharePoint data room could not be provisioned automatically.'); }
    } catch (e: any) { setNote(`Could not open the data room (${String(e?.message || e)}).`); }
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
          {deal ? <button className="chbtn spo" onClick={openDataRoom} disabled={busy === 'dataroom'} title="Open the deal's SharePoint data room (VDR)">{deal.workspace?.sharePointProvisioned ? '📁 Data room ↗' : busy === 'dataroom' ? 'Opening…' : '📁 Data room'}</button> : null}
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
              {(['overview', 'stages', 'workspace', 'research', 'documents', 'ic'] as Tab[]).map((t) => (
                <button key={t} className={`dd-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'stages' ? 'Stages & orchestration' : t === 'overview' ? 'Overview' : t === 'workspace' ? 'Workspace' : t === 'research' ? 'Market research' : t === 'documents' ? 'Documents' : 'IC readiness'}
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

              {tab === 'documents' && (
                <div className="dd-panel">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>📁 Deal documents <span className="muted" style={{ fontWeight: 400 }}>— generate a Word IC memo or Excel model from the live deal, on your Microsoft 365 license</span></div>
                  {/* Download works for anyone with deal access — built on the requester's
                      license, no M365 connection required. */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                    <button className="btn primary" disabled={!!docsBusy} onClick={() => genDoc('ic-memo', 'download')}>{docsBusy === 'ic-memo:download' ? 'Preparing…' : '📝 IC memo (Word)'}</button>
                    <button className="btn primary" disabled={!!docsBusy} onClick={() => genDoc('model', 'download')}>{docsBusy === 'model:download' ? 'Preparing…' : '📊 Deal model (Excel)'}</button>
                    {docs?.folderUrl ? <a className="btn ghost" href={docs.folderUrl} target="_blank" rel="noopener">Open data room ↗</a> : null}
                  </div>
                  {note ? <div className="muted" style={{ marginBottom: 6 }}>{note}</div> : null}
                  {docs?.notConnected ? (
                    <div className="muted">Downloads work now. Connect Microsoft 365 (from the Deal Dashboard) to also publish into this deal’s shared SharePoint data room.</div>
                  ) : docs?.error ? (
                    <div className="muted">Couldn’t load the data room: {docs.error}</div>
                  ) : !docs ? (
                    <div className="muted">Loading data room…</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                        <button className="btn" disabled={!docs.canWrite || !!docsBusy} onClick={() => genDoc('ic-memo', 'sharepoint')}>{docsBusy === 'ic-memo:sharepoint' ? 'Saving…' : '📤 Save IC memo to data room'}</button>
                        <button className="btn" disabled={!docs.canWrite || !!docsBusy} onClick={() => genDoc('model', 'sharepoint')}>{docsBusy === 'model:sharepoint' ? 'Saving…' : '📤 Save deal model to data room'}</button>
                      </div>
                      {!docs.canWrite ? <div className="muted" style={{ marginBottom: 6 }}>Read-only — publishing to the shared data room needs deal-team or partner access. You can still download your own copy.</div> : null}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(docs.documents || []).length ? (docs.documents || []).map((f: any) => (
                          <a key={f.id} href={f.webUrl} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
                            <span style={{ fontSize: 18 }}>{/\.docx?$/i.test(f.name) ? '📝' : /\.xlsx?$/i.test(f.name) ? '📊' : '📄'}</span>
                            <span style={{ fontWeight: 600, flex: 1 }}>{f.name}</span>
                            <span className="muted">{f.modified ? new Date(f.modified).toLocaleDateString() : ''}</span>
                          </a>
                        )) : <div className="muted">No documents in the data room yet.</div>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === 'stages' && (
                <>
                  <div className="orch-links">
                    <button className="wsp-link teams" disabled={!!busy} onClick={() => (ws.teamsProvisioned && ws.teamsUrl) ? window.open(ws.teamsUrl, '_blank', 'noopener') : dealChannel()}>{ws.teamsProvisioned ? 'Open Teams ↗' : '# Deal channel'}</button>
                    <button className="wsp-link spo" disabled={!!busy} onClick={openDataRoom}>{ws.sharePointProvisioned ? '📁 SharePoint data room ↗' : '📁 Data room'}</button>
                    <button className="wsp-link mr" onClick={() => setTab('research')}>📊 Market comparisons →</button>
                  </div>
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
                <>
                  <section className="dd-panel">
                    <div className="dd-panel-h">Deal workspace<span className="muted">provisioned by {ws.provisionedBy || '—'}</span></div>
                    <div className="wsp-links">
                      <button className="wsp-link teams" disabled={!!busy} onClick={() => (ws.teamsProvisioned && ws.teamsUrl) ? window.open(ws.teamsUrl, '_blank', 'noopener') : dealChannel()}>{ws.teamsProvisioned ? 'Open in Teams ↗' : busy === 'channel' ? 'Creating…' : 'Create Teams space ↗'}</button>
                      <button className="wsp-link spo" disabled={!!busy} onClick={openDataRoom}>{ws.sharePointProvisioned ? 'Open SharePoint data room ↗' : busy === 'dataroom' ? 'Opening…' : 'Data room ↗'}</button>
                    </div>
                    <div className="ws-grid">
                      <div className="ws-row"><span>Teams channel</span><span>{ws.teamsProvisioned ? (ws.teamsChannelName || 'provisioned') : 'not provisioned'}</span></div>
                      <div className="ws-row"><span>SharePoint VDR</span><span>{ws.sharePointProvisioned ? `${(ws.folders || []).length} folders · live` : 'not provisioned'}</span></div>
                      <div className="ws-row"><span>DD checklist</span><span>{deal.workspace?.checklist ? `${(deal as any).checklistStats?.pct ?? 0}% · ${(deal as any).checklistStats?.total ?? (ws.checklist || []).reduce((n: number, s: any) => n + (s.items?.length || 0), 0)} items` : '—'}</span></div>
                      <div className="ws-row"><span>Templates</span><span>{(ws.templates || []).length} docs</span></div>
                      <div className="ws-row"><span>IC date</span><span>{ws.icDate ? new Date(ws.icDate).toLocaleDateString() : '—'}</span></div>
                    </div>
                    {!ws.teamsProvisioned || !ws.sharePointProvisioned ? (
                      <div className="orch-bar">
                        <button className="btn" disabled={!!busy} onClick={() => act('teams', `/api/deals/${dealId}/teams/ensure`)}>
                          {busy === 'teams' ? 'Provisioning…' : '☁ Provision Teams + SharePoint'}
                        </button>
                      </div>
                    ) : null}
                  </section>

                  {(ws.folders || []).length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">📁 SharePoint data room<span className="muted">{(ws.folders || []).length} folders (VDR)</span></div>
                      <div className="vdr-grid">
                        {(ws.folders || []).map((f: any, i: number) => (
                          f.url
                            ? <a className="vdr-folder" key={i} href={f.url} target="_blank" rel="noreferrer">📁 {f.name}</a>
                            : <span className="vdr-folder muted" key={i}>📁 {f.name}</span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {Array.isArray(ws.swimlanes) && ws.swimlanes.length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">Diligence swimlanes<span className="muted">{ws.swimlanes.length} lanes</span></div>
                      <div className="dd-lanes" style={{ padding: '0 14px 14px' }}>
                        {ws.swimlanes.map((s: any, i: number) => (
                          <div className="dd-lane" key={i}>
                            <div className="lane-top"><span className="lane-name">{s.label || LANE_LABEL[s.lane] || s.lane}</span><span className="lane-status">{s.advisor || s.md || s.owner || 'unassigned'}</span></div>
                            {s.channelUrl ? <a className="lane-owner" href={s.channelUrl} target="_blank" rel="noreferrer">Teams channel ↗</a> : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {(ws.templates || []).length ? (
                    <section className="dd-panel">
                      <div className="dd-panel-h">▤ Playbook templates<span className="muted">{(ws.templates || []).length} docs</span></div>
                      <div className="tpl-list">
                        {(ws.templates || []).map((t: any, i: number) => (
                          t.url
                            ? <a className="tpl-row" key={i} href={t.url} target="_blank" rel="noreferrer"><span className="tpl-name">{t.name}</span><span className="chip">{t.type || t.ext || 'doc'}</span></a>
                            : <div className="tpl-row" key={i}><span className="tpl-name">{t.name}</span><span className="chip">{t.type || t.ext || 'doc'}</span></div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}

              {tab === 'research' && (
                <>
                  <section className="dd-panel">
                    <div className="dd-panel-h">Comparable &amp; historical deals<span className="muted">{market?.info?.source ? `${market.info.source}${market.info.freshness?.label ? ` · ${market.info.freshness.label}` : ''}` : 'Fabric · OneLake'}</span></div>
                    {!market ? <div className="dd-empty-p">Loading market intelligence…</div> : !(market.comparableDeals || []).length ? <div className="dd-empty-p">No comparables for this sector.</div> : (
                      <div className="mr-list">
                        {(market.comparableDeals || []).slice(0, 8).map((c, i) => (
                          <div className="mr-row" key={i}>
                            <span className="mr-name">{c.company}{c.ticker ? <span className="chip">{c.ticker}</span> : null}</span>
                            <span className="mr-val">{c.dealType || '—'} · {bigMoney(c.impliedValuation)}</span>
                            {c.status ? <span className={`chip ${String(c.status).toLowerCase().replace(/\s+/g, '-')}`}>{c.status}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="dd-panel">
                    <div className="dd-panel-h">IC voting precedents</div>
                    {!(market?.icPrecedents || []).length ? <div className="dd-empty-p">No precedents loaded.</div> : (
                      <div className="mr-list">
                        {(market!.icPrecedents || []).slice(0, 8).map((p, i) => (
                          <div className="mr-row" key={i}>
                            <span className="mr-name">{p.deal}</span>
                            <span className="mr-val">{p.decision} · {(p.votesFor ?? 0)}–{(p.votesAgainst ?? 0)}{typeof p.votesAbstain === 'number' ? `–${p.votesAbstain}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(market?.benchmarkFindings || []).length ? (
                      <div style={{ padding: '4px 14px 14px' }}>
                        <div className="dd-panel-h" style={{ padding: '8px 0', border: 'none' }}>Benchmark findings by workstream</div>
                        <div className="cand-tags">
                          {(market!.benchmarkFindings || []).map((w) => (
                            <span className="chip" key={w.workstream} title={(w.samples || []).map((s) => s.description).filter(Boolean).join(' · ')}>
                              {w.workstream} · {w.total}{(w.byRisk?.Critical || w.byRisk?.High) ? ` · ${(w.byRisk?.Critical || 0) + (w.byRisk?.High || 0)} hi-risk` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="dd-panel">
                    <div className="dd-panel-h">Source-citation audit<span className={`chip ${citations?.clean ? 'ok' : 'warn'}`}>{citations ? `${citations.score ?? 0}% traceable` : '…'}</span></div>
                    {!citations ? <div className="dd-empty-p">Auditing numeric claims…</div> : (
                      <div style={{ padding: '10px 14px 14px' }}>
                        <div className="muted" style={{ marginBottom: 8 }}>{citations.summary}</div>
                        {(citations.keyFigures || []).length ? (
                          <div className="dd-figs">
                            {(citations.keyFigures || []).map((f, i) => (
                              <div className="dd-fig" key={i} title={f.source || 'no source'}>
                                <div className="fig-v">{f.value}</div>
                                <div className="fig-l">{f.label}</div>
                                <div className="fig-src">{f.sourced ? `source: ${f.source}` : '⚠ unsourced'}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {(citations.unsourcedClaims || []).length ? (
                          <div style={{ marginTop: 10 }}>
                            <div className="mr-name" style={{ marginBottom: 6 }}>Unsourced memo figures</div>
                            <div className="cand-tags">
                              {(citations.unsourcedClaims || []).slice(0, 12).map((c, i) => (<span className="chip warn" key={i} title={c.section}>{c.figure}</span>))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </section>
                </>
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
