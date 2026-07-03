import { useEffect, useState } from 'react';
import type { AppConfig, Flow, DealSummary, Deal, PipelineFunnel, MdOption } from './types';
import { api } from './api';
import { FlowNav } from './components/FlowNav';
import { DealBar } from './components/DealBar';
import { Station } from './components/Station';
import { Home } from './components/Home';
import { DealsReady } from './components/DealsReady';
import { Pipeline } from './components/Pipeline';
import { CxoSignals } from './components/CxoSignals';
import { NewsFilings } from './components/NewsFilings';
import { AnalystReports } from './components/AnalystReports';

const HOME = 'HOME';
const READY = 'READY';
const PIPELINE = 'PIPELINE';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipeline, setPipeline] = useState<PipelineFunnel | null>(null);
  const [mdOptions, setMdOptions] = useState<MdOption[]>([]);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [viewStep, setViewStep] = useState<string>(HOME);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [gate, setGate] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const closeOverlays = () => { setSignalsOpen(false); setNewsOpen(false); setResearchOpen(false); };

  useEffect(() => {
    (async () => {
      const [cfg, fl, ds] = await Promise.all([api.config(), api.flow(), api.deals()]);
      setConfig(cfg);
      setFlow(fl);
      setDeals(ds);
      // Empty start: there may be no deals yet — the pipeline fills as real
      // companies are sourced and pursued through the Screening Gate.
      if (ds.length > 0) {
        const first = await api.deal(ds[0].id);
        setDeal(first);
      }
      // Land on the Home command centre — not whatever step the first deal is on.
      setViewStep(HOME);
      api.pipeline().then(setPipeline).catch(() => {});
      api.mdOptions().then(setMdOptions).catch(() => {});
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  // Keep the origination funnel fresh whenever a Stage-1 view (Home / O-steps /
  // Deals Launched / Pipeline) is showing — cohort actions change the counts.
  useEffect(() => {
    if (!flow || !viewStep) return;
    if (viewStep === HOME || viewStep === READY || viewStep === PIPELINE) { api.pipeline().then(setPipeline).catch(() => {}); return; }
    const s = flow.steps.find((x) => x.key === viewStep);
    if (s?.stage === 'origination') api.pipeline().then(setPipeline).catch(() => {});
  }, [viewStep, flow, signalsOpen, newsOpen, researchOpen]);

  async function pickDeal(id: string) {
    const d = await api.deal(id);
    setDeal(d);
    setViewStep(d.currentStep);
    closeOverlays();
  }

  async function goToDeal(id: string, stepKey: string) {
    const d = await api.deal(id);
    setDeal(d);
    setViewStep(stepKey);
    closeOverlays();
  }

  function navigate(key: string) {
    setViewStep(key);
    closeOverlays();
  }

  function openPipeline(stage?: string) {
    setPipelineStage(stage ?? null);
    setViewStep(PIPELINE);
    closeOverlays();
  }

  async function refreshDeal(id: string) {
    const [d, ds] = await Promise.all([api.deal(id), api.deals()]);
    setDeal(d);
    setDeals(ds);
    return d;
  }

  // A Stage-1 cohort action (screen/triage/gate/pursue/send) changed the funnel
  // and/or created a screened deal — refresh the roster + funnel counts.
  async function onCohortChanged() {
    setDeals(await api.deals());
    api.pipeline().then(setPipeline).catch(() => {});
  }

  // Launch Orchestration: provision the workspace, then open the deal at D1.
  async function launchDeal(id: string) {
    setLaunchingId(id);
    try {
      const d = await api.launchDeal(id);
      setDeal(d);
      setDeals(await api.deals());
      setViewStep('D1');
      closeOverlays();
    } finally {
      setLaunchingId(null);
    }
  }

  async function assignSwimlane(lane: string, md: string) {
    if (!deal) return;
    const d = await api.assignSwimlane(deal.id, lane, md);
    setDeal(d);
  }

  async function cycleChecklist(itemId: string) {
    if (!deal) return;
    const d = await api.cycleChecklistItem(deal.id, itemId);
    setDeal(d);
  }

  async function runStep() {
    if (!deal || running) return;
    setRunning(true);
    try {
      await api.runStep(deal.id, viewStep);
      await refreshDeal(deal.id);
    } finally {
      setRunning(false);
    }
  }

  async function advance() {
    if (!deal || !flow) return;
    const isGate = viewStep === flow.gate.afterStep;
    if (isGate) setGate(true);
    const updated = await api.advance(deal.id);
    await api.deals().then(setDeals);
    const finish = () => {
      setDeal(updated);
      setViewStep(updated.currentStep);
      setGate(false);
    };
    if (isGate) setTimeout(finish, 1500);
    else finish();
  }

  async function back() {
    if (!deal) return;
    const updated = await api.back(deal.id);
    setDeal(updated);
    setViewStep(updated.currentStep);
    await api.deals().then(setDeals);
  }

  if (!ready || !config || !flow) {
    return (
      <div className="loading">
        <div>
          <div className="spin" />
          <div>Loading The Deal Room…</div>
        </div>
      </div>
    );
  }

  const isHome = viewStep === HOME;
  const isReady = viewStep === READY;
  const isPipeline = viewStep === PIPELINE;
  const step = flow.steps.find((s) => s.key === viewStep) || flow.steps[0];
  const stage = flow.stages.find((s) => s.id === step.stage) || flow.stages[0];
  const barStageId = (isReady || isPipeline) ? 'origination' : step.stage;
  const viewIdx = flow.steps.findIndex((s) => s.key === viewStep);
  const relation: 'done' | 'current' | 'upcoming' =
    !deal ? 'upcoming' : viewIdx < deal.stepIndex ? 'done' : viewIdx === deal.stepIndex ? 'current' : 'upcoming';

  return (
    <div className="app">
      <FlowNav
        flow={flow}
        deal={deal}
        deals={deals}
        viewStep={viewStep}
        onSelect={navigate}
        onPickDeal={pickDeal}
        onOpenPipeline={() => openPipeline()}
        config={config}
      />
      <div className="main">
        {isHome ? (
          <Home config={config} pipeline={pipeline} deals={deals} onNavigate={navigate} onGoToDeal={goToDeal} onOpenPipeline={openPipeline} />
        ) : (
          <>
            <DealBar deals={deals} deal={deal} stageId={barStageId} pipeline={pipeline} flow={flow} onFunnelClick={(k) => openPipeline(k)} />
            {isPipeline ? (
              <Pipeline initialStage={pipelineStage} />
            ) : isReady ? (
              <DealsReady deals={deals} onGoToDeal={goToDeal} />
            ) : signalsOpen ? (
              <CxoSignals onBack={() => setSignalsOpen(false)} />
            ) : newsOpen ? (
              <NewsFilings onBack={() => setNewsOpen(false)} />
            ) : researchOpen ? (
              <AnalystReports onBack={() => setResearchOpen(false)} />
            ) : (
              <Station
                flow={flow}
                deal={deal}
                deals={deals}
                step={step}
                stage={stage}
                relation={relation}
                running={running}
                onRun={runStep}
                onAdvance={advance}
                onBack={back}
                onJumpCurrent={() => deal && setViewStep(deal.currentStep)}
                onOpenSignals={() => setSignalsOpen(true)}
                onOpenNews={() => setNewsOpen(true)}
                mdOptions={mdOptions}
                onAssignSwimlane={assignSwimlane}
                onCycleChecklist={cycleChecklist}
                onLaunchDeal={() => deal && launchDeal(deal.id)}
                launching={!!deal && launchingId === deal.id}
                launchingId={launchingId}
                onCohortChanged={onCohortChanged}
                onLaunchScreened={launchDeal}
                onOpenPipeline={() => openPipeline()}
              />
            )}
          </>
        )}
      </div>

      {gate && (
        <div className="gate-overlay">
          <div className="gate-modal">
            <div className="bolt">⚡</div>
            <h2>{flow.gate.label}</h2>
            <p>{flow.gate.detail}</p>
            <div className="spin2" />
          </div>
        </div>
      )}
    </div>
  );
}
