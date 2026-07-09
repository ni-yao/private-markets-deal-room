import { useEffect, useState } from 'react';

// Native Stage 1 — Origination & Screening. Three sub-surfaces over the shared
// backend (single data source):
//   • Pipeline   — sourcing funnel + candidate pipeline (screen/triage/gate)
//   • Framework  — fund mandate (GATE) + themes/screens (GUIDE) + ranked targets (RANK)
//   • Signals    — CxO mailbox signals + public News & filings desk
// Reads: /api/stage1/funnel, /api/stage1/pipeline, /api/candidates/:id/{screen|triage|gate},
//        /api/candidates/:id/assess, /api/framework, /api/targets/scored,
//        /api/signals/mailbox, /api/news/desk, POST /api/candidates/send-to-screening.

type Assessment = { action?: string; rationale?: string; confidence?: number; agent?: string; source?: string };
type Candidate = {
  id: string; company: string; sector?: string; subSector?: string; region?: string; country?: string;
  dealSize?: number; ownership?: string; score?: number; band?: string;
  stage?: string; disposition?: string; passReasonLabel?: string | null; passStage?: string | null;
  matchedScreen?: { id: string; name: string } | null; keywords?: string[]; sources?: string[];
  assessment?: Assessment | null;
};
type FunnelStage = { key: string; step?: string; label?: string; count?: number; active?: boolean };
type Funnel = { fundName?: string; fundStrategy?: string; discovered?: number; funnel?: FunnelStage[] };
type Pipeline = { fundName?: string; funnel?: FunnelStage[]; candidates?: Candidate[] };

type Fund = { name?: string; strategy?: string; sectors?: string[]; geographies?: string[]; evMin?: number; evMax?: number; fundSize?: number };
type Screen = { id: string; name: string; sector?: string; regions?: string[]; keywords?: string[]; selected?: boolean };
type Theme = { id: string; name: string; sponsor?: string; thesis?: string; whyNow?: string; screens?: Screen[] };
type Framework = { fund?: Fund; themes?: Theme[]; screensWithoutTheme?: Screen[] };
type ScoredTarget = { id: string; name: string; sector?: string; region?: string; country?: string; dealSize?: number; ownership?: string; score?: number; band?: string; matchedScreen?: { id: string; name: string } | null; sources?: string[]; gated?: boolean; inFunnel?: boolean };
type ScoredTargets = { selectedCount?: number; discoveredCount?: number; gatedCount?: number; targets?: ScoredTarget[] };
type EmailItem = { id: string; company?: string | null; from?: string; role?: string; subject?: string; preview?: string; when?: string; intent?: string };
type Mailbox = { emails?: EmailItem[]; chats?: unknown[]; meetings?: unknown[] };
type DeskNews = { id: string; source?: string; when?: string; headline?: string; catalyst?: string; confidence?: string; url?: string };
type DeskCompany = { id: string; name: string; ticker?: string; sector?: string; region?: string; dealSize?: number; news?: DeskNews[] };
type NewsDesk = { sources?: { id: string; name: string; role?: string }[]; catalysts?: { id: string; label: string; icon?: string }[]; companies?: DeskCompany[] };

