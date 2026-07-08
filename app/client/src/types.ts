export interface AppConfig {
  mode: 'live' | 'demo';
  model: string;
  endpoint: string | null;
  auth: string | null;
  region: string;
  appName: string;
  fabric?: FabricInfo;
  onelake?: OneLakeStatus;
  datastore?: string;
}

export interface DataGroup {
  group: string;
  items: string[];
}

export interface FlowStage {
  id: string;
  num: number;
  name: string;
  tagline: string;
  accent: string;
  dataSources: DataGroup[];
  skills: string[];
}

export interface FlowStep {
  key: string;
  stage: string;
  code: string | number;
  title: string;
  what: string;
  agent: string;
  inputs: string[];
  produces: string[];
  m365: string[];
  m365Action: string;
  owner: string;
  actionLabel: string;
  isGate?: boolean;
  panel?: 'lanes' | 'memo' | 'compliance' | 'audit';
}

export interface Gate {
  label: string;
  detail: string;
  afterStep: string;
}

export interface Flow {
  stages: FlowStage[];
  steps: FlowStep[];
  gate: Gate;
}

export interface KeyFigure {
  label: string;
  value: string;
  source: string;
  confidence: string;
}

export interface Finding {
  text: string;
  severity: 'positive' | 'neutral' | 'caution' | 'negative';
  source: string;
}

export type ContributionKind = 'guidance' | 'value_add' | 'diligence';

export interface Contribution {
  kind: ContributionKind;
  text: string;
  severity: 'positive' | 'neutral' | 'caution' | 'negative' | 'risk';
  source: string;
  by?: string | null;
  persona?: string | null;
  at: string;
}

export interface Workstream {
  lane: string;
  owner?: string;
  status: string;
  progress: number;
  findings: Finding[];
  contributions?: Contribution[];
}

export interface DealDocument {
  name: string;
  type: string;
  pages: number;
  status: string;
}

export interface MemoSection {
  key: string;
  title: string;
  status: string;
  content: string;
  citations: string[];
}

export interface ComplianceItem {
  check: string;
  framework: string;
  status: string;
}

export interface Activity {
  actor: string;
  action: string;
  when: string;
}

export interface StepRun {
  heading: string;
  markdown: string;
  artifacts: string[];
  when: string;
}

