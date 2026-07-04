import { useEffect, useState } from 'react';
import type { Pipeline as PipelineData, Candidate } from '../types';
import { api } from '../api';

interface Props {
  initialStage?: string | null;   // deep-link filter from a clicked funnel segment
}

const STAGE_LABEL: Record<string, string> = { O2: 'Auto Screen', O3: 'Triage', O4: 'Screening Gate', pursued: 'Pursued' };
const DISPO_LABEL: Record<string, string> = { active: 'Active', passed: 'Passed', parked: 'Parked', pursued: 'Pursued' };

// The whole Stage-1 origination pipeline as a filterable table — every candidate,
// where it sits, and (if killed) why. This is the institutional-memory view.
export function Pipeline({ initialStage }: Props) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [stageF, setStageF] = useState<string>('all');
  const [dispoF, setDispoF] = useState<string>('all');

  useEffect(() => {
    api.stage1Pipeline().then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    if (initialStage) { setStageF(initialStage); setDispoF('all'); }
  }, [initialStage]);

  if (!data) return <div className="pipe-page"><div className="finding empty">Loading pipeline…</div></div>;

  const rows = data.candidates.filter((c) => {
    // Stage filter is "reached this stage" for funnel segments; exact for pursued.
    const stageOk = stageF === 'all'
      || (stageF === 'pursued' ? c.disposition === 'pursued' : reached(c, stageF));
    const dispoOk = dispoF === 'all' || c.disposition === dispoF;
    return stageOk && dispoOk;
  });

  const counts = {
    total: data.candidates.length,
    active: data.candidates.filter((c) => c.disposition === 'active').length,
    passed: data.candidates.filter((c) => c.disposition === 'passed').length,
    parked: data.candidates.filter((c) => c.disposition === 'parked').length,
    pursued: data.candidates.filter((c) => c.disposition === 'pursued').length
  };

  return (
    <div className="pipe-page">
      <div className="pipe-head">
        <div>
          <h2>Origination pipeline</h2>
          <p>Every Stage-1 candidate scoped to <b>{data.fundName}</b> — where it sits in the funnel and, if it was killed, why.</p>
        </div>
        <div className="pipe-tallies">
          <Tally n={counts.total} l="Sourced" />
          <Tally n={counts.active} l="Active" accent="blue" />
          <Tally n={counts.pursued} l="Pursued" accent="green" />
          <Tally n={counts.passed} l="Passed" accent="red" />
          <Tally n={counts.parked} l="Parked" accent="amber" />
        </div>
      </div>

      <div className="pipe-filters">
        <label>Stage
          <select value={stageF} onChange={(e) => setStageF(e.target.value)}>
            <option value="all">All stages</option>
            <option value="O2">Reached O2 · Auto Screen</option>
            <option value="O3">Reached O3 · Triage</option>
            <option value="O4">Reached O4 · Gate</option>
            <option value="pursued">Pursued</option>
          </select>
        </label>
        <label>Disposition
          <select value={dispoF} onChange={(e) => setDispoF(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="pursued">Pursued</option>
            <option value="passed">Passed</option>
            <option value="parked">Parked</option>
          </select>
        </label>
        <span className="pipe-count">{rows.length} of {counts.total}</span>
      </div>

      <div className="pipe-table">
        <div className="pipe-tr pipe-th">
          <span>Company</span><span>Sector · Region</span><span>EV</span><span>Financials</span>
          <span>Stage</span><span>Disposition</span><span>Score</span><span>Reason</span>
        </div>
        {rows.map((c) => <Row key={c.id} c={c} />)}
        {rows.length === 0 && <div className="finding empty" style={{ margin: 12 }}>No candidates match these filters.</div>}
      </div>
    </div>
  );
}

function reached(c: Candidate, stage: string): boolean {
  const order = ['O2', 'O3', 'O4', 'pursued'];
  const idxOf = (s: string) => order.indexOf(s);
  const reachedStage = c.disposition === 'pursued' ? 'pursued'
    : (c.disposition === 'passed' || c.disposition === 'parked') ? (c.passStage || c.stage) : c.stage;
  return idxOf(reachedStage) >= idxOf(stage);
}

function Row({ c }: { c: Candidate }) {
  return (
    <div className={`pipe-tr ${c.disposition}`}>
      <span className="pipe-co">{c.company}</span>
      <span className="pipe-dim">{c.sector} · {c.region}</span>
      <span>${c.dealSize}M</span>
      <span className="pipe-fin">${c.revenue}M rev · ${c.ebitda}M · {c.ebitdaMargin}% · {c.growth >= 0 ? '+' : ''}{c.growth}%</span>
      <span><span className={`pipe-stage s-${c.disposition === 'pursued' ? 'pursued' : (c.passStage || c.stage).toLowerCase()}`}>{STAGE_LABEL[c.disposition === 'pursued' ? 'pursued' : (c.passStage || c.stage)] || c.stage}</span></span>
      <span><span className={`pipe-dispo d-${c.disposition}`}>{DISPO_LABEL[c.disposition]}</span></span>
      <span className={`pipe-score ${c.band}`}>{c.gated ? '—' : c.score}</span>
      <span className="pipe-reason">{c.passReasonLabel || (c.disposition === 'active' ? '—' : '')}{c.passNote ? <em title={c.passNote}> · {c.passNote}</em> : null}</span>
    </div>
  );
}

function Tally({ n, l, accent }: { n: number; l: string; accent?: string }) {
  return (
    <div className="pipe-tally">
      <div className={`pipe-tally-n ${accent ?? ''}`}>{n}</div>
      <div className="pipe-tally-l">{l}</div>
    </div>
  );
}