// Deep-dive research shapes (analyst reports + expandable target detail).
type ResearchView = { firm?: string; kind?: string; rating?: string; valuation?: string; view?: string; when?: string };
type ResearchPeer = { name: string; note?: string; listed?: boolean };
type CompanyResearch = {
  coverage?: string; thesis?: string;
  sector?: { name?: string; market?: string; growth?: string; horizon?: string; outlook?: string; summary?: string; sources?: string[] };
  competitive?: { rank?: number; of?: number; label?: string; moat?: string; peers?: ResearchPeer[] };
  views?: ResearchView[];
};
type ResearchCompany = { id: string; name: string; sector?: string; region?: string; country?: string; dealSize?: number; ownership?: string; justDiscovered?: boolean; research: CompanyResearch };
type AnalystResearch = { companies?: ResearchCompany[] };
type DeskFiling = { id: string; filingType?: string; headline?: string; detail?: string; url?: string };
type GeneratedReport = { generated?: boolean; summary?: string; sectorOutlook?: { stance?: string; text?: string }; competitivePosition?: string; keyRisks?: string[]; recommendation?: string; sources?: string[] };
type TargetQuality = { public?: boolean; configured?: boolean; rating?: string; score?: number; trend?: string; flags?: string[]; note?: string; error?: string };
type TargetDetail = { id: string; name: string; ticker?: string | null; isPublic?: boolean; filings?: DeskFiling[]; filingsKind?: string; quality?: TargetQuality; report?: GeneratedReport };

const BAND_CLASS: Record<string, string> = { strong: 'ok', moderate: 'warn', weak: 'bad', excluded: 'bad' };
const OUTLOOK_CLASS: Record<string, string> = { positive: 'ok', neutral: 'warn', caution: 'bad', stable: 'warn' };
const STANCE_CLASS: Record<string, string> = { positive: 'ok', neutral: 'warn', caution: 'bad' };
const STAGE_LABEL: Record<string, string> = { O1: 'Sourced', O2: 'Screen', O3: 'Prioritize', O4: 'Gate', pursued: 'Pursued' };
const INTENT_CLASS: Record<string, string> = { high: 'ok', medium: 'warn', low: 'bad' };
const STAGE_ACTIONS: Record<string, { endpoint: string; actions: { k: string; label: string; cls: string }[] }> = {
  O2: { endpoint: 'screen', actions: [{ k: 'advance', label: 'Advance →', cls: 'primary' }, { k: 'pass', label: 'Pass', cls: 'ghost' }] },
  O3: { endpoint: 'triage', actions: [{ k: 'advance', label: 'Advance →', cls: 'primary' }, { k: 'park', label: 'Park', cls: '' }, { k: 'pass', label: 'Pass', cls: 'ghost' }] },
  O4: { endpoint: 'gate', actions: [{ k: 'pursue', label: '⚡ Pursue →', cls: 'primary' }, { k: 'park', label: 'Park', cls: '' }, { k: 'pass', label: 'Pass', cls: 'ghost' }] },
};

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);
type SubTab = 'pipeline' | 'framework' | 'research' | 'signals';