export interface DealSummary {
  id: string;
  company: string;
  sector: string;
  subSector: string;
  hq: string;
  dealSize: number;
  currency: string;
  stage: string;
  sponsorPersona: string;
  thesis: string;
  readiness: number;
  daysToIC: number;
  projectedDaysSaved: number;
  hoursSaved: number;
  targetICDate: string;
  projectedICDate: string;
  stepIndex: number;
  stepNumber: number;
  totalSteps: number;
  flowProgress: number;
  stageId: string;
  stageName: string;
  stageStepNumber: number;
  stageStepTotal: number;
  diligenceProgress: number;
  memoApproved: number;
  memoTotal: number;
  memoProgress: number;
  complianceCleared: number;
  complianceTotal: number;
  status: 'screened' | 'launched';
  workspaceReady: boolean;
  workstreams: { lane: string; status: string; progress: number }[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  status: 'requested' | 'received' | 'reviewed';
}
export interface ChecklistSection {
  id: string;
  section: string;
  workstream?: string;
  lane?: string;
  items: ChecklistItem[];
}
export interface WorkspaceChannel { name: string; purpose: string; lane?: string; url: string }
export interface WorkspaceFolder { name: string; url: string }
export interface WorkspaceTemplate { id: string; name: string; type: string; ext: string; desc: string; url: string }
export interface Swimlane {
  lane: string;
  label: string;
  md: string;
  advisor: string;
  advisorType: string;
  scope: string[];
  deliverable: string;
  channelUrl: string;
  folderUrl: string;
}
export interface Workspace {
  createdAt: string;
  provisionedBy: string;
  icDate: string;
  teamsUrl: string;
  teamsProvisioned?: boolean;
  teamsChannelName?: string | null;
  sharePointUrl: string;
  sharePointProvisioned?: boolean;
  sharePointUrlResolved?: boolean;
  channelsProvisioned?: boolean;
  channels: WorkspaceChannel[];
  folders: WorkspaceFolder[];
  templates: WorkspaceTemplate[];
  checklist: ChecklistSection[];
  swimlanes: Swimlane[];
}
export interface ChecklistStats { total: number; reviewed: number; received: number; requested: number; pct: number }
export interface MdOption { id: string; name: string; title: string }

// Stage-1 candidate (the origination cohort that flows through the funnel).
export type Disposition = 'active' | 'passed' | 'parked' | 'pursued';

export interface ScreenRec {
  action: 'advance' | 'pass';
  knockouts: { reason: string; detail: string }[];
}

export interface Assessment {
  stage: string;                         // 'O2' | 'O3'
  action: 'advance' | 'pass' | 'park';
  reasonCode: string | null;             // pass/park reason id (null when advance)
  rationale: string;
  confidence: number;                    // 0-1
  agent: string;
  source: 'live' | 'demo';
  model: string | null;
  at: string;
}

export interface Candidate {
  id: string;
  company: string;
  sector: string;
  subSector: string;
  region: string;
  country: string;
  hq: string;
  dealSize: number;
  ownership: string;
  revenue: number;
  ebitda: number;
  ebitdaMargin: number;
  growth: number;
  keywords: string[];
  sources: string[];
  stage: string;                // 'O2' | 'O3' | 'O4' | 'pursued'
  disposition: Disposition;
  passReason: string | null;
  passReasonLabel: string | null;
  passStage: string | null;
  passNote: string | null;
  sourcedAt: string;
  score: number;
  band: 'strong' | 'moderate' | 'weak' | 'excluded';
  gated: boolean;
  gateReasons: string[];
  matchedScreen: { id: string; name: string } | null;
  screenRec: ScreenRec;
  assessment?: Assessment | null;
  rank?: number;
}

export interface Cohort {
  stage: string;
  fundName: string;
  candidates: Candidate[];
}

// ---- Stage artifacts: the real PE deliverable per funnel step --------------
// O2 Investment-Criteria Scorecard · O3 Triage Scorecard · O4 IC Pre-Screen Memo
export interface ScorecardRow {
  key: string;
  label: string;
  group: 'hard' | 'soft';
  status: 'pass' | 'flag' | 'fail';
  detail: string;
  value: string;
}
export interface Scorecard {
  stage: string;
  kind: 'scorecard';
  company: string;
  rows: ScorecardRow[];
  summary: { hardTotal: number; hardCleared: number; softFlags: number; fails: number };
  recommendation: 'advance' | 'pass';
  passReasonCode: string | null;
  headline: string;
}

export interface TriageDim {
  key: string;
  label: string;
  weight: number;
  pct: number;
  points: number;
  note: string;
}
export interface TriageBrief {
  angle: string;
  whyNow: string;
  watchouts: string[];
  generated: boolean;
  model?: string;
}
export interface TriageScorecard {
  stage: string;
  kind: 'triage';
  company: string;
  dims: TriageDim[];
  composite: number;
  tier: 'A' | 'B' | 'C';
  tierAction: 'advance' | 'park' | 'pass';
  tierLabel: string;
  headline: string;
  brief: TriageBrief;
  parkReasonCode: string | null;
  passReasonCode: string | null;
}

export interface LboScenario {
  entryEV: number; equityIn: number; debt: number;
  exitEbitda: number; exitEV: number; equityOut: number;
  moic: number; irr: number;
}
export interface MemoReturns {
  entryMultiple: number;
  impliedMultiple: number | null;
  entryAboveCeiling: boolean;
  leverage: string;
  holdYears: number;
  scenarios: { downside: LboScenario; base: LboScenario; upside: LboScenario };
  hurdle: { irr: number; moic: number };
  meetsHurdle: boolean;
}
export interface MemoRisk { risk: string; mitigant: string }
export interface ScreeningMemo {
  stage: string;
  kind: 'memo';
  company: string;
  generated: boolean;
  model?: string;
  recommendation: 'PURSUE' | 'PASS';
  execSummary: string;
  sourcingAngle: string;
  thesis: string;
  marketRead?: string;
  keyRisks: MemoRisk[];
  diligencePriorities: string[];
  dealTeam: string;
  returns: MemoReturns;
  ask: string;
  recommendationNote?: string;
  tier?: string | null;
}

export type CandidateArtifact = Scorecard | TriageScorecard | ScreeningMemo | { stage: string; kind: 'none' };

// ---- Stage-2 deal artifacts: the real PE deliverable per diligence step -----
// D1 Diligence Plan · D2 Findings Report · D3 Final IC Memo · D4 Execution Pack ·
// D5 Close-out & 100-Day Plan.
export interface PlanWorkstream {
  key: string; label: string; adviser: string; scope: string;
  priority: number; tier: 'critical' | 'high' | 'standard' | 'confirmatory';
  focus: string | null;
}
export interface DiligencePlan {
  step: string; kind: 'plan'; company: string;
  workstreams: PlanWorkstream[];
  budget: { item: string; amount: number }[];
  budgetTotal: number;
  timeline: { exclusivityWeeks: number; irlItems: string; phases: { name: string; window: string; detail: string }[] };
  dataRoom: { platform: string; sections: number; note: string };
  headline: string;
}

export interface DdFinding { workstream: string; severity: string; finding: string; impact: string }
export interface FindingsGroup { key: string; label: string; findings: DdFinding[]; worst: string }
export interface FindingsReport {
  step: string; kind: 'findings'; company: string;
  groups: FindingsGroup[];
  counts: Record<string, number>;
  status: string; headline: string;
  legend: Record<string, string>;
  generated?: boolean; model?: string; synthesis?: string; goNoGo?: string;
}

export interface FinalIcMemo {
  step: string; kind: 'ic-memo'; company: string;
  generated?: boolean; model?: string;
  recommendation: 'APPROVE' | 'CONDITIONAL' | 'DECLINE';
  execSummary: string; thesis: string;
  valueCreation: string[];
  financials: { revenue: number; ebitda: number; ebitdaMargin: number; adjustedEbitda: number; note: string };
  returns: MemoReturns;
  synthesis: { workstream: string; worst: string; top: string }[];
  keyRisks: MemoRisk[];
  exit: { routes: { route: string; note: string }[]; holdYears: number; exitMultiple: string };
  exitRationale?: string;
  ask: string;
  recommendationNote?: string;
  hurdle: { irr: number; moic: number; note: string };
}

export interface ExecutionPack {
  step: string; kind: 'execution'; company: string;
  icDecision: { vote: string; status: string; champion: string };
  spaTerms: { term: string; detail: string }[];
  rwi: { used: boolean; premiumPct: string; retentionPct: string; note: string };
  conditionsPrecedent: { item: string; status: string; detail: string }[];
  fundsFlow: { sources: { label: string; amount: number }[]; uses: { label: string; amount: number }[] };
  compliance: { check: string; framework: string; status: string }[];
  headline: string;
}

export interface CloseoutPlan {
  step: string; kind: 'closeout'; company: string;
  hundredDay: { phase: string; items: string[] }[];
  valueCreation: { lever: string; target: string }[];
  governance: { board: string; mip: string; reporting: string };
  records: { item: string; detail: string }[];
  headline: string;
}

export type DealArtifact = DiligencePlan | FindingsReport | FinalIcMemo | ExecutionPack | CloseoutPlan | { step: string; kind: 'none' };

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  at: string;
  source?: 'live' | 'demo';
}
export interface CandidateChatLog {
  id: string;
  company: string;
  stage: string;
  agent: string;
  log: ChatMessage[];
}

