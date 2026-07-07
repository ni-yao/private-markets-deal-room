import { useEffect, useState } from 'react';
import type {
  DealArtifact, DiligencePlan, FindingsReport, FinalIcMemo, ExecutionPack, CloseoutPlan
} from '../types';
import { api } from '../api';

const STEP_META: Record<string, { label: string; ic: string }> = {
  D1: { label: 'Diligence Plan', ic: '🗺' },
  D2: { label: 'Diligence Findings · Red-Flag Report', ic: '🔎' },
  D3: { label: 'Final IC Memo', ic: '▤' },
  D4: { label: 'Approval & Execution Pack', ic: '⚖' },
  D5: { label: 'Close-out & 100-Day Plan', ic: '🚀' }
};

// The per-deal Stage-2 artifact for a diligence step — the real PE deliverable.
// Loads lazily (server-cached per deal+step); D2/D3 carry an AI narrative and can
// be regenerated.
export function DealArtifactPanel({ dealId, step }: { dealId: string; step: string }) {
  const [artifact, setArtifact] = useState<DealArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const meta = STEP_META[step];

  const load = (force = false) => {
    setLoading(true);
    api.dealArtifact(dealId, step, force)
      .then(setArtifact)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, step]);

  const aiStep = step === 'D2' || step === 'D3';
  return (
    <div className="dartifact">
      <div className="dartifact-hd">
        <span className="dartifact-ic">{meta?.ic}</span>
        <span className="dartifact-title">{meta?.label}</span>
        {artifact && 'generated' in artifact && (
          <span className={`artifact-src ${artifact.generated ? 'ai' : ''}`}>{artifact.generated ? '✦ AI-written' : 'grounded'}</span>
        )}
        {aiStep && <button className="artifact-refresh" onClick={() => load(true)} disabled={loading} title="Regenerate">↻</button>}
      </div>
      {loading && !artifact && <div className="artifact-loading">Building the {meta?.label.toLowerCase()}…</div>}
      {artifact?.kind === 'plan' && <PlanView a={artifact as DiligencePlan} />}
      {artifact?.kind === 'findings' && <FindingsView a={artifact as FindingsReport} />}
      {artifact?.kind === 'ic-memo' && <FinalMemoView a={artifact as FinalIcMemo} />}
      {artifact?.kind === 'execution' && <ExecutionView a={artifact as ExecutionPack} />}
      {artifact?.kind === 'closeout' && <CloseoutView a={artifact as CloseoutPlan} />}
    </div>
  );
}

