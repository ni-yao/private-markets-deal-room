export interface AppConfig {
  mode: 'live' | 'demo';
  model: string;
  endpoint: string | null;
  auth: string | null;
  region: string;
  appName: string;
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

export interface Workstream {
  lane: string;
  owner?: string;
  status: string;
  progress: number;
  findings: Finding[];
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
  sharePointUrl: string;
  channels: WorkspaceChannel[];
  folders: WorkspaceFolder[];
  templates: WorkspaceTemplate[];
  checklist: ChecklistSection[];
  swimlanes: Swimlane[];
}
export interface ChecklistStats { total: number; reviewed: number; received: number; requested: number; pct: number }
export interface MdOption { id: string; name: string; title: string }

export interface GateTarget {
  id: string;
  name: string;
  sector: string;
  region: string;
  country: string;
  dealSize: number;
  ownership: string;
  score: number;
  matchedScreen: { id: string; name: string } | null;
  pursued: boolean;
}
export interface GateTargets {
  fundName: string;
  targets: GateTarget[];
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
}

// Stage-1 origination funnel (real, derived counts — not a single deal).
export interface FunnelStage {
  key: string;
  step: string;
  label: string;
  count: number;
}

export interface PipelineFunnel {
  fundName: string;
  fundStrategy: string;
  selectedScreens: number;
  discovered: number;
  funnel: FunnelStage[];
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
}

export interface DeskFiling {
  id: string;
  source: string;
  filingType: string;
  when: string;
  headline: string;
  confirms: string;
  detail: string;
}

export interface DeskQuality {
  rating: string;
  score: number;
  trend: 'improving' | 'stable' | 'weakening';
  flags: string[];
  note: string;
}

export interface DeskCompany {
  id: string;
  name: string;
  sector: string;
  region: string;
  country: string;
  dealSize: number;
  ownership: string;
  news: DeskNews[];
  filings: DeskFiling[];
  quality: DeskQuality;
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
}

export interface ScoredTargets {
  selectedCount: number;
  discoveredCount?: number;
  totalCount?: number;
  gatedCount?: number;
  targets: ScoredTarget[];
}

export interface ScreenMutationError {
  error: string;
  errors?: string[];
  warnings?: string[];
}