export interface ReasonOption { id: string; label: string }
export interface PassReasons {
  pass: Record<string, ReasonOption[]>;   // keyed by stage O2/O3/O4
  park: ReasonOption[];
}

export interface OneLakeFilingSaved {
  form: string;
  filed: string;
  accession: string;
  cik: string;
  folder: string;
  count: number;
  bytes: number;
  primaryDocument: string | null;
}
export interface OneLakeFilingManifest {
  at: string;
  company: string;
  cik: string;
  secName: string;
  filingsPath: string;
  saved: OneLakeFilingSaved[];
  errors: { accession: string; form: string; error: string }[];
}
export interface OneLakeStatus {
  configured: boolean;
  host: string;
  workspace: string | null;
  lakehouse: string | null;
  filingsPath: string;
  fabricUrl?: string | null;
  connected?: boolean | null;
  lastWrite?: { at: string; folder: string; count: number; bytes: number } | null;
  lastError?: { at: string; message: string } | null;
  probeError?: string;
}

export interface Deal extends DealSummary {
  keyFigures: KeyFigure[];
  workstreams: Workstream[];
  documents: DealDocument[];
  memoSections: MemoSection[];
  compliance: ComplianceItem[];
  activity: Activity[];
  baselineDays: number;
  currentStep: string;
  completedSteps: string[];
  stepRuns: Record<string, StepRun>;
  workspace?: Workspace;
  checklistStats?: ChecklistStats | null;
  issues?: DealIssue[];
  conditions?: ICCondition[];
  assumptionSnapshots?: AssumptionSnapshot[];
  onelakeFilings?: OneLakeFilingManifest;
}