const M = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${Math.round(n)}M`);

// ---- D1 · Diligence Plan ---------------------------------------------------
const TIER_CLS: Record<string, string> = { critical: 'crit', high: 'high', standard: 'std', confirmatory: 'conf' };
function PlanView({ a }: { a: DiligencePlan }) {
  return (
    <div className="dplan">
      <div className="dplan-headline">{a.headline}</div>
      <div className="dsec-label">Workstreams · scoped & prioritized from the deal's key risks</div>
      <div className="dplan-ws">
        {a.workstreams.map((w) => (
          <div className={`dplan-wsrow ${TIER_CLS[w.tier]}`} key={w.key}>
            <span className={`dplan-tier ${TIER_CLS[w.tier]}`}>{w.tier}</span>
            <div className="dplan-wsmain">
              <div className="dplan-wslabel">{w.label}</div>
              <div className="dplan-wsscope">{w.scope}</div>
              <div className="dplan-wsadv">Adviser: {w.adviser}</div>
              {w.focus && <div className="dplan-wsfocus">▲ {w.focus}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="dplan-cols">
        <div className="dplan-block">
          <div className="dsec-label">DD budget <span className="dsec-sub">{M(a.budgetTotal)} third-party spend</span></div>
          {a.budget.map((b) => (
            <div className="dplan-budrow" key={b.item}><span>{b.item}</span><span className="dplan-budamt">{M(b.amount)}</span></div>
          ))}
        </div>
        <div className="dplan-block">
          <div className="dsec-label">Timeline <span className="dsec-sub">{a.timeline.exclusivityWeeks}-week exclusivity · {a.timeline.irlItems} IRL items</span></div>
          {a.timeline.phases.map((p) => (
            <div className="dplan-phase" key={p.name}>
              <div className="dplan-phase-hd"><b>{p.name}</b><span>{p.window}</span></div>
              <div className="dplan-phase-detail">{p.detail}</div>
            </div>
          ))}
          <div className="dplan-vdr">VDR: {a.dataRoom.platform} · {a.dataRoom.sections} sections. {a.dataRoom.note}</div>
        </div>
      </div>
    </div>
  );
}

// ---- D2 · Findings / Red-Flag Report ---------------------------------------
const SEV_CLS: Record<string, string> = { stopper: 'stopper', reprice: 'reprice', condition: 'condition', monitor: 'monitor', clear: 'clear' };
function FindingsView({ a }: { a: FindingsReport }) {
  return (
    <div className="dfind">
      <div className={`dfind-headline ${a.status === 'blocked' ? 'bad' : a.status === 'reprice' ? 'warn' : 'ok'}`}>{a.headline}</div>
      {a.synthesis && (
        <div className="dfind-synth">
          <div>{a.synthesis}</div>
          {a.goNoGo && <div className="dfind-gonogo">→ {a.goNoGo}</div>}
        </div>
      )}
      <div className="dfind-tally">
        {(['stopper', 'reprice', 'condition', 'monitor', 'clear'] as const).map((k) => (
          <span className={`dfind-chip ${SEV_CLS[k]}`} key={k}>{a.counts[k] || 0} {a.legend[k]}</span>
        ))}
      </div>
      <div className="dfind-groups">
        {a.groups.map((g) => (
          <div className="dfind-group" key={g.key}>
            <div className="dfind-group-hd">
              <span className="dfind-group-label">{g.label}</span>
              <span className={`dfind-worst ${SEV_CLS[g.worst]}`}>{a.legend[g.worst]}</span>
            </div>
            {g.findings.map((f, i) => (
              <div className="dfind-item" key={i}>
                <span className={`dfind-dot ${SEV_CLS[f.severity]}`} />
                <div>
                  <div className="dfind-text">{f.finding}</div>
                  {f.impact && <div className="dfind-impact">→ {f.impact}</div>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- D3 · Final IC Memo ----------------------------------------------------
function FinalMemoView({ a }: { a: FinalIcMemo }) {
  const r = a.returns;
  const b = r.scenarios;
  const recCls = a.recommendation === 'APPROVE' ? 'approve' : a.recommendation === 'DECLINE' ? 'decline' : 'conditional';
  return (
    <div className="memo">
      <div className={`memo-rec ${recCls === 'decline' ? 'pass' : 'pursue'}`}>
        <span className="memo-rec-badge">{a.recommendation === 'APPROVE' ? '✓ APPROVE' : a.recommendation === 'DECLINE' ? '✕ DECLINE' : '◐ CONDITIONAL'}</span>
        <span className="memo-rec-text">{a.execSummary}</span>
      </div>

      <div className="memo-block">
        <div className="memo-block-hd">Diligence-backed returns <span className="memo-sub">{r.entryMultiple}x entry · {r.leverage} leverage · {r.holdYears}-yr hold · off QoE-adjusted EBITDA {M(a.financials.adjustedEbitda)}</span></div>
        <div className="memo-lbo">
          <div className="memo-lbo-hdr"><span>Scenario</span><span>MOIC</span><span>IRR</span><span>Exit EV</span></div>
          {(['downside', 'base', 'upside'] as const).map((k) => (
            <div className={`memo-lbo-row ${k}`} key={k}>
              <span className="memo-lbo-scn">{k}</span>
              <span className={b[k].moic >= r.hurdle.moic ? 'memo-hit' : 'memo-miss'}>{b[k].moic}x</span>
              <span className={b[k].irr >= r.hurdle.irr ? 'memo-hit' : 'memo-miss'}>{b[k].irr}%</span>
              <span>{M(b[k].exitEV)}</span>
            </div>
          ))}
          <div className="memo-lbo-hurdle">{a.hurdle.note}</div>
        </div>
      </div>

      <div className="memo-cols">
        <div className="memo-block">
          <div className="memo-block-hd">Investment thesis</div>
          <div className="memo-text">{a.thesis}</div>
        </div>
        <div className="memo-block">
          <div className="memo-block-hd">Value-creation plan</div>
          <ul className="memo-dd">{a.valueCreation.map((v, i) => <li key={i}>{v}</li>)}</ul>
        </div>
      </div>

      <div className="memo-block">
        <div className="memo-block-hd">Diligence findings synthesis</div>
        <div className="memo-synth">
          {a.synthesis.map((s, i) => (
            <div className="memo-synth-row" key={i}>
              <span className="memo-synth-ws">{s.workstream}</span>
              <span className={`memo-synth-sev ${sevWord(s.worst)}`}>{s.worst}</span>
              <span className="memo-synth-top">{s.top}</span>
            </div>
          ))}
        </div>
      </div>

      {a.keyRisks.length > 0 && (
        <div className="memo-block">
          <div className="memo-block-hd">Key risks & mitigants</div>
          <div className="memo-risks">
            {a.keyRisks.map((risk, i) => (
              <div className="memo-risk" key={i}><span className="memo-risk-r">⚠ {risk.risk}</span><span className="memo-risk-m">→ {risk.mitigant}</span></div>
            ))}
          </div>
        </div>
      )}

      <div className="memo-cols">
        <div className="memo-block">
          <div className="memo-block-hd">Exit analysis</div>
          {a.exitRationale && <div className="memo-text" style={{ marginBottom: 6 }}>{a.exitRationale}</div>}
          {a.exit.routes.map((rt, i) => (
            <div className="memo-exit-row" key={i}><b>{rt.route}</b> — {rt.note}</div>
          ))}
        </div>
        <div className="memo-block">
          <div className="memo-block-hd">IC authorization sought</div>
          <div className="memo-ask">{a.ask}</div>
        </div>
      </div>
    </div>
  );
}
function sevWord(label: string) {
  const t = label.toLowerCase();
  return t.includes('stopper') ? 'stopper' : t.includes('price') ? 'reprice' : t.includes('condition') ? 'condition' : t.includes('clean') ? 'clear' : 'monitor';
}

// ---- D4 · Execution Pack ---------------------------------------------------
function ExecutionView({ a }: { a: ExecutionPack }) {
  const totalSources = a.fundsFlow.sources.reduce((s, x) => s + x.amount, 0);
  const totalUses = a.fundsFlow.uses.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="dexec">
      <div className="dexec-headline">{a.headline}</div>

      <div className="dexec-ic">
        <span className="dexec-ic-badge">IC · {a.icDecision.status}</span>
        <span className="dexec-ic-text">{a.icDecision.vote} {a.icDecision.champion}</span>
      </div>

      <div className="dplan-cols">
        <div className="dplan-block">
          <div className="dsec-label">Definitive agreement (SPA) · key terms</div>
          {a.spaTerms.map((t) => (
            <div className="dexec-term" key={t.term}><span className="dexec-term-k">{t.term}</span><span className="dexec-term-v">{t.detail}</span></div>
          ))}
          <div className="dexec-rwi">R&W insurance: {a.rwi.note} Premium {a.rwi.premiumPct}, retention {a.rwi.retentionPct}.</div>
        </div>
        <div className="dplan-block">
          <div className="dsec-label">Conditions precedent to closing</div>
          {a.conditionsPrecedent.map((c) => (
            <div className="dexec-cp" key={c.item}>
              <span className={`dexec-cp-status ${cpCls(c.status)}`}>{c.status}</span>
              <div><div className="dexec-cp-item">{c.item}</div><div className="dexec-cp-detail">{c.detail}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="dplan-cols">
        <div className="dplan-block">
          <div className="dsec-label">Funds flow · sources</div>
          {a.fundsFlow.sources.map((s) => (
            <div className="dexec-ff" key={s.label}><span>{s.label}</span><span className="dexec-ff-amt">{M(s.amount)}</span></div>
          ))}
          <div className="dexec-ff total"><span>Total sources</span><span className="dexec-ff-amt">{M(totalSources)}</span></div>
        </div>
        <div className="dplan-block">
          <div className="dsec-label">Funds flow · uses</div>
          {a.fundsFlow.uses.map((u) => (
            <div className="dexec-ff" key={u.label}><span>{u.label}</span><span className="dexec-ff-amt">{M(u.amount)}</span></div>
          ))}
          <div className="dexec-ff total"><span>Total uses</span><span className="dexec-ff-amt">{M(totalUses)}</span></div>
        </div>
      </div>

      <div className="dplan-block">
        <div className="dsec-label">Compliance & governance</div>
        <div className="dexec-comp">
          {a.compliance.map((c) => (
            <span className="dexec-comp-item" key={c.check}><span className="dexec-comp-dot" /> {c.check} <em>({c.framework})</em> · {c.status}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
function cpCls(status: string) {
  const t = status.toLowerCase();
  return t.includes('committed') || t.includes('effect') ? 'ok' : t.includes('required') || t.includes('pending') ? 'warn' : 'na';
}

// ---- D5 · Close-out & 100-Day Plan -----------------------------------------
function CloseoutView({ a }: { a: CloseoutPlan }) {
  return (
    <div className="dclose">
      <div className="dclose-headline">{a.headline}</div>

      <div className="dsec-label">100-day plan</div>
      <div className="dclose-100">
        {a.hundredDay.map((p) => (
          <div className="dclose-phase" key={p.phase}>
            <div className="dclose-phase-hd">{p.phase}</div>
            <ul className="dclose-items">{p.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="dplan-cols">
        <div className="dplan-block">
          <div className="dsec-label">Value-creation levers</div>
          {a.valueCreation.map((v) => (
            <div className="dclose-lever" key={v.lever}><span className="dclose-lever-k">{v.lever}</span><span className="dclose-lever-v">{v.target}</span></div>
          ))}
        </div>
        <div className="dplan-block">
          <div className="dsec-label">Governance</div>
          <div className="dclose-gov"><b>Board:</b> {a.governance.board}</div>
          <div className="dclose-gov"><b>MIP:</b> {a.governance.mip}</div>
          <div className="dclose-gov"><b>Reporting:</b> {a.governance.reporting}</div>
        </div>
      </div>

      <div className="dplan-block">
        <div className="dsec-label">Records & archive</div>
        {a.records.map((r) => (
          <div className="dclose-rec" key={r.item}><span className="dclose-rec-k">📁 {r.item}</span><span className="dclose-rec-v">{r.detail}</span></div>
        ))}
      </div>
    </div>
  );
}
