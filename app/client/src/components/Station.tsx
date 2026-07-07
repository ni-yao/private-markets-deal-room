import type { Flow, FlowStep, FlowStage, Deal, DealSummary, MdOption } from '../types';
import { Md } from './Markdown';
import { timeAgo } from './Bits';
import { SourcingFramework } from './SourcingFramework';
import { ScreeningGate } from './ScreeningGate';
import { CohortDesk } from './CohortDesk';
import { Workspace } from './Workspace';
import { DealArtifactPanel } from './DealArtifacts';
import { ICCockpit } from './ICCockpit';
import { CxoSummary, NewsSummary } from './SourcingSummaries';

interface Props {
  flow: Flow;
  deal: Deal | null;
  deals: DealSummary[];
  step: FlowStep;
  stage: FlowStage;
  relation: 'done' | 'current' | 'upcoming';
  running: boolean;
  onRun: () => void;
  onAdvance: () => void;
  onBack: () => void;
  onJumpCurrent: () => void;
  onOpenSignals: () => void;
  onOpenNews: () => void;
  mdOptions: MdOption[];
  onAssignSwimlane: (lane: string, md: string) => void;
  onContribute: (body: { lane: string; kind: string; text: string; severity?: string; source?: string; md?: string }) => void;
  onCycleChecklist: (itemId: string) => void;
  onDealUpdate?: (d: Deal) => void;
  onLaunchDeal: () => void;
  launching: boolean;
  launchingId: string | null;
  onCohortChanged: () => void;
  onLaunchScreened: (id: string) => void;
  onOpenPipeline: () => void;
}

const LANE_META: Record<string, { label: string; color: string }> = {
  commercial: { label: 'Commercial', color: '#0d9488' },
  financial: { label: 'Financial / QoE', color: '#2563eb' },
  legal: { label: 'Legal', color: '#9333ea' },
  tax: { label: 'Tax', color: '#0891b2' },
  techai: { label: 'Tech / AI', color: '#7c3aed' },
  operations: { label: 'Operations', color: '#ea580c' },
  esg: { label: 'ESG', color: '#16a34a' }
};
const LANE_FALLBACK = { label: 'Workstream', color: '#64748b' };

