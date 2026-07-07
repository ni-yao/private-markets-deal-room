import type {
  AppConfig,
  Flow,
  DealSummary,
  Deal,
  StepRunResult,
  Mailbox,
  SignalCompany,
  CrmRelationship,
  SourcingDesk,
  DeskQuality,
  DeskFiling,
  Connector,
  ConnectorTest,
  AnalystResearch,
  Framework,
  Screen,
  ScoredTargets,
  TargetDetail,
  SavedFiling,
  ScreenMutationError,
  PipelineFunnel,
  Cohort,
  CandidateArtifact,
  Pipeline,
  PassReasons,
  Candidate,
  Assessment,
  ChatMessage,
  CandidateChatLog,
  MdOption
} from './types';

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function patchReq<T>(url: string, body: unknown = {}): Promise<T> {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// For screen create/update: a 422 carries a structured validation payload we
// want to surface to the user rather than throw away.
async function sendValidated<T>(
  method: 'POST' | 'PATCH',
  url: string,
  body: unknown = {}
): Promise<{ ok: true; data: T } | { ok: false; error: ScreenMutationError }> {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, data: payload as T };
  return { ok: false, error: payload as ScreenMutationError };
}

export const api = {
  config: () => get<AppConfig>('/api/config'),
  flow: () => get<Flow>('/api/flow'),
  deals: () => get<DealSummary[]>('/api/deals'),
  pipeline: () => get<PipelineFunnel>('/api/pipeline'),
  stage1Funnel: () => get<PipelineFunnel>('/api/stage1/funnel'),
  stage1Pipeline: () => get<Pipeline>('/api/stage1/pipeline'),
  cohort: (stage: string) => get<Cohort>(`/api/stage1/cohort/${stage}`),
  assessCohort: (stage: string, force = false) =>
    post<Cohort>(`/api/stage1/cohort/${stage}/assess`, { force }),
  assessCandidate: (id: string) =>
    post<{ assessment: Assessment; candidate: Candidate }>(`/api/candidates/${id}/assess`, {}),
  candidateArtifact: (id: string, force = false) =>
    post<CandidateArtifact>(`/api/candidates/${id}/artifact`, { force }),
  candidateChat: (id: string) => get<CandidateChatLog>(`/api/candidates/${id}/chat`),
  sendCandidateChat: (id: string, message: string) =>
    post<{ reply: string; source: 'live' | 'demo'; log: ChatMessage[] }>(`/api/candidates/${id}/chat`, { message }),
  passReasons: () => get<PassReasons>('/api/stage1/pass-reasons'),
  screenCandidate: (id: string, action: string, reason?: string, note?: string) =>
    post<{ candidate: Candidate }>(`/api/candidates/${id}/screen`, { action, reason, note }),
  triageCandidate: (id: string, action: string, reason?: string, note?: string) =>
    post<{ candidate: Candidate }>(`/api/candidates/${id}/triage`, { action, reason, note }),
  gateCandidate: (id: string, action: string, reason?: string, note?: string) =>
    post<{ candidate: Candidate; deal?: Deal }>(`/api/candidates/${id}/gate`, { action, reason, note }),
  sendToScreening: (deskId: string) =>
    post<{ candidate: Candidate }>('/api/candidates/send-to-screening', { deskId }),
  mdOptions: () => get<MdOption[]>('/api/md-options'),
  launchDeal: (id: string) => post<Deal>(`/api/deals/${id}/launch`, {}),
  ensureDealTeams: (id: string) =>
    post<{ ok?: boolean; provisioned: boolean; connected: boolean; teamsUrl: string; error?: string }>(`/api/deals/${id}/teams/ensure`, {}),
  assignSwimlane: (id: string, lane: string, md: string) =>
    patchReq<Deal>(`/api/deals/${id}/swimlanes/${lane}`, { md }),
  cycleChecklistItem: (id: string, itemId: string) =>
    post<Deal>(`/api/deals/${id}/checklist/${itemId}/cycle`, {}),
  deal: (id: string) => get<Deal>(`/api/deals/${id}`),
  runStep: (id: string, stepKey: string) =>
    post<StepRunResult>(`/api/deals/${id}/steps/${stepKey}/run`, {}),
  advance: (id: string) => post<Deal>(`/api/deals/${id}/advance`, {}),
  back: (id: string) => post<Deal>(`/api/deals/${id}/back`, {}),
  mailbox: () => get<Mailbox>('/api/signals/mailbox'),
  signalCompanies: () => get<SignalCompany[]>('/api/signals/companies'),
  crm: (companyId: string) => get<CrmRelationship>(`/api/signals/companies/${companyId}/crm`),
  newsDesk: () => get<SourcingDesk>('/api/news/desk'),
  connectors: () => get<Connector[]>('/api/connectors'),
  testConnector: (id: string) => post<ConnectorTest>(`/api/connectors/${id}/test`, {}),
  findMoreNews: () => post<{ revealed: unknown; desk: SourcingDesk }>('/api/news/find-more', {}),
  setFindingCatalyst: (id: string, catalyst: string) =>
    post<{ findingId: string; catalyst: string; companyId: string }>(`/api/news/findings/${id}/catalyst`, { catalyst }),
  runQuality: (id: string) => post<DeskQuality & { configured?: boolean; error?: string }>(`/api/news/companies/${id}/quality`, {}),
  runFilings: (id: string) => post<{ matched: boolean; kind?: string; cik?: string | null; secName?: string | null; filings: DeskFiling[] }>(`/api/news/companies/${id}/filings`, {}),
  scanFormD: () => post<{ source: string; discoveredCount: number; desk: SourcingDesk; error?: string }>('/api/news/scan-formd', {}),
  research: () => get<AnalystResearch>('/api/research'),
  framework: () => get<Framework>('/api/framework'),
  scoredTargets: () => get<ScoredTargets>('/api/targets/scored'),
  targetDetail: (id: string) => post<TargetDetail>(`/api/targets/${id}/detail`, {}),
  retryQuality: (id: string) =>
    post<{ id: string; name: string; ticker: string | null; isPublic: boolean; quality: TargetDetail['quality'] }>(`/api/targets/${id}/quality`, {}),
  saveFiling: (targetId: string, filingId: string) =>
    post<SavedFiling & { targetId: string; filingId: string }>(`/api/targets/${targetId}/filings/${filingId}/save`, {}),
  filingDownloadUrl: (path: string, name?: string) =>
    `/api/filings/download?path=${encodeURIComponent(path)}${name ? `&name=${encodeURIComponent(name)}` : ''}`,
  selectScreen: (id: string, selected: boolean) => post<Screen>(`/api/screens/${id}/select`, { selected }),
  selectTheme: (id: string, selected: boolean) =>
    post<{ themeId: string; selected: boolean; screenIds: string[] }>(`/api/themes/${id}/select`, { selected }),
  updateScreen: (id: string, patch: Partial<Screen>) =>
    sendValidated<{ screen: Screen; warnings: string[] }>('PATCH', `/api/screens/${id}`, patch),
  createScreen: (input: Partial<Screen>) =>
    sendValidated<{ screen: Screen; warnings: string[] }>('POST', '/api/screens', input)
};
