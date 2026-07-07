import { useEffect, useState } from 'react';
import type { CandidateArtifact, Scorecard, TriageScorecard, ScreeningMemo } from '../types';
import { api } from '../api';

// The expandable stage artifact rendered inside a cohort row — the real PE
// deliverable for that funnel step. O2 -> Investment-Criteria Scorecard,
// O3 -> Triage Scorecard, O4 -> IC Pre-Screen Memo. Loads lazily on expand
// (server-cached per candidate) and can be refreshed.
export function CandidateArtifactPanel({ id, stage }: { id: string; stage: 'O2' | 'O3' | 'O4' }) {
  const [artifact, setArtifact] = useState<CandidateArtifact | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (force = false) => {
    setLoading(true);
    api.candidateArtifact(id, force)
      .then(setArtifact)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stage]);

  const label = stage === 'O2' ? 'Investment-Criteria Scorecard' : stage === 'O3' ? 'Triage Scorecard' : 'IC Pre-Screen Memo';

  return (
    <div className="artifact">
      <div className="artifact-hd">
        <span className="artifact-ic">{stage === 'O2' ? '☑' : stage === 'O3' ? '⚖' : '▤'}</span>
        <span className="artifact-title">{label}</span>
        {artifact && 'generated' in artifact && (
          <span className={`artifact-src ${artifact.generated ? 'ai' : ''}`}>{artifact.generated ? '✦ AI-written' : 'grounded'}</span>
        )}
        {stage !== 'O2' && (
          <button className="artifact-refresh" onClick={() => load(true)} disabled={loading} title="Regenerate">↻</button>
        )}
      </div>
      {loading && !artifact && <div className="artifact-loading">Building the {label.toLowerCase()}…</div>}
      {artifact?.kind === 'scorecard' && <ScorecardView a={artifact as Scorecard} />}
      {artifact?.kind === 'triage' && <TriageView a={artifact as TriageScorecard} />}
      {artifact?.kind === 'memo' && <MemoView a={artifact as ScreeningMemo} />}
    </div>
  );
}