// ---- IC Readiness Cockpit + operational diligence --------------------------
export type IssueSeverity = 'positive' | 'neutral' | 'caution' | 'negative' | 'risk';
export type IssueStatus = 'open' | 'mitigating' | 'resolved';
export type ConditionStatus = 'proposed' | 'accepted' | 'satisfied';

export interface IssueSource { kind?: string; label: string; ref?: string | null }
export interface DealIssue {
  id: string;
  lane: string | null;
  title: string;
  severity: IssueSeverity;
  owner: string | null;
  status: IssueStatus;
  resolutionPath: string | null;
  dueDate: string | null;
  sources: IssueSource[];
  by: string | null;
  persona: string | null;
  at: string;
  resolvedAt: string | null;
}

export interface ICCondition {
  id: string;
  text: string;
  owner: string | null;
  status: ConditionStatus;
  by?: string | null;
  persona?: string | null;
  at?: string;
}

export interface AssumptionSnapshot {
  label: string;
  at: string;
  by: string | null;
  figures: Record<string, number | null>;
}

export interface FabricComp {
  company: string;
  ticker?: string | null;
  dealType: string;
  dealValue?: number | null;
  impliedValuation?: number | null;
  stage?: string;
  status: string;
  thesis?: string;
}

export interface FabricBenchmark {
  workstream: string;
  total: number;
  byRisk: Record<string, number>;
  samples?: { type: string; description: string; risk: string; remediation?: string; status?: string; owner?: string }[];
}

export interface FabricPrecedent {
  deal: string;
  decision: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain?: number;
  conditions: string[];
  closingStatus?: string;
}

export interface FabricInfo {
  configured: boolean;
  mode: 'live' | 'materialized' | 'unconfigured';
  live?: boolean;
  liveConfigured?: boolean;
  liveError?: string | null;
  workspace?: string;
  lakehouse?: string;
  source?: string | null;
  sqlEndpoint?: string | null;
  capacity?: string;
  extractedAt?: string | null;
  queriedAt?: string | null;
  loadedAt?: string | null;
  freshness?: { asOf: string; ageMinutes: number; label: string } | null;
  lineage?: {
    platform: string;
    workspace: string;
    lakehouse: string;
    endpoint: string | null;
    database: string;
    tables: string[];
    mode: string;
  };
  counts?: {
    companies: number;
    comparableDeals: number;
    benchmarkFindingWorkstreams: number;
    icPrecedents: number;
    secTickers: number;
  } | null;
}

