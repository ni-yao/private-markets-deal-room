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
import { NewsSignals } from './components/NewsSignals';
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
  const [icBlock, setIcBlock] = useState<import('./types').ICGateBlock | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);
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
      // Deep-link: a Teams channel (or a shared link) can scope to one deal via
      // ?deal=<id> — open that deal's workspace; otherwise land on Home.
      const wantDeal = new URLSearchParams(window.location.search).get('deal');
      const scoped = !!wantDeal && ds.some((d) => d.id === wantDeal);
      const target = scoped ? wantDeal! : ds[0]?.id;
      if (target) {
        const d = await api.deal(target);
        setDeal(d);
        setViewStep(scoped ? d.currentStep : HOME);
      } else {
        setViewStep(HOME);
      }
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

  async function recordContribution(body: { lane: string; kind: string; text: string; severity?: string; source?: string; md?: string }) {
    if (!deal) return;
    const d = await api.recordContribution(deal.id, body);
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
    const res = await api.advance(deal.id);
    if (!res.ok) {
      setGate(false);
      setIcBlock(res.blocked); // IC-readiness gate blocked — open the override modal
      return;
    }
    await api.deals().then(setDeals);
    const finish = () => {
      setDeal(res.deal);
      setViewStep(res.deal.currentStep);
      setGate(false);
    };
    if (isGate) setTimeout(finish, 1500);
    else finish();
  }

  async function submitOverride() {
    if (!deal || !icBlock || !overrideReason.trim()) return;
    setOverriding(true);
    try {
      const res = await api.advance(deal.id, overrideReason.trim());
      if (!res.ok) return; // still blocked (shouldn't happen for a partner override)
      await api.deals().then(setDeals);
      setDeal(res.deal);
      setViewStep(res.deal.currentStep);
      setIcBlock(null);
      setOverrideReason('');
    } finally {
      setOverriding(false);
    }
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
              <NewsSignals onBack={() => setNewsOpen(false)} />
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
                onContribute={recordContribution}
                onCycleChecklist={cycleChecklist}
                onDealUpdate={(d) => { setDeal(d); api.deals().then(setDeals); }}
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

      {icBlock && (
        <div className="gate-overlay" onClick={() => !overriding && setIcBlock(null)}>
          <div className="ic-override" onClick={(e) => e.stopPropagation()}>
            <div className="ico-head">
              <span className="ico-badge">IC GATE</span>
              <h2>{icBlock.gate === 'ic-approval' ? 'IC approval blocked' : 'Cannot enter IC — not ready'}</h2>
            </div>
            <p className="ico-headline">{icBlock.verdict?.headline}</p>
            {icBlock.verdict?.gating?.length > 0 && (
              <ul className="ico-gating">
                {icBlock.verdict.gating.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            )}
            <p className="ico-note">Only the <b>Partner / Deal Sponsor</b> may override this gate, and the reason is recorded as an audit event on the deal.</p>
            <textarea
              className="ico-reason"
              placeholder="Partner override reason (required) — e.g. Board pre-cleared; QoE lands before committee"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={3}
            />
            <div className="ico-actions">
              <button className="btn" onClick={() => { setIcBlock(null); setOverrideReason(''); }} disabled={overriding}>Cancel</button>
              <button className="btn danger" onClick={submitOverride} disabled={overriding || !overrideReason.trim()}>
                {overriding ? 'Overriding…' : 'Partner override & proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
