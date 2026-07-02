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
  SourceTestResult,
  AnalystResearch,
  Framework,
  Screen,
  ScoredTargets,
  ScreenMutationError,
  PipelineFunnel,
  GateTargets,
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
  gateTargets: () => get<GateTargets>('/api/gate/targets'),
  pursueTarget: (targetId: string) => post<Deal>('/api/gate/pursue', { targetId }),
  mdOptions: () => get<MdOption[]>('/api/md-options'),
  launchDeal: (id: string) => post<Deal>(`/api/deals/${id}/launch`, {}),
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
  findMoreNews: () => post<{ revealed: unknown; desk: SourcingDesk }>('/api/news/find-more', {}),
  setFindingCatalyst: (id: string, catalyst: string) =>
    post<{ findingId: string; catalyst: string; companyId: string }>(`/api/news/findings/${id}/catalyst`, { catalyst }),
  testSource: (id: string) => post<SourceTestResult>(`/api/news/sources/${id}/test`, {}),
  research: () => get<AnalystResearch>('/api/research'),
  framework: () => get<Framework>('/api/framework'),
  scoredTargets: () => get<ScoredTargets>('/api/targets/scored'),
  selectScreen: (id: string, selected: boolean) => post<Screen>(`/api/screens/${id}/select`, { selected }),
  selectTheme: (id: string, selected: boolean) =>
    post<{ themeId: string; selected: boolean; screenIds: string[] }>(`/api/themes/${id}/select`, { selected }),
  updateScreen: (id: string, patch: Partial<Screen>) =>
    sendValidated<{ screen: Screen; warnings: string[] }>('PATCH', `/api/screens/${id}`, patch),
  createScreen: (input: Partial<Screen>) =>
    sendValidated<{ screen: Screen; warnings: string[] }>('POST', '/api/screens', input)
};