export interface ICReadiness {
  dealId: string;
  company: string;
  stage: string;
  verdict: { state: 'READY' | 'CONDITIONAL' | 'NOT-READY'; headline: string; gating: string[]; openConditions: number };
  progressReadiness: number | null;
  requiredArtifacts: {
    items: { key: string; label: string; complete: boolean; detail: string }[];
    complete: number;
    total: number;
    allComplete: boolean;
  };
  blockingWorkstreams: {
    lane: string;
    label: string;
    owner: string | null;
    progress: number;
    status: string;
    openIssues: number;
    blockingIssues: number;
    reasons: string[];
  }[];
  changedAssumptions: {
    baseline: { label: string; at: string } | null;
    changes: { key: string; label: string; from: string | number; to: string | number }[];
    note: string;
  };
  unresolvedRisks: {
    id: string;
    lane: string | null;
    laneLabel: string;
    title: string;
    severity: IssueSeverity;
    owner: string | null;
    status: IssueStatus;
    resolutionPath: string | null;
    sources: number;
  }[];
  supportingSources: { kind: string; label: string; ref: string | null }[];
  icAsk: {
    enterpriseValue: string;
    entryMultiple: string;
    equityCheck: string;
    structure: string;
    hurdle: string;
    baseCase: string;
    source: string;
  };
  conditions: { id: string; text: string; owner: string | null; status: ConditionStatus }[];
  overrides?: { stage: string; gate: string; verdict: string; reason: string; by: string; at: string }[];
  citationAudit?: {
    score: number;
    clean: boolean;
    summary: string;
    totalClaims: number;
    sourcedClaims: number;
    unsourcedClaims: number;
    unsourcedFigures: number;
  };
  counts: { openIssues: number; unresolvedRisks: number; blockingWorkstreams: number; conditions: number; sources: number };
  marketIntel?: {
    source: FabricInfo;
    comparableDeals: FabricComp[];
    icPrecedents: FabricPrecedent[];
    benchmarkFindings: FabricBenchmark[];
  };
}

export interface CanonicalCompanySummary {
  id: string;
  name: string;
  aliases: string[];
  domain: string | null;
  ticker: string | null;
  sector: string | null;
  subSector: string | null;
  region: string | null;
  country: string | null;
  hq: string | null;
  ownership: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  growth: number | null;
  dealSize: number | null;
  estimated: boolean;
  sources: string[];
  discoveredVia: string;
  newsCount: number;
  hasSignals: boolean;
  inFunnel: boolean;
  funnel: { stage: string; disposition: string; passReason: string | null } | null;
  feedIds: Record<string, string>;
  firstSeen: string | null;
}

export interface CanonicalCompanies {
  count: number;
  fromFeeds: { desk: number; candidates: number; signals: number };
  resolvedDuplicates: number;
  companies: CanonicalCompanySummary[];
}

export interface ICGateBlock {
  error: 'ic-not-ready' | 'override-forbidden';
  gate: 'ic-entry' | 'ic-approval';
  detail: string;
  verdict: { state: 'READY' | 'CONDITIONAL' | 'NOT-READY'; headline: string; gating: string[]; openConditions: number };
}

export interface MarketIntel {
  info: FabricInfo;
  companies: { ticker: string; name: string; sector: string; industry: string; employees: number | null; marketCap: number | null; revenue: number | null }[];
  comparableDeals: FabricComp[];
  benchmarkFindings: FabricBenchmark[];
  icPrecedents: FabricPrecedent[];
  companyFinancials: Record<string, Record<string, { value: number | null; unit: string; form: string; filed: string }>>;
}

// Stage-1 origination funnel (real cohort counts — survivors through each step).
export interface FunnelStage {
  key: string;
  step: string;
  label: string;
  count: number;
  active: number;
}

export interface FunnelCounts {
  total: number;
  active: number;
  passed: number;
  parked: number;
  pursued: number;
}

export interface PipelineFunnel {
  fundName: string;
  fundStrategy: string;
  selectedScreens: number;
  discovered: number;
  counts?: FunnelCounts;
  funnel: FunnelStage[];
}

export interface Pipeline {
  fundName: string;
  funnel: FunnelStage[];
  candidates: Candidate[];
}


export interface StepRunResult {
  stepKey: string;
  heading: string;
  markdown: string;
  artifacts: string[];
  hours: number;
  citations: string[];
}

export type Intent = 'high' | 'medium' | 'low';

export interface EmailItem {
  id: string;
  company: string | null;
  from: string;
  role: string;
  subject: string;
  preview: string;
  when: string;
  intent: Intent;
}

export interface ChatItem {
  id: string;
  company: string | null;
  from: string;
  channel: string;
  preview: string;
  when: string;
  intent: Intent;
}

export interface MeetingItem {
  id: string;
  company: string | null;
  title: string;
  attendees: string;
  preview: string;
  when: string;
  intent: Intent;
}

export interface Mailbox {
  emails: EmailItem[];
  chats: ChatItem[];
  meetings: MeetingItem[];
}

