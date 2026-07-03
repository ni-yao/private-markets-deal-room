import type { DealSummary, Deal, PipelineFunnel, Flow } from '../types';

interface Props {
  deals: DealSummary[];
  deal: Deal | null;
  stageId: string;
  pipeline: PipelineFunnel | null;
  flow: Flow;
  onFunnelClick?: (stageKey: string) => void;
}

// The top bar is stage-aware:
//   Stage 1 (origination) is a FUNNEL — you are discovering which companies
//   could become deals, so it shows the narrowing sourcing funnel.
//   Stage 2 (diligence) is about DEALS in flight — so it shows how many deals
//   sit in each diligence step, with the active deal highlighted. The deal
//   selector itself lives in the left nav.
export function DealBar({ deals, deal, stageId, pipeline, flow, onFunnelClick }: Props) {
  if (stageId === 'origination') {
    return <PipelineBar pipeline={pipeline} onFunnelClick={onFunnelClick} />;
  }
  return <StageTwoBar deals={deals} deal={deal} flow={flow} />;
}

/* ---------------- Stage 1 · Origination funnel ---------------- */
function PipelineBar({ pipeline, onFunnelClick }: { pipeline: PipelineFunnel | null; onFunnelClick?: (k: string) => void }) {
  if (!pipeline) {
    return (
      <div className="dealbar pipeline">
        <div className="pl-fund"><div className="co">Origination pipeline</div><div className="mt">loading funnel…</div></div>
      </div>
    );
  }
  return (
    <div className="dealbar pipeline">
      <div className="pl-fund">
        <div className="co">{pipeline.fundName}</div>
        <div className="mt">Origination funnel · click a stage to open the pipeline</div>
      </div>

      <div className="grow" />

      <div className="funnel" title="The screening funnel filters many candidates down to a gate-ready shortlist — click a stage to filter the pipeline">
        {pipeline.funnel.map((f, i) => (
          <div className="fn-wrap" key={f.key}>
            <button className={`fn-stage clickable ${f.key.toLowerCase()}`} onClick={() => onFunnelClick?.(f.key)}>
              <div className="fn-count">{f.count}</div>
              <div className="fn-label">{f.label}</div>
              <div className="fn-step">{f.key} · {f.step}{typeof f.active === 'number' && f.active > 0 ? ` · ${f.active} active` : ''}</div>
            </button>
            {i < pipeline.funnel.length - 1 && <span className="fn-arrow">›</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Stage 2 · Deals-in-diligence distribution ---------------- */
function StageTwoBar({ deals, deal, flow }: { deals: DealSummary[]; deal: Deal | null; flow: Flow }) {
  const dSteps = flow.steps.filter((s) => s.stage === 'diligence');
  const inDiligence = deals.filter((d) => d.stageId === 'diligence');
  const countFor = (key: string) => inDiligence.filter((d) => d.stage === key).length;

  return (
    <div className="dealbar stagetwo">
      <div className="pl-fund">
        <div className="s2-eyebrow">Diligence &amp; Approval</div>
        <div className="co">{deal ? deal.company : 'No deal selected'}</div>
        <div className="mt">{deal ? `${deal.currency} ${deal.dealSize}M · ${deal.sector}` : 'Pursue a company through the Screening Gate to start diligence'}</div>
      </div>

      <div className="grow" />

      <div className="dist" title="How many deals currently sit in each diligence step">
        {dSteps.map((s) => {
          const active = deal ? s.key === deal.stage : false;
          return (
            <div className={`dist-stage ${active ? 'active' : ''}`} key={s.key}>
              <div className="dist-count">{countFor(s.key)}</div>
              <div className="dist-label">{s.title}</div>
              <div className="dist-step">D{s.code}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