// ---- O2 · Investment-Criteria Scorecard ------------------------------------
const ST_ICON: Record<string, string> = { pass: '✓', flag: '▲', fail: '✕' };
function ScorecardView({ a }: { a: Scorecard }) {
  const hard = a.rows.filter((r) => r.group === 'hard');
  const soft = a.rows.filter((r) => r.group === 'soft');
  return (
    <div className="sc">
      <div className={`sc-headline ${a.recommendation === 'advance' ? 'ok' : 'bad'}`}>
        {a.recommendation === 'advance' ? '✓ Clears the hard screen' : '✕ Fails the hard screen'} — {a.headline}
      </div>
      <div className="sc-group-label">Hard knockouts <span className="sc-count">{a.summary.hardCleared}/{a.summary.hardTotal} cleared</span></div>
      <div className="sc-rows">
        {hard.map((r) => (
          <div className={`sc-row ${r.status}`} key={r.key}>
            <span className={`sc-mark ${r.status}`}>{ST_ICON[r.status]}</span>
            <span className="sc-label">{r.label}</span>
            <span className="sc-value">{r.value}</span>
            <span className="sc-detail">{r.detail}</span>
          </div>
        ))}
      </div>
      <div className="sc-group-label">Soft flags <span className="sc-count">{a.summary.softFlags} to note</span></div>
      <div className="sc-rows">
        {soft.map((r) => (
          <div className={`sc-row ${r.status}`} key={r.key}>
            <span className={`sc-mark ${r.status}`}>{ST_ICON[r.status]}</span>
            <span className="sc-label">{r.label}</span>
            <span className="sc-value">{r.value}</span>
            <span className="sc-detail">{r.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- O3 · Triage Scorecard -------------------------------------------------
const TIER_CLS: Record<string, string> = { A: 'a', B: 'b', C: 'c' };
function TriageView({ a }: { a: TriageScorecard }) {
  return (
    <div className="tri">
      <div className="tri-top">
        <div className={`tri-tier t-${TIER_CLS[a.tier]}`}>
          <div className="tri-tier-letter">{a.tier}</div>
          <div className="tri-tier-score">{a.composite}<span>/100</span></div>
        </div>
        <div className="tri-top-main">
          <div className="tri-tier-label">{a.tierLabel}</div>
          <div className="tri-headline">{a.headline}</div>
        </div>
      </div>

      <div className="tri-dims">
        {a.dims.map((d) => (
          <div className="tri-dim" key={d.key}>
            <div className="tri-dim-hd">
              <span className="tri-dim-label">{d.label}</span>
              <span className="tri-dim-wt">{Math.round(d.pct * 100)}% · wt {d.weight}</span>
            </div>
            <div className="tri-dim-bar"><i className={pctBand(d.pct)} style={{ width: `${Math.round(d.pct * 100)}%` }} /></div>
            <div className="tri-dim-note">{d.note}</div>
          </div>
        ))}
      </div>

      <div className="tri-brief">
        <div className="tri-brief-row"><span className="tri-brief-k">Angle</span><span>{a.brief.angle}</span></div>
        <div className="tri-brief-row"><span className="tri-brief-k">Why now</span><span>{a.brief.whyNow}</span></div>
        {a.brief.watchouts?.length > 0 && (
          <div className="tri-brief-row"><span className="tri-brief-k">Watch-outs</span>
            <span className="tri-watchouts">{a.brief.watchouts.map((w, i) => <span className="tri-watch" key={i}>⚑ {w}</span>)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
function pctBand(p: number) { return p >= 0.66 ? 'strong' : p >= 0.4 ? 'moderate' : 'weak'; }

// ---- O4 · IC Pre-Screen Memo -----------------------------------------------
function MemoView({ a }: { a: ScreeningMemo }) {
  const r = a.returns;
  const b = r.scenarios;
  return (
    <div className="memo">
      <div className={`memo-rec ${a.recommendation === 'PURSUE' ? 'pursue' : 'pass'}`}>
        <span className="memo-rec-badge">{a.recommendation === 'PURSUE' ? '⚡ PURSUE' : '✕ PASS'}</span>
        <span className="memo-rec-text">{a.execSummary}</span>
      </div>

      {/* Paper-LBO returns */}
      <div className="memo-block">
        <div className="memo-block-hd">Preliminary valuation & returns <span className="memo-sub">paper LBO · {r.entryMultiple}x entry · {r.leverage} leverage · {r.holdYears}-yr hold</span></div>
        {r.entryAboveCeiling && (
          <div className="memo-warn">Implied ask ≈ {r.impliedMultiple}x is above the financeable ceiling — modelled at {r.entryMultiple}x (entry must be reset).</div>
        )}
        <div className="memo-lbo">
          <div className="memo-lbo-hdr"><span>Scenario</span><span>MOIC</span><span>IRR</span><span>Exit EV</span></div>
          {(['downside', 'base', 'upside'] as const).map((k) => (
            <div className={`memo-lbo-row ${k}`} key={k}>
              <span className="memo-lbo-scn">{k}</span>
              <span className={hitClass(b[k].moic >= r.hurdle.moic)}>{b[k].moic}x</span>
              <span className={hitClass(b[k].irr >= r.hurdle.irr)}>{b[k].irr}%</span>
              <span>${b[k].exitEV}M</span>
            </div>
          ))}
          <div className="memo-lbo-hurdle">Hurdle: ≥{r.hurdle.moic}x MOIC · ≥{r.hurdle.irr}% IRR (base) — {r.meetsHurdle ? '✓ clears' : '✕ misses'}</div>
        </div>
      </div>

      <div className="memo-cols">
        <div className="memo-block">
          <div className="memo-block-hd">Sourcing angle</div>
          <div className="memo-text">{a.sourcingAngle}</div>
        </div>
        <div className="memo-block">
          <div className="memo-block-hd">Investment thesis</div>
          <div className="memo-text">{a.thesis}</div>
          {a.marketRead && <div className="memo-text muted">{a.marketRead}</div>}
        </div>
      </div>

      <div className="memo-block">
        <div className="memo-block-hd">Key risks & mitigants</div>
        <div className="memo-risks">
          {a.keyRisks.map((risk, i) => (
            <div className="memo-risk" key={i}>
              <span className="memo-risk-r">⚠ {risk.risk}</span>
              <span className="memo-risk-m">→ {risk.mitigant}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="memo-cols">
        <div className="memo-block">
          <div className="memo-block-hd">Diligence priorities</div>
          <ol className="memo-dd">{a.diligencePriorities.map((d, i) => <li key={i}>{d}</li>)}</ol>
        </div>
        <div className="memo-block">
          <div className="memo-block-hd">Deal team & ask</div>
          <div className="memo-text">{a.dealTeam}</div>
          <div className="memo-ask">{a.ask}</div>
        </div>
      </div>
    </div>
  );
}
function hitClass(hit: boolean) { return hit ? 'memo-hit' : 'memo-miss'; }