export interface SignalCompany {
  id: string;
  name: string;
  sector: string;
  hq: string;
  summary: string;
  intent: Intent;
  counts: { emails: number; chats: number; meetings: number; total: number };
  hasCrm: boolean;
  signals: { emails: EmailItem[]; chats: ChatItem[]; meetings: MeetingItem[] };
}

export interface CrmRelationship {
  companyId: string;
  company: string;
  exists: boolean;
  status?: string;
  owner?: string;
  stage?: string;
  opportunities?: number;
  lastContact?: string;
  note: string;
}

// ---- News & filings desk ----
export interface DeskSource {
  id: string;
  name: string;
  role: 'discover' | 'confirm' | 'quality';
  column: number;
  primaryJob: string;
  sweetSpot: string;
  status: 'connected' | 'degraded' | 'disconnected';
  latencyMs: number;
  lastSyncMin: number;
}

export interface DeskCatalyst {
  id: string;
  label: string;
  icon: string;
  scanning: string;
  actionable: string;
}

export interface DeskNews {
  id: string;
  source: string;
  when: string;
  headline: string;
  detail: string;
  catalyst: string;
  confidence: number;
  aiLabeled?: boolean;
  manualOverride?: boolean;
  url?: string | null;
  publisher?: string;
  live?: boolean;
}

export interface SavedFilingFile {
  name: string;
  path: string;
  size: number;
  contentType: string;
  primary?: boolean;
}

export interface SavedFiling {
  savedAt: string;
  mode: 'blob' | 'disk';
  container: string;
  prefix: string;
  count: number;
  totalBytes: number;
  primary: string | null;
  files: SavedFilingFile[];
  skipped?: { name: string; reason: string; size?: number }[];
}

export interface DeskFiling {
  id: string;
  source: string;
  filingType: string;
  when: string;
  headline: string;
  confirms: string;
  detail: string;
  url?: string | null;
  cik?: string | null;
  accession?: string | null;
  primaryDocument?: string | null;
  saved?: SavedFiling;
  live?: boolean;
}

export interface DeskQuality {
  rating: string;
  score: number;
  trend: 'improving' | 'stable' | 'weakening';
  flags: string[];
  note: string;
  live?: boolean;
  morningstarId?: string | null;
  ticker?: string | null;
}

export interface DeskCompany {
  id: string;
  name: string;
  ticker?: string | null;
  sector: string;
  region: string;
  country: string;
  dealSize: number;
  ownership: string;
  news: DeskNews[];
  filings: DeskFiling[];
  filingsChecked?: boolean;
  quality: DeskQuality;
  live?: boolean;
  estimated?: boolean;
}

export interface SourcingDesk {
  l1: { id: string; name: string; sector: string[]; region: string[]; sizeMin: number | null; sizeMax: number | null; thesis: string };
  sources: DeskSource[];
  catalysts: DeskCatalyst[];
  companies: DeskCompany[];
}

export interface SourceTestResult {
  id: string;
  name: string;
  ok: boolean;
  status: string;
  latencyMs: number;
  checkedAt: string;
  message: string;
}

// ---- Data-source connectivity (Home panel) ----
export interface Connector {
  id: string;
  name: string;
  kind: 'web' | 'mcp' | 'database' | 'edgar' | 'm365';
  provider: string | null;
  role: 'discover' | 'confirm' | 'quality' | 'identity';
  loginUrl?: string | null;
  primaryJob: string;
  sweetSpot: string;
  configured: boolean;
  testable: boolean;
  connectable: boolean;
  status: 'connected' | 'degraded' | 'disconnected' | 'unknown';
  latencyMs: number | null;
  lastSync: string | null;
  message: string | null;
}

export interface ConnectorTest {
  id: string;
  name: string;
  ok: boolean;
  status: 'connected' | 'degraded' | 'disconnected';
  latencyMs: number | null;
  checkedAt: string;
  lastSync: string | null;
  message: string;
}

// ---- Analyst reports (thesis context) ----
export interface ResearchSector {
  name: string;
  market: string;
  growth: string;
  horizon: string;
  outlook: 'positive' | 'neutral' | 'caution';
  summary: string;
  sources: string[];
}

export interface ResearchPeer {
  name: string;
  note: string;
  listed: boolean;
}

