import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { ICReadiness, MdOption, IssueSeverity, IssueStatus, ConditionStatus, Deal } from '../types';

const SEV_LABEL: Record<IssueSeverity, string> = {
  positive: 'Positive', neutral: 'Neutral', caution: 'Caution', negative: 'Negative', risk: 'Risk'
};
const VERDICT_CLASS: Record<string, string> = { READY: 'ready', CONDITIONAL: 'conditional', 'NOT-READY': 'notready' };

const money = (n?: number | null) => {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n}`;
};

interface Props {
  dealId: string;
  mdOptions: MdOption[];
  onDealUpdate?: (d: Deal) => void;
}

export function ICCockpit({ dealId, mdOptions, onDealUpdate }: Props) {
  const [board, setBoard] = useState<ICReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState('analyst');
  const [busy, setBusy] = useState(false);

  // issue form
  const [showIssue, setShowIssue] = useState(false);
  const [iLane, setILane] = useState('commercial');
  const [iTitle, setITitle] = useState('');
  const [iSev, setISev] = useState<IssueSeverity>('caution');
  const [iOwner, setIOwner] = useState('');
  const [iPath, setIPath] = useState('');
  const [iDue, setIDue] = useState('');

  // condition form
  const [showCond, setShowCond] = useState(false);
  const [cText, setCText] = useState('');
  const [cOwner, setCOwner] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.icReadiness(dealId).then(setBoard).catch(() => setBoard(null)).finally(() => setLoading(false));
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const actors = [{ id: 'analyst', name: 'Analyst' }, ...mdOptions];

  const afterMutate = (d: Deal) => { onDealUpdate?.(d); load(); };

  const addIssue = async () => {
    if (!iTitle.trim()) return;
    setBusy(true);
    try {
      const d = await api.recordIssue(dealId, { lane: iLane, title: iTitle.trim(), severity: iSev, owner: iOwner || undefined, resolutionPath: iPath || undefined, dueDate: iDue || undefined, md: actor });
      setITitle(''); setIOwner(''); setIPath(''); setIDue(''); setShowIssue(false);
      afterMutate(d);
    } finally { setBusy(false); }
  };

  const resolveIssue = async (issueId: string, status: IssueStatus) => {
    setBusy(true);
    try { afterMutate(await api.resolveIssue(dealId, issueId, { status, md: actor })); } finally { setBusy(false); }
  };

  const addCondition = async () => {
    if (!cText.trim()) return;
    setBusy(true);
    try {
      const d = await api.setCondition(dealId, { text: cText.trim(), owner: cOwner || undefined, md: 'partner' });
      setCText(''); setCOwner(''); setShowCond(false);
      afterMutate(d);
    } finally { setBusy(false); }
  };

  const cycleCondition = async (condId: string, status: ConditionStatus) => {
    setBusy(true);
    try { afterMutate(await api.updateCondition(dealId, condId, { status, md: 'partner' })); } finally { setBusy(false); }
  };

  const snapshot = async () => {
    setBusy(true);
    try { afterMutate(await api.snapshotAssumptions(dealId, { md: actor })); } finally { setBusy(false); }
  };

  if (loading && !board) return <div className="icc-loading">Loading IC readiness…</div>;
  if (!board) return <div className="icc-loading">IC readiness unavailable.</div>;

  const ra = board.requiredArtifacts;
  const fabric = board.marketIntel?.source;

  return (
    <div className="icc">
      {/* Verdict banner */}
      <div className={`icc-verdict ${VERDICT_CLASS[board.verdict.state] || 'notready'}`}>
        <div className="icc-vstate">{board.verdict.state.replace('-', ' ')}</div>
        <div className="icc-vbody">
          <div className="icc-vhead">{board.verdict.headline}</div>
          {board.verdict.gating.length > 0 && (
            <div className="icc-gating">
              {board.verdict.gating.map((g, i) => <span className="icc-gate" key={i}>{g}</span>)}
            </div>
          )}
        </div>
        <div className="icc-actor">
          <label>Acting as</label>
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {board.overrides && board.overrides.length > 0 && (
        <div className="icc-overrides">
          <h5>⚠ Partner IC-gate overrides on record</h5>
          {board.overrides.map((o, i) => (
            <div className="icc-ovr" key={i}>
              <b>{o.gate === 'ic-approval' ? 'IC approval' : 'IC entry'}</b> at {o.stage} over a {o.verdict} verdict — “{o.reason}” <span className="at">· {o.by} · {new Date(o.at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="icc-grid">
        {/* 1 · Required artifacts */}
        <section className="icc-card">
          <h4><span className="icc-q">1</span> Required artifacts complete? <em>{ra.complete}/{ra.total}</em></h4>
          <ul className="icc-checks">
            {ra.items.map((it) => (
              <li key={it.key} className={it.complete ? 'ok' : 'miss'}>
                <span className="icc-dot">{it.complete ? '✓' : '○'}</span>
                <span className="icc-cl">{it.label}</span>
                <span className="icc-cd">{it.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 2 · Blocking workstreams */}
        <section className="icc-card">
          <h4><span className="icc-q">2</span> Which workstreams are blocking? <em>{board.blockingWorkstreams.length}</em></h4>
          {board.blockingWorkstreams.length === 0
            ? <div className="icc-empty">No workstream is blocking.</div>
            : (
              <ul className="icc-blocks">
                {board.blockingWorkstreams.map((w) => (
                  <li key={w.lane}>
                    <div className="icc-bl">{w.label}{w.owner ? <span className="icc-owner"> · {w.owner}</span> : null}</div>
                    <div className="icc-reasons">{w.reasons.map((r, i) => <span key={i}>{r}</span>)}</div>
                  </li>
                ))}
              </ul>
            )}
        </section>

        {/* 3 · Changed assumptions */}
        <section className="icc-card">
          <h4><span className="icc-q">3</span> Assumptions changed since last IC draft?</h4>
          <div className="icc-note">{board.changedAssumptions.note}</div>
          {board.changedAssumptions.changes.length > 0 && (
            <table className="icc-diff">
              <tbody>
                {board.changedAssumptions.changes.map((c) => (
                  <tr key={c.key}><td>{c.label}</td><td className="from">{String(c.from)}</td><td className="arr">→</td><td className="to">{String(c.to)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="btn ghost sm" disabled={busy} onClick={snapshot}>Snapshot current assumptions</button>
        </section>

        {/* 4 · Unresolved risks / issue log */}
        <section className="icc-card icc-wide">
          <h4>
            <span className="icc-q">4</span> Which risks are unresolved? <em>{board.unresolvedRisks.length}</em>
            <button className="btn ghost sm icc-right" onClick={() => setShowIssue((s) => !s)}>{showIssue ? 'Cancel' : '+ Log issue'}</button>
          </h4>
          {showIssue && (
            <div className="icc-form">
              <div className="icc-frow">
                <select value={iLane} onChange={(e) => setILane(e.target.value)}>
                  <option value="commercial">Commercial</option>
                  <option value="techai">Tech / AI</option>
                  <option value="operations">Operations</option>
                  <option value="financial">Financial / QoE</option>
                  <option value="legal">Legal</option>
                  <option value="tax">Tax</option>
                  <option value="esg">ESG</option>
                </select>
                <select value={iSev} onChange={(e) => setISev(e.target.value as IssueSeverity)}>
                  {(['risk', 'negative', 'caution', 'neutral', 'positive'] as IssueSeverity[]).map((s) => <option key={s} value={s}>{SEV_LABEL[s]}</option>)}
                </select>
                <input placeholder="Owner" value={iOwner} onChange={(e) => setIOwner(e.target.value)} />
                <input type="date" value={iDue} onChange={(e) => setIDue(e.target.value)} />
              </div>
              <input className="icc-ftitle" placeholder="Issue title (e.g. Top-5 customer concentration 46% of revenue)" value={iTitle} onChange={(e) => setITitle(e.target.value)} />
              <input className="icc-fpath" placeholder="Resolution path (how it gets cleared)" value={iPath} onChange={(e) => setIPath(e.target.value)} />
              <button className="btn primary sm" disabled={busy || !iTitle.trim()} onClick={addIssue}>Log issue</button>
            </div>
          )}
          {board.unresolvedRisks.length === 0
            ? <div className="icc-empty">No unresolved risk-level issues.</div>
            : (
              <ul className="icc-issues">
                {board.unresolvedRisks.map((r) => (
                  <li key={r.id}>
                    <span className={`icc-sev ${r.severity}`}>{SEV_LABEL[r.severity]}</span>
                    <div className="icc-ibody">
                      <div className="icc-ititle">{r.title}</div>
                      <div className="icc-imeta">
                        {r.laneLabel}{r.owner ? ` · ${r.owner}` : ''} · <span className={`icc-status ${r.status}`}>{r.status}</span>
                        {r.resolutionPath ? <span className="icc-ipath"> · {r.resolutionPath}</span> : null}
                      </div>
                    </div>
                    <div className="icc-iact">
                      {r.status !== 'mitigating' && <button className="btn ghost xs" disabled={busy} onClick={() => resolveIssue(r.id, 'mitigating')}>Mitigating</button>}
                      <button className="btn ghost xs" disabled={busy} onClick={() => resolveIssue(r.id, 'resolved')}>Resolve</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </section>

        {/* 5 · Supporting sources */}
        <section className="icc-card">
          <h4><span className="icc-q">5</span> What supports the recommendation? <em>{board.supportingSources.length}</em></h4>
          {board.citationAudit && (
            <div className={`icc-cit ${board.citationAudit.clean ? 'clean' : 'flagged'}`}>
              <div className="icc-cit-top">
                <span className="icc-cit-score">{board.citationAudit.score}<i>/100</i></span>
                <span className="icc-cit-label">Citation coverage · {board.citationAudit.sourcedClaims}/{board.citationAudit.totalClaims} claims sourced</span>
              </div>
              <div className="icc-cit-summary">{board.citationAudit.summary}</div>
            </div>
          )}
          <div className="icc-sources">
            {board.supportingSources.length === 0 && <div className="icc-empty">No sources on the record yet.</div>}
            {board.supportingSources.map((s, i) => (
              <span className={`icc-src ${s.kind}`} key={i} title={s.ref || ''}>
                {s.kind.startsWith('fabric') && <b>Fabric</b>}{s.label}
              </span>
            ))}
          </div>
        </section>

        {/* 6 · IC ask */}
        <section className="icc-card">
          <h4><span className="icc-q">6</span> What is the exact IC ask?</h4>
          <dl className="icc-ask">
            <div><dt>Enterprise value</dt><dd>{board.icAsk.enterpriseValue}</dd></div>
            <div><dt>Entry</dt><dd>{board.icAsk.entryMultiple}</dd></div>
            <div><dt>Equity check</dt><dd>{board.icAsk.equityCheck}</dd></div>
            <div><dt>Base case</dt><dd>{board.icAsk.baseCase}</dd></div>
            <div><dt>Hurdle</dt><dd>{board.icAsk.hurdle}</dd></div>
            <div className="wide"><dt>Structure</dt><dd>{board.icAsk.structure}</dd></div>
          </dl>
        </section>

        {/* 7 · Conditions */}
        <section className="icc-card icc-wide">
          <h4>
            <span className="icc-q">7</span> Which conditions need approval? <em>{board.conditions.length}</em>
            <button className="btn ghost sm icc-right" onClick={() => setShowCond((s) => !s)}>{showCond ? 'Cancel' : '+ Add condition'}</button>
          </h4>
          {showCond && (
            <div className="icc-form">
              <input className="icc-ftitle" placeholder="Condition (e.g. Committed debt financing at ≤5.0x total leverage)" value={cText} onChange={(e) => setCText(e.target.value)} />
              <div className="icc-frow">
                <input placeholder="Owner" value={cOwner} onChange={(e) => setCOwner(e.target.value)} />
                <button className="btn primary sm" disabled={busy || !cText.trim()} onClick={addCondition}>Add condition</button>
              </div>
            </div>
          )}
          {board.conditions.length === 0
            ? <div className="icc-empty">No conditions recorded.</div>
            : (
              <ul className="icc-conds">
                {board.conditions.map((c) => (
                  <li key={c.id}>
                    <span className={`icc-cstatus ${c.status}`}>{c.status}</span>
                    <span className="icc-ctext">{c.text}</span>
                    {c.owner ? <span className="icc-cowner">{c.owner}</span> : null}
                    <span className="icc-cact">
                      {c.status !== 'accepted' && <button className="btn ghost xs" disabled={busy} onClick={() => cycleCondition(c.id, 'accepted')}>Accept</button>}
                      {c.status !== 'satisfied' && <button className="btn ghost xs" disabled={busy} onClick={() => cycleCondition(c.id, 'satisfied')}>Satisfied</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      {/* Fabric / OneLake market intelligence grounding */}
      {board.marketIntel && (
        <div className="icc-fabric">
          <div className="icc-fhead">
            <span className="icc-fic">◆</span>
            <h4>Market intelligence — Fabric · OneLake</h4>
            <span className={`icc-fmode ${fabric?.mode}`}>{fabric?.mode === 'live' ? 'live query' : fabric?.mode === 'materialized' ? 'Fabric snapshot' : 'unconfigured'}</span>
            {fabric?.freshness && <span className="icc-ffresh">as of {fabric.freshness.label}</span>}
            <span className="icc-fsrc">{fabric?.lineage?.workspace || fabric?.source || 'dealroomfabric'}</span>
          </div>
          {fabric?.lineage && (
            <div className="icc-flineage">
              <span className="icc-flin-lbl">Lineage</span>
              <span className="icc-flin-path">{fabric.lineage.platform} › {fabric.lineage.workspace} › {fabric.lineage.lakehouse}</span>
              <span className="icc-flin-tables">{fabric.lineage.tables.length} tables: {fabric.lineage.tables.join(', ')}</span>
            </div>
          )}
          {fabric?.liveConfigured && fabric?.mode !== 'live' && fabric?.liveError && (
            <div className="icc-flive-err">Live query unavailable — serving the materialized snapshot. {fabric.liveError}</div>
          )}
          <div className="icc-fgrid">
            <div className="icc-fcol">
              <h5>Comparable & historical deals</h5>
              <table className="icc-ftable">
                <tbody>
                  {board.marketIntel.comparableDeals.map((c, i) => (
                    <tr key={i}>
                      <td className="co">{c.company}{c.ticker ? <span className="tk">{c.ticker}</span> : null}</td>
                      <td>{c.dealType}</td>
                      <td className="num">{money(c.impliedValuation)}</td>
                      <td><span className={`icc-fstatus ${String(c.status).toLowerCase().replace(/\s+/g, '-')}`}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="icc-fcol">
              <h5>IC voting precedents</h5>
              <ul className="icc-fprec">
                {board.marketIntel.icPrecedents.map((p, i) => (
                  <li key={i}>
                    <span className={`icc-decision ${String(p.decision).toLowerCase().replace(/\s+/g, '-')}`}>{p.decision}</span>
                    <span className="icc-pdeal">{p.deal}</span>
                    <span className="icc-pvote">{p.votesFor}–{p.votesAgainst}{p.votesAbstain ? `–${p.votesAbstain}` : ''}</span>
                  </li>
                ))}
              </ul>
              <h5 style={{ marginTop: 12 }}>Benchmark findings by workstream</h5>
              <div className="icc-fbench">
                {board.marketIntel.benchmarkFindings.map((w) => (
                  <span className="icc-bench" key={w.workstream} title={(w.samples || []).map((s) => s.description).join(' · ')}>
                    {w.workstream}<b>{w.total}</b>
                    {(w.byRisk?.Critical || w.byRisk?.High) ? <i className="hi">{(w.byRisk?.Critical || 0) + (w.byRisk?.High || 0)} hi-risk</i> : null}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