export function Station({ flow, deal, deals, step, stage, relation, running, onRun, onAdvance, onBack, onJumpCurrent, onOpenSignals, onOpenNews, mdOptions, onAssignSwimlane, onContribute, onCycleChecklist, onDealUpdate, onLaunchDeal, launching, launchingId, onCohortChanged, onLaunchScreened, onOpenPipeline }: Props) {
  const run = deal?.stepRuns[step.key];
  const produced = relation === 'done' || !!run;
  const idx = flow.steps.findIndex((s) => s.key === step.key);
  const nextStep = flow.steps[idx + 1];
  const pillLabel = relation === 'done' ? 'Completed' : relation === 'current' ? 'In progress' : 'Upcoming';
  // Stage-1 origination steps are COHORT desks (a list is filtered), not a
  // single-deal walk — so we suppress the single-deal agent/deliverables/advance.
  const isOrigination = step.stage === 'origination';

  // Diligence steps need an active deal; on an empty pipeline there's none yet.
  if (!isOrigination && !deal) {
    return (
      <div className="station">
        <div className="st-eyebrow">
          <span className="badge" style={{ background: stage.accent }}>Stage {stage.num}</span>
          <span className="ph">{stage.name} · {stage.tagline}</span>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="pb">
            <div className="finding empty">
              No deals in diligence yet. Source companies in <b>Deal Sourcing</b>, advance them through
              the cohort funnel, and record <b>PURSUE</b> at the Screening Gate to launch a deal here.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={onOpenPipeline}>View the Stage-1 pipeline →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="station">
      <div className="st-eyebrow">
        <span className="badge" style={{ background: stage.accent }}>Stage {stage.num}</span>
        <span className="ph">{stage.name} · {stage.tagline}</span>
      </div>

      <div className="st-head">
        <span className="st-num" style={{ background: stage.accent }}>{step.code}</span>
        <div>
          <div className="st-title">{step.title}</div>
          <div className="st-owner">Owner · <b>{step.owner}</b> · orchestrated by <b>{step.agent}</b></div>
        </div>
        <div className="st-status">
          <span className={`st-pill ${relation}`}>{pillLabel}</span>
        </div>
      </div>

      <p className="st-what">{step.what}</p>

      {step.key === 'O1' ? (
        <div className="o1-summaries">
          <CxoSummary onOpen={onOpenSignals} />
          <NewsSummary onOpen={onOpenNews} />
        </div>
      ) : (
        <div className="st-grid">
          <div className="panel">
            <div className="ph"><span className="ic">↳</span><h3>Inputs</h3></div>
            <div className="pb">
              <div className="taglist">
                {step.inputs.map((t) => <span className="tag" key={t}>{t}</span>)}
              </div>
              {step.stage === 'origination' && (
                <div className="subtle">
                  Data sources: {stage.dataSources.map((g) => g.items.join(', ')).join(' · ')}
                </div>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="ph"><span className="ic">◇</span><h3>M365 + CRM · Owner</h3></div>
            <div className="pb">
              <div className="taglist">
                {step.m365.map((t) => <span className="tag m365" key={t}>{t}</span>)}
              </div>
              <div className="subtle">{step.m365Action}</div>
              {step.stage === 'origination' && (
                <div className="taglist" style={{ marginTop: 10 }}>
                  {stage.skills.map((s) => <span className="tag skill" key={s}>{s}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sourcing framework (O1 only) */}
      {step.key === 'O1' && (
        <div className="panel mand-panel">
          <div className="ph">
            <span className="ic">🎯</span>
            <h3>Sourcing framework</h3>
            <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
              fund mandate <b>gates</b> · themes <b>guide</b> · screens <b>rank</b>
            </span>
          </div>
          <div className="pb" style={{ padding: 0 }}>
            <SourcingFramework onSentToScreening={onCohortChanged} />
          </div>
        </div>
      )}

      {/* O2 · Auto Screen — cohort hard-knockout desk */}
      {step.key === 'O2' && (
        <div style={{ marginBottom: 18 }}>
          <CohortDesk
            stage="O2"
            title="Auto Screen · hard knockouts"
            subtitle="The agent proposes advance/pass on the fund's hard criteria. Confirm each candidate — advance survivors to Triage, or pass/park with a reason."
            advanceLabel="Advance to Triage →"
            agent="Target-Screening Agent"
            assess
            onChanged={onCohortChanged}
          />
        </div>
      )}

      {/* O3 · Triage — cohort relative-ranking desk */}
      {step.key === 'O3' && (
        <div style={{ marginBottom: 18 }}>
          <CohortDesk
            stage="O3"
            title="Triage · relative ranking"
            subtitle="Candidates ranked by mandate fit. Decide which deserve the gate — advance the strongest, pass or park the rest with a reason."
            advanceLabel="Advance to Gate →"
            agent="Pipeline-Prioritization Agent"
            assess
            onChanged={onCohortChanged}
          />
        </div>
      )}

      {/* O4 · Screening Gate decision desk + screened-awaiting-launch bucket */}
      {step.key === 'O4' && (
        <div style={{ marginBottom: 18 }}>
          <ScreeningGate
            deals={deals}
            launchingId={launchingId}
            onChanged={onCohortChanged}
            onLaunch={onLaunchScreened}
          />
        </div>
      )}

      {/* Deal workspace (D1 only) — the provisioned diligence space */}
      {step.key === 'D1' && (
        <div className="panel ws-panel">
          <div className="ph">
            <span className="ic">🗂</span>
            <h3>Deal workspace</h3>
            <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
              Teams + SharePoint · DD checklist · templates · swimlanes
            </span>
          </div>
          <div className="pb" style={{ padding: 0 }}>
            <Workspace
              deal={deal!}
              mdOptions={mdOptions}
              onAssign={onAssignSwimlane}
              onContribute={onContribute}
              onCycleChecklist={onCycleChecklist}
              onLaunch={onLaunchDeal}
              launching={launching}
            />
          </div>
        </div>
      )}

      {/* Stage-2 deal artifact (D1–D5) — the real PE deliverable for this step */}
      {deal && step.stage === 'diligence' && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="ph">
            <span className="ic">✦</span>
            <h3>{step.title} · deliverable</h3>
            <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
              grounded in the live deal record
            </span>
          </div>
          <div className="pb" style={{ padding: 0 }}>
            <DealArtifactPanel dealId={deal.id} step={step.key} />
          </div>
        </div>
      )}

      {/* IC Readiness Cockpit — decision-grade board (D2 diligence → D4 approval) */}
      {deal && ['D2', 'D3', 'D4'].includes(step.key) && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="ph">
            <span className="ic">◎</span>
            <h3>IC Readiness cockpit</h3>
            <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
              decision-grade · grounded in Fabric market intelligence
            </span>
          </div>
          <div className="pb" style={{ padding: 0 }}>
            <ICCockpit dealId={deal.id} mdOptions={mdOptions} onDealUpdate={onDealUpdate} />
          </div>
        </div>
      )}

      {/* Stage-1 cohort footer — no single-deal chrome; link to the pipeline */}
      {isOrigination && (
        <div className="advance cohort-foot">
          <div className="nexthint">Stage 1 is a cohort funnel — actions filter the candidate list.</div>
          <div className="grow" />
          <button className="btn primary" onClick={onOpenPipeline}>View full pipeline →</button>
        </div>
      )}

      {/* Single-deal chrome — diligence steps only (D1–D5) */}
      {!isOrigination && (
        <>
          {/* Agent action */}
          <div className="agent-card">
            <div className="agent-top">
              <div className="agent-ic">✦</div>
              <div className="who">
                <div className="l">Orchestration agent</div>
                <div className="n">{step.agent}</div>
              </div>
              {relation !== 'upcoming' ? (
                <button className={`runbtn ${produced ? 'ghost' : ''}`} onClick={onRun} disabled={running}>
                  {running ? 'Running…' : produced ? '↻ Re-run' : `▶ ${step.actionLabel}`}
                </button>
              ) : (
                <button className="runbtn ghost" disabled>Locked</button>
              )}
            </div>

            {running && <div className="agent-out"><div className="typing"><i /><i /><i /></div></div>}

            {!running && run && (
              <div className="agent-out">
                <Md text={run.markdown} />
                {run.artifacts?.length > 0 && (
                  <div className="cites">
                    {run.artifacts.map((a) => <span className="cite" key={a}>{a}</span>)}
                  </div>
                )}
              </div>
            )}

            {!running && !run && (
              <div className="agent-hint">
                {relation === 'upcoming'
                  ? 'This step unlocks when the deal reaches it.'
                  : `Run the ${step.agent} to produce this step's deliverables and advance the record.`}
              </div>
            )}
          </div>

          {/* Deliverables */}
          <div className="panel" style={{ marginBottom: 18 }}>
            <div className="ph"><span className="ic">◈</span><h3>Deliverables</h3></div>
            <div className="pb">
              <div className="deliverables">
                {step.produces.map((p) => (
                  <div className={`deliv ${produced ? 'made' : 'wait'}`} key={p}>
                    <span className="dot">{produced ? '✓' : ''}</span>
                    <span className="nm">{p}</span>
                    {produced && <span className="made-tag">produced</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Step-specific data panel */}
          {step.panel && <DataPanel deal={deal!} panel={step.panel} />}

          {/* Advance bar */}
          <div className="advance">
            {relation === 'current' ? (
              <>
                {idx > 0 && <button className="btn" onClick={onBack}>← Back</button>}
                <div className="grow" />
                {nextStep ? (
                  <>
                    <div className="nexthint">
                      {step.isGate ? 'Crossing the gate spins up the collaboration space' : <>Next · <b>{nextStep.title}</b></>}
                    </div>
                    <button className={`btn ${step.isGate ? 'gate' : 'primary'}`} onClick={onAdvance}>
                      {step.isGate ? `⚡ ${flow.gate.label} — advance →` : `Advance to ${nextStep.title} →`}
                    </button>
                  </>
                ) : (
                  <div className="nexthint"><b>Deal archived</b> — journey complete</div>
                )}
              </>
            ) : (
              <>
                <div className="nexthint">
                  {relation === 'done' ? 'This step is complete.' : 'This step is upcoming.'}
                </div>
                <div className="grow" />
                <button className="btn primary" onClick={onJumpCurrent}>Go to current step →</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DataPanel({ deal, panel }: { deal: Deal; panel: string }) {
  if (panel === 'lanes') {
    return (
      <div style={{ marginBottom: 18 }}>
        <div className="lanes3">
          {deal.workstreams.map((w) => {
            const m = LANE_META[w.lane] || LANE_FALLBACK;
            return (
              <div className="lane" key={w.lane}>
                <div className="lh"><span className="nm" style={{ color: m.color }}>{m.label}</span><span className="ow">{w.progress}%</span></div>
                <div className="lb">
                  <div className="prog"><i style={{ width: `${w.progress}%`, background: m.color }} /></div>
                  <div className="findings">
                    {w.findings.length === 0 && <div className="finding empty">No findings yet — run the lane agents.</div>}
                    {w.findings.map((f, i) => (
                      <div className={`finding ${f.severity}`} key={i}>{f.text}<div className="src">{f.source}</div></div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (panel === 'memo') {
    return (
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="ph"><span className="ic">▤</span><h3>IC memo · assembles from the live record</h3></div>
        <div className="pb"><div className="memo-list">
          {deal.memoSections.map((s) => (
            <div className="mrow" key={s.key}>
              <span className={`sdot ${s.status}`} />
              <span>{s.title}</span>
              <span className="st">{s.status}</span>
            </div>
          ))}
        </div></div>
      </div>
    );
  }
  if (panel === 'compliance') {
    return (
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="ph"><span className="ic">✓</span><h3>Compliance & governance · in-flow</h3></div>
        <div className="pb"><div className="rowlist">
          {deal.compliance.length === 0 && <div className="finding empty">Initiated at the screening gate.</div>}
          {deal.compliance.map((c, i) => (
            <div className="r" key={i}>
              <span className={`sdot ${c.status}`} />
              <div><div className="nm">{c.check}</div><div className="mt">{c.framework}</div></div>
              <span className="rt">{c.status}</span>
            </div>
          ))}
        </div></div>
      </div>
    );
  }
  if (panel === 'audit') {
    return (
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="ph"><span className="ic">◷</span><h3>Audit trail · agents & team</h3></div>
        <div className="pb"><div className="rowlist">
          {deal.activity.slice(0, 8).map((a, i) => (
            <div className="r" key={i}>
              <span className="sdot approved" />
              <div><div className="nm">{a.actor}</div><div className="mt">{a.action}</div></div>
              <span className="rt">{timeAgo(a.when)}</span>
            </div>
          ))}
        </div></div>
      </div>
    );
  }
  return null;
}