export interface ResearchCompetitive {
  rank: number;
  of: number;
  label: string;
  moat: string;
  peers: ResearchPeer[];
}

export interface ResearchView {
  firm: string;
  kind: 'sell-side' | 'independent' | 'expert';
  rating?: string;
  valuation?: string;
  view: string;
  when: string;
}

export interface CompanyResearch {
  coverage: 'read-across' | 'direct';
  thesis: string;
  sector: ResearchSector;
  competitive: ResearchCompetitive;
  views: ResearchView[];
}

export interface ResearchCompany {
  id: string;
  name: string;
  sector: string;
  region: string;
  country: string;
  dealSize: number;
  ownership: string;
  justDiscovered: boolean;
  research: CompanyResearch;
}

export interface AnalystResearch {
  companies: ResearchCompany[];
}

// ---- Sourcing framework (fund GATE · themes GUIDE · screens RANK) ----
export interface FundMandate {
  id: string;
  tier: 1;
  kind: 'fund-mandate';
  name: string;
  strategy: string;
  fundSize: string;
  investmentPeriod: string;
  term: string;
  sectorsPermitted: string[];
  sectorsExcluded: string[];
  geographies: string[];
  evMin: number;
  evMax: number;
  maxEquityPerDeal: number;
  maxSectorConcentration: number;
  leverageLimit: string;
  esgPolicy: string;
}

export interface Screen {
  id: string;
  tier: 3;
  kind: 'screen';
  name: string;
  themeId: string | null;
  author: string;
  sector: string;
  subSectors: string[];
  regions: string[];
  evMin: number | null;
  evMax: number | null;
  revenueMin: number | null;
  ebitdaMin: number | null;
  ebitdaMarginMin: number | null;
  growthMin: number | null;
  ownership: string[];
  keywords: string[];
  custom?: boolean;
  selected: boolean;
}

export interface Theme {
  id: string;
  tier: 2;
  kind: 'theme';
  name: string;
  sponsor: string;
  status: string;
  thesis: string;
  whyNow: string;
  sector: string;
  subSectors: string[];
  geographyFocus: string[];
  valueCreation: string[];
  rightToWin: string;
  evGuidance: string;
  screens: Screen[];
}

export interface Framework {
  fund: FundMandate;
  themes: Theme[];
  screensWithoutTheme: Screen[];
}

export interface ScoreParts {
  sector: number;
  region: number;
  ev: number;
  ownership: number;
  keywords: number;
  revenue: number;
  ebitda: number;
  margin: number;
  growth: number;
}

export interface ScoredTarget {
  id: string;
  name: string;
  sector: string;
  region: string;
  country: string;
  dealSize: number;
  ownership: string;
  sources: string[];
  justDiscovered?: boolean;
  gated: boolean;
  gateReasons: string[];
  score: number;
  band: 'strong' | 'moderate' | 'weak' | 'excluded';
  matchedScreen: { id: string; name: string } | null;
  parts: ScoreParts | null;
  inFunnel?: boolean;
}

export interface ScoredTargets {
  selectedCount: number;
  discoveredCount?: number;
  totalCount?: number;
  gatedCount?: number;
  targets: ScoredTarget[];
}

// Generated analyst report + resolved filings/Morningstar for a ranked target's
// expandable detail on the Deal Sourcing page.
export interface GeneratedReport {
  generated: boolean;
  summary: string;
  sectorOutlook: { stance: 'positive' | 'neutral' | 'caution'; text: string };
  competitivePosition: string;
  keyRisks: string[];
  recommendation: string;
  sources: string[];
}

export interface TargetQuality {
  public: boolean;
  configured?: boolean;
  rating?: string;
  score?: number;
  trend?: 'improving' | 'stable' | 'weakening';
  flags?: string[];
  note?: string;
  error?: string;
}

export interface TargetDetail {
  id: string;
  name: string;
  ticker: string | null;
  isPublic: boolean;
  filings: DeskFiling[];
  filingsKind: 'public' | 'formd' | 'none';
  quality: TargetQuality;
  report: GeneratedReport;
}

export interface ScreenMutationError {
  error: string;
  errors?: string[];
  warnings?: string[];
}

