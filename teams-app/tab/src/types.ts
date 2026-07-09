export type Persona = { id: string; name?: string; title?: string } | null;

export type Deal = {
  id: string; company: string; sector?: string; stage?: string; stageName?: string;
  status?: string; readiness?: number; daysToIC?: number; dealSize?: number; currency?: string;
};

export type Agent = {
  key: string; label: string; subtitle: string; initials: string;
  kind: 'orchestrator' | 'persona'; persona?: string; starters: string[];
};

export type Analytics = {
  deals?: number; inDiligence?: number; avgReadiness?: number;
  cycleReductionPct?: number; totalHoursSaved?: number; baselineDays?: number;
};

export type FunnelStep = { key: string; step: string; label: string; count: number; active: number };
export type Pipeline = {
  fundName?: string; fundStrategy?: string;
  counts?: { total: number; active: number; passed: number; parked: number; pursued: number };
  funnel?: FunnelStep[];
};

export type Comp = { company: string; ticker?: string; dealType?: string; impliedValuation?: number; status?: string };
export type Precedent = { deal: string; decision?: string; votesFor?: number; votesAgainst?: number; votesAbstain?: number; conditions?: string[]; meetingDate?: string };
export type Benchmark = { workstream: string; total: number; byRisk?: Record<string, number> };
export type FabricInfo = { mode?: string; live?: boolean; source?: string | null; freshness?: { label?: string } | null };
export type MarketIntel = {
  info?: FabricInfo; comparableDeals?: Comp[]; icPrecedents?: Precedent[]; benchmarkFindings?: Benchmark[]; companies?: unknown[];
};

export type BackendConfig = {
  personaAgents?: { configured?: boolean; agents?: { persona: string; label: string; agent: string }[] };
  fabric?: FabricInfo & { mode?: string };
  newsAgent?: string; dealAgent?: string;
};