export default function Stage1({ onChanged, onOpenDeal }: { onChanged: () => void; onOpenDeal: (id: string) => void }) {
  const [sub, setSub] = useState<SubTab>('pipeline');
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pipe, setPipe] = useState<Pipeline | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [targets, setTargets] = useState<ScoredTargets | null>(null);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [desk, setDesk] = useState<NewsDesk | null>(null);
  const [research, setResearch] = useState<AnalystResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>('active');
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<string>('');

  async function loadPipeline() {
    const [f, p] = await Promise.all([
      fetch('/api/stage1/funnel').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/stage1/pipeline').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setFunnel(f); setPipe(p);
  }
  useEffect(() => { setLoading(true); loadPipeline().finally(() => setLoading(false)); }, []);

  // Lazy-load framework + signals data the first time their sub-tab opens.
  useEffect(() => {
    if (sub === 'framework' && !framework) {
      fetch('/api/framework').then((r) => (r.ok ? r.json() : null)).then(setFramework).catch(() => {});
      fetch('/api/targets/scored').then((r) => (r.ok ? r.json() : null)).then(setTargets).catch(() => {});
    }
    if (sub === 'signals' && !mailbox) {
      fetch('/api/signals/mailbox').then((r) => (r.ok ? r.json() : null)).then(setMailbox).catch(() => {});
      fetch('/api/news/desk').then((r) => (r.ok ? r.json() : null)).then(setDesk).catch(() => {});
    }
    if (sub === 'research' && !research) {
      fetch('/api/research').then((r) => (r.ok ? r.json() : null)).then(setResearch).catch(() => {});
      if (!targets) fetch('/api/targets/scored').then((r) => (r.ok ? r.json() : null)).then(setTargets).catch(() => {});
    }
  }, [sub, framework, mailbox, research, targets]);

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
      if (!r.ok) setNote(`Action failed (${r.status}).`);
      else if (data.deal) { setNote(`${cand.company} pursued — Stage 2 deal created.`); onChanged(); }
      await loadPipeline();
    } catch (e: any) { setNote(`Action failed (${String(e?.message || e)}).`); }
    finally { setBusy(''); }
  }
  async function reassess(cand: Candidate) {
    setBusy(cand.id + 'assess'); setNote('');
    try { await fetch(`/api/candidates/${cand.id}/assess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); await loadPipeline(); }
    catch { /* ignore */ } finally { setBusy(''); }
  }
  async function sendToScreening(deskId: string, name: string) {
    setBusy('send' + deskId); setNote('');
    try {
      const r = await fetch('/api/candidates/send-to-screening', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deskId }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && !data.error) { setNote(`${name} sent to the screening funnel (O2).`); await loadPipeline(); onChanged(); }
      else setNote(data.error === 'already-in-funnel' ? `${name} is already in the funnel.` : `Could not send ${name} to screening.`);
    } catch (e: any) { setNote(`Failed: ${String(e?.message || e)}`); }
    finally { setBusy(''); }
  }

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
      <div className="dd-tabs" style={{ margin: 0 }}>
        {(['pipeline', 'framework', 'research', 'signals'] as SubTab[]).map((t) => (
          <button key={t} className={`dd-tab${sub === t ? ' on' : ''}`} onClick={() => setSub(t)}>
            {t === 'pipeline' ? 'Pipeline' : t === 'framework' ? 'Sourcing framework' : t === 'research' ? 'Market research' : 'Signals'}
          </button>
        ))}
      </div>

      {note ? <div className="dd-actionnote">{note}</div> : null}

      {sub === 'pipeline' && (
        <>
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
                              <button key={a.k} className={`btn ${a.cls}`} disabled={!!busy} onClick={() => decide(c, a.k)}>{busy === c.id + a.k ? '…' : a.label}</button>
                            ))}
                            <button className="btn ghost" disabled={!!busy} title="Re-run the AI assessment" onClick={() => reassess(c)}>{busy === c.id + 'assess' ? '…' : '↻'}</button>
                          </>
                        ) : (<span className="muted">—</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {sub === 'framework' && (
        <>
          <section className="panel">
            <div className="panel-h">Fund mandate (GATE)<span className="muted">the hard box every target must fit</span></div>
            {framework?.fund ? (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 700 }}>{framework.fund.name}</div>
                <div className="muted" style={{ margin: '2px 0 8px' }}>{framework.fund.strategy}</div>
                <div className="cand-tags">
                  {framework.fund.fundSize ? <span className="chip">Fund {money(framework.fund.fundSize)}</span> : null}
                  {(framework.fund.evMin != null || framework.fund.evMax != null) ? <span className="chip">EV {money(framework.fund.evMin)}–{money(framework.fund.evMax)}</span> : null}
                  {(framework.fund.sectors || []).slice(0, 5).map((s, i) => <span className="chip" key={'s' + i}>{s}</span>)}
                  {(framework.fund.geographies || []).slice(0, 4).map((g, i) => <span className="chip" key={'g' + i}>{g}</span>)}
                </div>
              </div>
            ) : <div className="empty-panel">Loading fund mandate…</div>}
          </section>

          <section className="panel">
            <div className="panel-h">Investment themes (GUIDE)<span className="muted">{(framework?.themes || []).length} themes</span></div>
            {!(framework?.themes || []).length ? <div className="empty-panel">Loading themes…</div> : (
              <div style={{ padding: '6px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(framework!.themes || []).map((t) => (
                  <div key={t.id} className="cand" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="cand-top"><span className="cand-co">{t.name}</span>{t.sponsor ? <span className="chip">{t.sponsor}</span> : null}</div>
                    {t.thesis ? <div className="cand-meta">{t.thesis}</div> : null}
                    {t.whyNow ? <div className="cand-assess"><b>Why now</b> — {t.whyNow}</div> : null}
                    {(t.screens || []).length ? <div className="cand-tags" style={{ marginTop: 6 }}>{(t.screens || []).map((s) => <span className="chip" key={s.id} title={(s.keywords || []).join(', ')}>{s.selected ? '✓ ' : ''}{s.name}</span>)}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-h">Ranked targets (RANK)<span className="muted">{(targets?.targets || []).length} scored{targets?.gatedCount ? ` · ${targets.gatedCount} gated` : ''}</span></div>
            {!(targets?.targets || []).length ? <div className="empty-panel">Loading ranked targets…</div> : (
              <div className="cand-list">
                {(targets!.targets || []).slice(0, 25).map((t) => (
                  <TargetRow key={t.id} t={t} busy={busy} onScreen={() => sendToScreening(t.id, t.name)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {sub === 'research' && (
        <section className="panel">
          <div className="panel-h">Analyst research<span className="muted">thesis context — is this a good business in a good market?</span></div>
          {(research?.companies || []).length ? (
            <div className="rc-list">
              {(research!.companies || []).map((c) => <ResearchCard key={c.id} c={c} />)}
            </div>
          ) : !targets ? (
            <div className="empty-panel">Loading analyst research…</div>
          ) : (
            <div className="rc-list">
              {(targets.targets || []).filter((t) => !t.gated).slice(0, 12).map((t) => <GeneratedResearchCard key={t.id} t={t} />)}
            </div>
          )}
        </section>
      )}

      {sub === 'signals' && (
        <>
          <section className="panel">
            <div className="panel-h">CxO signals<span className="muted">M365 mailbox · {(mailbox?.emails || []).length} emails</span></div>
            {!mailbox ? <div className="empty-panel">Loading signals…</div> : !(mailbox.emails || []).length ? <div className="empty-panel">No mailbox signals.</div> : (
              <div className="cand-list">
                {(mailbox.emails || []).map((e) => (
                  <div className="cand" key={e.id}>
                    <div className="cand-main">
                      <div className="cand-top"><span className="cand-co">{e.subject || '(no subject)'}</span>{e.intent ? <span className={`pill ${INTENT_CLASS[e.intent] || ''}`}>{e.intent}</span> : null}</div>
                      <div className="cand-meta">{[e.from, e.role, e.company].filter(Boolean).join(' · ')}{e.when ? ` · ${e.when}` : ''}</div>
                      {e.preview ? <div className="cand-assess">{e.preview}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-h">News & filings desk<span className="muted">{(desk?.companies || []).length} companies · {(desk?.catalysts || []).length} catalysts</span></div>
            {desk?.catalysts?.length ? <div className="cand-tags" style={{ padding: '10px 16px 0' }}>{(desk.catalysts || []).map((c) => <span className="chip" key={c.id}>{c.icon ? `${c.icon} ` : ''}{c.label}</span>)}</div> : null}
            {!desk ? <div className="empty-panel">Loading news desk…</div> : !(desk.companies || []).length ? <div className="empty-panel">No news companies.</div> : (
              <div className="cand-list">
                {(desk.companies || []).map((co) => (
                  <div className="cand" key={co.id}>
                    <div className="cand-main">
                      <div className="cand-top"><span className="cand-co">{co.name}{co.ticker ? ` (${co.ticker})` : ''}</span></div>
                      <div className="cand-meta">{[co.sector, co.region].filter(Boolean).join(' · ')}{co.dealSize ? ` · ${money(co.dealSize)}` : ''}</div>
                      {(co.news || []).slice(0, 2).map((n) => (
                        <div className="cand-assess" key={n.id} title={n.source || ''}>{n.catalyst ? <b>{n.catalyst} — </b> : null}{n.headline}{n.when ? ` · ${n.when}` : ''}</div>
                      ))}
                    </div>
                    <div className="cand-actions">
                      <button className="btn" disabled={!!busy} title="Send to the screening funnel" onClick={() => sendToScreening(co.id, co.name)}>{busy === 'send' + co.id ? '…' : 'Screen →'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// Generated-research card — for live pipeline targets that have no static analyst
// seed, lazily generate the analyst report (sector outlook · competitive position
// · key risks · recommendation) + filings + Morningstar on first expand.
function GeneratedResearchCard({ t }: { t: ScoredTarget }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TargetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || detail || loading) return;
    setLoading(true);
    fetch(`/api/targets/${t.id}/detail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then((r) => (r.ok ? r.json() : null)).then(setDetail).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <div className={`rc${open ? ' open' : ''}`}>
      <button className="rc-hd" onClick={() => setOpen((v) => !v)}>
        <span className="rc-caret">{open ? '▾' : '▸'}</span>
        <div className="rc-main">
          <div className="cand-co">{t.name} <span className={`pill ${BAND_CLASS[t.band || ''] || ''}`}>{t.score ?? 0} · {t.band || '—'}</span></div>
          <div className="cand-meta">{[t.sector, t.region, t.country].filter(Boolean).join(' · ')} · {money(t.dealSize)}{t.ownership ? ` · ${t.ownership}` : ''}</div>
        </div>
        <span className="chip">SEC filings · Morningstar · AI analyst report</span>
      </button>
      {open ? (
        <div className="rc-body">
          {loading && !detail ? <div className="muted">Pulling filings, Morningstar &amp; generating the analyst report…</div> : null}
          {detail ? <TargetDetailBody d={detail} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// Expandable ranked-target row — on open, lazily pulls the target's SEC filings,
// Morningstar quality read and generated analyst report (/api/targets/:id/detail).
function TargetRow({ t, busy, onScreen }: { t: ScoredTarget; busy: string; onScreen: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TargetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || detail || loading) return;
    setLoading(true);
    fetch(`/api/targets/${t.id}/detail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then((r) => (r.ok ? r.json() : null)).then(setDetail).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <div className={`cand${open ? ' open' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
        <div className="cand-main">
          <div className="cand-top">
            <span className="cand-co">{t.name}</span>
            <span className={`pill ${BAND_CLASS[t.band || ''] || ''}`}>{t.score ?? 0} · {t.band || '—'}</span>
          </div>
          <div className="cand-meta">{[t.sector, t.region, t.country].filter(Boolean).join(' · ')} · {money(t.dealSize)}{t.ownership ? ` · ${t.ownership}` : ''}</div>
          <div className="cand-tags">
            {t.matchedScreen ? <span className="chip" title="Matched screen">🎯 {t.matchedScreen.name}</span> : null}
            {t.gated ? <span className="chip" title="Blocked by the fund gate">⛔ gated</span> : null}
            {t.inFunnel ? <span className="chip">in funnel</span> : null}
            {(t.sources || []).slice(0, 2).map((s, i) => <span className="chip" key={i}>{s}</span>)}
          </div>
          {!t.gated ? (
            <button className="td-toggle" onClick={() => setOpen((v) => !v)}>{open ? '▾' : '▸'} Filings · Morningstar rating · generated analyst report</button>
          ) : null}
        </div>
        <div className="cand-actions">
          {t.inFunnel ? <span className="muted">in funnel</span> : (
            <button className="btn" disabled={!!busy || t.gated} title={t.gated ? 'Blocked by the fund gate' : 'Send to the screening funnel'} onClick={onScreen}>{busy === 'send' + t.id ? '…' : 'Screen →'}</button>
          )}
        </div>
      </div>
      {open ? (
        <div className="td-wrap">
          {loading && !detail ? <div className="muted" style={{ padding: '8px 0' }}>Pulling filings, Morningstar &amp; generating the analyst report…</div> : null}
          {detail ? <TargetDetailBody d={detail} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function TargetDetailBody({ d }: { d: TargetDetail }) {
  const r = d.report || {};
  const q = d.quality || {};
  const qBand = (q.score ?? 0) >= 7 ? 'ok' : (q.score ?? 0) >= 5 ? 'warn' : 'bad';
  const failed = !q.rating || q.rating === 'Pending';
  return (
    <div className="td-grid">
      <div className="td-panel">
        <div className="td-panel-h">📄 Filings<span className="chip">{d.filingsKind === 'formd' ? 'SEC Form D' : d.filingsKind === 'public' ? 'SEC EDGAR' : 'none'}</span></div>
        {!(d.filings || []).length ? <div className="muted">No SEC filings — no public 10-K/10-Q/8-K and no recent Reg D (Form D) on EDGAR.</div> : (
          <div className="td-filings">
            {(d.filings || []).slice(0, 6).map((f) => (
              <div className="td-filing" key={f.id}>
                <div><span className="chip">{f.filingType}</span></div>
                <div className="td-filing-head">{f.headline}</div>
                {f.detail ? <div className="muted">{f.detail}</div> : null}
                {f.url ? <a className="td-link" href={f.url} target="_blank" rel="noreferrer">🔗 View on SEC.gov</a> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="td-panel">
        <div className="td-panel-h">★ Morningstar rating<span className="chip">{d.isPublic ? (d.ticker || 'public') : 'private'}</span></div>
        {!d.isPublic ? <div className="muted">Private company — no public Morningstar coverage.</div>
          : q.configured === false ? <div className="muted">{q.note || 'Morningstar not connected.'}</div>
          : failed ? <div className="muted">{q.error ? `Morningstar read failed: ${q.error}.` : 'Morningstar quality read pending.'}</div>
          : (
            <div className="q-card">
              <div className="q-top">
                <span className={`q-score ${qBand}`}>{(q.score ?? 0).toFixed(1)}</span>
                <div><div className="q-rating">{q.rating}</div><div className="muted">{q.trend === 'improving' ? '↑' : q.trend === 'weakening' ? '↓' : '→'} {q.trend}</div></div>
              </div>
              {(q.flags || []).length ? <div className="cand-tags" style={{ marginTop: 6 }}>{(q.flags || []).map((f) => <span className="chip" key={f}>⚑ {f}</span>)}</div> : null}
              {q.note ? <div className="muted" style={{ marginTop: 6 }}>{q.note}</div> : null}
            </div>
          )}
      </div>

      <div className="td-panel td-wide">
        <div className="td-panel-h">📝 Analyst report<span className={`chip ${r.generated ? 'ai' : ''}`}>{r.generated ? '✦ AI-generated' : 'grounded'}</span>{(r.sources || []).length ? <span className="muted">{(r.sources || []).join(' · ')}</span> : null}</div>
        {r.summary ? <div className="td-summary">💡 {r.summary}</div> : null}
        {r.sectorOutlook ? (
          <div className="td-row"><span className="td-k">Sector outlook</span><span className="td-v"><span className={`pill ${STANCE_CLASS[r.sectorOutlook.stance || ''] || 'warn'}`}>{r.sectorOutlook.stance}</span> {r.sectorOutlook.text}</span></div>
        ) : null}
        {r.competitivePosition ? <div className="td-row"><span className="td-k">Competitive position</span><span className="td-v">{r.competitivePosition}</span></div> : null}
        {(r.keyRisks || []).length ? <div className="td-row"><span className="td-k">Key risks</span><span className="td-v"><ul className="td-risks">{(r.keyRisks || []).map((k, i) => <li key={i}>{k}</li>)}</ul></span></div> : null}
        {r.recommendation ? <div className="td-row rec"><span className="td-k">Recommendation</span><span className="td-v">{r.recommendation}</span></div> : null}
      </div>
    </div>
  );
}

// Analyst research card — sector outlook · competitive rank · sell-side/expert views.
function ResearchCard({ c }: { c: ResearchCompany }) {
  const [open, setOpen] = useState(false);
  const r = c.research || {};
  const outlook = r.sector?.outlook || 'neutral';
  return (
    <div className={`rc${open ? ' open' : ''}`}>
      <button className="rc-hd" onClick={() => setOpen((v) => !v)}>
        <span className="rc-caret">{open ? '▾' : '▸'}</span>
        <div className="rc-main">
          <div className="cand-co">{c.name}{c.justDiscovered ? <span className="chip" style={{ marginLeft: 6 }}>✦ new</span> : null} <span className="chip">{r.coverage === 'direct' ? 'Direct coverage' : 'Read-across'}</span></div>
          <div className="cand-meta">{[c.sector, c.region].filter(Boolean).join(' · ')}{c.dealSize ? ` · ${money(c.dealSize)}` : ''}{c.ownership ? ` · ${c.ownership}` : ''}</div>
        </div>
        <span className={`pill ${OUTLOOK_CLASS[outlook] || 'warn'}`}>Sector · {outlook}</span>
      </button>
      {open ? (
        <div className="rc-body">
          {r.thesis ? <div className="td-summary">💡 {r.thesis}</div> : null}
          <div className="td-grid">
            <div className="td-panel">
              <div className="td-panel-h">🌍 Sector outlook</div>
              <div className="cand-co">{r.sector?.name}</div>
              <div className="cand-tags" style={{ marginTop: 6 }}>
                {r.sector?.market ? <span className="chip">Market {r.sector.market}</span> : null}
                {r.sector?.growth ? <span className="chip">Growth {r.sector.growth}</span> : null}
                {r.sector?.horizon ? <span className="chip">Horizon {r.sector.horizon}</span> : null}
              </div>
              {r.sector?.summary ? <div className="muted" style={{ marginTop: 6 }}>{r.sector.summary}</div> : null}
              {(r.sector?.sources || []).length ? <div className="cand-tags" style={{ marginTop: 6 }}>{(r.sector!.sources || []).map((s) => <span className="chip" key={s}>{s}</span>)}</div> : null}
            </div>
            <div className="td-panel">
              <div className="td-panel-h">🏆 Competitive rank</div>
              <div className="rc-rank"><span className="rc-rank-badge">#{r.competitive?.rank}</span><span className="muted">of {r.competitive?.of}</span> <b>{r.competitive?.label}</b></div>
              {r.competitive?.moat ? <div className="muted" style={{ margin: '4px 0' }}><b>Moat:</b> {r.competitive.moat}</div> : null}
              {(r.competitive?.peers || []).map((p) => (
                <div className="rc-peer" key={p.name}><span className={`peer-dot ${p.listed ? 'listed' : 'private'}`} /><b>{p.name}</b> <span className="muted">{p.note}</span></div>
              ))}
            </div>
          </div>
          <div className="td-panel td-wide">
            <div className="td-panel-h">📑 Sell-side &amp; expert view</div>
            {(r.views || []).map((v, i) => (
              <div className="rc-view" key={i}>
                <div className="rc-view-top"><b>{v.firm}</b> <span className="chip">{v.kind}</span>{v.rating ? <span className="chip">{v.rating}</span> : null}{v.when ? <span className="muted">{v.when}</span> : null}</div>
                <div>{v.view}</div>
                {v.valuation ? <div className="muted">📊 {v.valuation}</div> : null}
              </div>
            ))}
            {r.coverage === 'read-across' ? <div className="muted" style={{ marginTop: 6 }}>Private target — context is read-across from listed comps, sector research and expert-network calls.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
