import { useState } from 'react';
import type { Flow, Deal, DealSummary, AppConfig } from '../types';

interface Props {
  flow: Flow;
  deal: Deal;
  deals: DealSummary[];
  viewStep: string;
  onSelect: (key: string) => void;
  onPickDeal: (id: string) => void;
  config: AppConfig | null;
}

export function FlowNav({ flow, deal, deals, viewStep, onSelect, onPickDeal, config }: Props) {
  const stepKeys = flow.steps.map((s) => s.key);
  const currentIdx = deal.stepIndex;
  const gateIdx = stepKeys.indexOf(flow.gate.afterStep);
  const stage2Deals = deals.filter((d) => d.stageId === 'diligence');
  const postGateCount = deals.filter((d) => d.status === 'screened' || d.stageId === 'diligence').length;

  const stateOf = (key: string) => {
    const i = stepKeys.indexOf(key);
    if (i < currentIdx) return 'done';
    if (i === currentIdx) return 'current';
    return 'upcoming';
  };

  return (
    <aside className="spine">
      <div className="spine-brand">
        <div className="logo">DR</div>
        <div>
          <div className="nm">The Deal Room</div>
          <div className="tg">Private Markets · AI</div>
        </div>
      </div>

      <button className={`spine-home ${viewStep === 'HOME' ? 'active' : ''}`} onClick={() => onSelect('HOME')}>
        <span className="sh-ic">⌂</span>
        <span>Home</span>
      </button>

      {flow.stages.map((stage) => {
        const steps = flow.steps.filter((s) => s.stage === stage.id);
        return (
          <div key={stage.id}>
            <div className="spine-stage">
              <div className="spine-stage-hd">
                <span className="sn" style={{ background: stage.accent }}>Stage {stage.num}</span>
                <span className="st">{stage.name}</span>
              </div>

              {stage.id === 'diligence' && (
                <DealSelect deals={stage2Deals} deal={deal} onPick={onPickDeal} />
              )}

              {steps.map((step) => {
                const s = stateOf(step.key);
                const isLast = stepKeys.indexOf(step.key) === stepKeys.length - 1;
                return (
                  <button
                    key={step.key}
                    className={`spine-step ${s} ${viewStep === step.key ? 'current' : ''}`}
                    onClick={() => onSelect(step.key)}
                  >
                    <span className="node">{s === 'done' ? '✓' : step.code}</span>
                    <span className="lab">
                      <span className="t">{step.title}</span>
                      <span className="o">{step.owner}</span>
                    </span>
                    {!isLast && <span className="rail" />}
                  </button>
                );
              })}
            </div>

            {stage.id === 'origination' && (
              <>
                <div className={`spine-gate ${currentIdx > gateIdx ? 'passed' : ''}`}>
                  <span className="bolt">⚡</span>
                  {flow.gate.label}
                  <span className="gx">{currentIdx > gateIdx ? 'space live' : 'gate'}</span>
                </div>
                <button
                  className={`spine-step ready ${viewStep === 'READY' ? 'current' : ''}`}
                  onClick={() => onSelect('READY')}
                >
                  <span className="node">5</span>
                  <span className="lab">
                    <span className="t">Deals Ready</span>
                    <span className="o">post-gate roster · {postGateCount}</span>
                  </span>
                </button>
              </>
            )}
          </div>
        );
      })}

      <div className="spine-foot">
        {config && (
          <div className={`mode-chip ${config.mode}`}>
            <span className="dot" />
            {config.mode === 'live' ? (
              <span><b>Live AI</b> · {config.model}</span>
            ) : (
              <span><b>Demo mode</b> · seeded AI responses</span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* Active-deal selector — the dropdown moved out of the top bar into the nav. */
function DealSelect({ deals, deal, onPick }: { deals: DealSummary[]; deal: Deal; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="spine-dealsel">
      <div className="sds-label">Active deal</div>
      <button className="sds-btn" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 160)}>
        <span className="sds-co">{deal.company}</span>
        <span className="sds-meta">{deal.currency} {deal.dealSize}M · D{deal.stageStepNumber}</span>
        <span className="sds-cx">▾</span>
      </button>
      {open && (
        <div className="sds-menu">
          {deals.map((d) => (
            <div
              key={d.id}
              className={`sds-opt ${d.id === deal.id ? 'sel' : ''}`}
              onMouseDown={() => { onPick(d.id); setOpen(false); }}
            >
              <span className="sds-co">{d.company}</span>
              <span className="sds-opt-meta">{d.currency} {d.dealSize}M</span>
              <span className="sds-stg">D{d.stageStepNumber}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
