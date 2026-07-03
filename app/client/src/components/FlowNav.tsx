import { useState } from 'react';
import type { Flow, Deal, DealSummary, AppConfig } from '../types';

interface Props {
  flow: Flow;
  deal: Deal | null;
  deals: DealSummary[];
  viewStep: string;
  onSelect: (key: string) => void;
  onPickDeal: (id: string) => void;
  onOpenPipeline: () => void;
  config: AppConfig | null;
}

export function FlowNav({ flow, deal, deals, viewStep, onSelect, onPickDeal, onOpenPipeline, config }: Props) {
  const stepKeys = flow.steps.map((s) => s.key);
  const currentIdx = deal ? deal.stepIndex : -1;
  const stage2Deals = deals.filter((d) => d.stageId === 'diligence');

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
        // The stage header doubles as a page link: Stage 1 → the origination
        // pipeline, Stage 2 → the Deals-Launched roster.
        const headerActive = (stage.id === 'origination' && viewStep === 'PIPELINE')
          || (stage.id === 'diligence' && viewStep === 'READY');
        const onHeader = stage.id === 'origination' ? onOpenPipeline : () => onSelect('READY');
        const headerHint = stage.id === 'origination'
          ? 'all Stage-1 candidates'
          : `${stage2Deals.length} launched`;
        return (
          <div key={stage.id}>
            <div className="spine-stage">
              <button className={`spine-stage-hd link ${headerActive ? 'active' : ''}`} onClick={onHeader}>
                <span className="sn" style={{ background: stage.accent }}>Stage {stage.num}</span>
                <span className="st">{stage.name}</span>
                <span className="stage-hint">{headerHint}</span>
                <span className="stage-go">›</span>
              </button>

              {stage.id === 'diligence' && (
                stage2Deals.length > 0 && deal
                  ? <DealSelect deals={stage2Deals} deal={deal} onPick={onPickDeal} />
                  : <div className="sds-empty">No deals in diligence yet</div>
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
