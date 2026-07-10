import { useEffect, useState } from 'react';
import { initTeams, getSsoToken, type TeamsInfo } from './teams';
import Dashboard from './Dashboard';
import ChatPanel from './ChatPanel';
import DealDetail from './DealDetail';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import type { Agent, Analytics, BackendConfig, Deal, MarketIntel, Persona, Pipeline } from './types';

type TeamsConfig = { demoMode: boolean; backend: string; sso: boolean; bot: boolean; backendUrl?: string };

const ORCHESTRATOR: Agent = {
  key: 'orchestrator', label: 'Deal Room Analyst', subtitle: 'Portfolio & deal orchestrator', initials: 'DR', kind: 'orchestrator',
  starters: [
    'List every deal with its stage, status and IC readiness.',
    'Which deal is the highest priority right now, and why?',
    'Where is the pipeline light — what should we source next?',
  ],
};
const PERSONA_META: Record<string, { initials: string; subtitle: string; starters: string[] }> = {
  partner: { initials: 'EB', subtitle: 'Partner — sponsor & IC gatekeeper', starters: ['Give me your go/no-go read on the portfolio.', 'What conditions would you require to approve at IC?'] },
  'retail-md': { initials: 'RM', subtitle: 'Retail MD — commercial lane', starters: ['What commercial diligence should we prioritise?', 'Suggest a commercial value-creation lever.'] },
  'ai-md': { initials: 'AI', subtitle: 'AI MD — tech / AI lane', starters: ['Score AI-readiness and flag the tech risks.', 'Propose an AI / digital value-creation lever.'] },
  'supply-md': { initials: 'SM', subtitle: 'Supply Chain MD — operations lane', starters: ['Surface the supply-chain & concentration risks.', 'Suggest an operational cost-out lever.'] },
};
const PERSONA_ORDER = ['partner', 'retail-md', 'ai-md', 'supply-md'];
const shortLabel = (label: string | undefined, persona: string) => (label ? (label.split('—')[0].split('(')[0].trim() || label) : persona);

export default function App() {
  const [, setTeams] = useState<TeamsInfo | null>(null);
  const [cfg, setCfg] = useState<TeamsConfig | null>(null);
  const [persona, setPersona] = useState<Persona>(null);
  const [config, setConfig] = useState<BackendConfig | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [market, setMarket] = useState<MarketIntel | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [agents, setAgents] = useState<Agent[]>([ORCHESTRATOR]);
  // Agents panel starts collapsed — it opens on an explicit "Ask" action so the
  // dashboard isn't crowded on first load.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFocusDealId, setChatFocusDealId] = useState('');
  const [openDealId, setOpenDealId] = useState('');
  const [canViewStage2, setCanViewStage2] = useState(true);
  const [demoUsers, setDemoUsers] = useState<{ id: string; upn: string; label: string }[]>([]);
  const [viewAs, setViewAs] = useState('user1');
  const [mainTab, setMainTab] = useState<'overview' | 'stage1' | 'stage2'>('overview');

  useEffect(() => {
    (async () => {
      setTeams(await initTeams());
      fetch('/api/teams/config').then((r) => r.json()).then(setCfg).catch(() => {});
      fetch('/api/analytics').then((r) => r.json()).then(setAnalytics).catch(() => {});
      fetch('/api/pipeline').then((r) => r.json()).then(setPipeline).catch(() => {});
      fetch('/api/market-intel').then((r) => r.json()).then(setMarket).catch(() => {});
      fetch('/api/deals').then((r) => (r.ok ? r.json() : [])).then((d) => { if (Array.isArray(d)) setDeals(d); }).catch(() => {});

      fetch('/api/config').then((r) => r.json()).then((backendCfg: BackendConfig) => {
        setConfig(backendCfg);
        const list: Agent[] = [ORCHESTRATOR];
        if (backendCfg?.personaAgents?.configured) {
          for (const p of PERSONA_ORDER) {
            const found = (backendCfg.personaAgents.agents || []).find((x) => x.persona === p);
            const meta = PERSONA_META[p];
            if (found && meta) list.push({ key: p, label: shortLabel(found.label, p), subtitle: meta.subtitle, initials: meta.initials, kind: 'persona', persona: p, starters: meta.starters });
          }
        }
        setAgents(list);
      }).catch(() => {});

      getSsoToken().then((token) =>
        fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ssoToken: token, as: 'user1' }) }).then((r) => r.json())
      ).then((ctx) => { if (ctx?.persona) setPersona(ctx.persona); if (Array.isArray(ctx?.demoUsers)) setDemoUsers(ctx.demoUsers); setCanViewStage2(!!ctx?.canViewStage2); }).catch(() => {});
    })();
  }, []);

  // Re-evaluate stage access when the demo "view as" user changes. The demo
  // override drives stage access server-side, so we skip the (slow) SSO token
  // fetch here to keep switching instant.
  useEffect(() => {
    (async () => {
      const ctx = await fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ as: viewAs }) }).then((r) => r.json()).catch(() => null);
      if (ctx) { setCanViewStage2(!!ctx.canViewStage2); if (ctx.persona) setPersona(ctx.persona); }
    })();
  }, [viewAs]);

  async function refreshData() {
    fetch('/api/deals').then((r) => (r.ok ? r.json() : [])).then((d) => { if (Array.isArray(d)) setDeals(d); }).catch(() => {});
    fetch('/api/analytics').then((r) => r.json()).then(setAnalytics).catch(() => {});
    fetch('/api/pipeline').then((r) => r.json()).then(setPipeline).catch(() => {});
  }

  function askAbout(dealId: string) {
    setChatFocusDealId(dealId);
    setChatOpen(true);
  }

  return (
    <div className="appwrap">
      <style>{GLOBAL_CSS}</style>

      <header className="topbar">
        <div className="brand">
          <div className="logo">◆</div>
          <div>
            <div className="brand-t">Deal Dashboard</div>
            <div className="brand-s">Deal flow, market intel & your agents — in one place</div>
          </div>
        </div>
        <div className="topbar-r">
          {persona?.name ? <span className="badge" title="Signed-in persona">{persona.name}</span> : null}
          {demoUsers.length ? (
            <select className="viewas" value={viewAs} onChange={(e) => setViewAs(e.target.value)} title="Demo — view as (stage visibility)">
              {demoUsers.map((u) => (<option key={u.id} value={u.upn}>👤 {u.label}</option>))}
            </select>
          ) : null}
          <span className={`rolechip ${canViewStage2 ? 'full' : 'ltd'}`} title="Stage 2 (Diligence) is restricted to the deal team">{canViewStage2 ? 'Stage 1 + 2' : 'Stage 1 only'}</span>
          {cfg?.backendUrl ? <a className="dashlink" href={cfg.backendUrl} target="_blank" rel="noopener noreferrer">Full dashboard ↗</a> : null}
          <button className={`asktoggle${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)}>{chatOpen ? 'Hide agents' : '💬 Ask agents'}</button>
        </div>
      </header>

      <nav className="maintabs">
        {([['overview', 'Deals Overview'], ['stage1', 'Stage 1 — Origination'], ['stage2', 'Stage 2 — Diligence']] as const).map(([k, label]) => (
          <button key={k} className={`maintab${mainTab === k ? ' on' : ''}`} onClick={() => setMainTab(k)}>{label}</button>
        ))}
      </nav>

      <div className="layout">
        <main className="main">
          {mainTab === 'overview' ? (
            <Dashboard analytics={analytics} pipeline={pipeline} deals={deals} market={market} config={config} agentCount={agents.length} onAsk={askAbout} onOpen={setOpenDealId} />
          ) : mainTab === 'stage1' ? (
            <Stage1 onChanged={refreshData} onOpenDeal={setOpenDealId} />
          ) : (
            <Stage2 deals={deals} onOpen={setOpenDealId} onAsk={askAbout} />
          )}
        </main>
        {chatOpen ? <ChatPanel agents={agents} deals={deals} focusDealId={chatFocusDealId} onClose={() => setChatOpen(false)} /> : null}
      </div>

      {openDealId ? <DealDetail dealId={openDealId} canViewStage2={canViewStage2} onClose={() => setOpenDealId('')} onAsk={(id) => { setOpenDealId(''); askAbout(id); }} /> : null}
    </div>
  );
}

const GLOBAL_CSS = `
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
.appwrap { display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: var(--fg); font: 14px/1.5 "Segoe UI", system-ui, sans-serif; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface); flex: 0 0 auto; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo { width: 34px; height: 34px; border-radius: 8px; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 18px; }
.brand-t { font-weight: 700; font-size: 16px; }
.brand-s { color: var(--muted); font-size: 12px; }
.topbar-r { display: flex; align-items: center; gap: 10px; }
.badge { background: var(--chip); padding: 4px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.viewas { background: var(--input-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 5px 8px; font: inherit; font-size: 12px; max-width: 210px; }
.rolechip { font-size: 11px; padding: 4px 9px; border-radius: 999px; font-weight: 700; white-space: nowrap; }
.rolechip.full { background: #1b7f37; color: #fff; }
.rolechip.ltd { background: #b8860b; color: #fff; }
.dashlink { color: var(--accent); text-decoration: none; font-size: 12px; font-weight: 600; }
.dashlink:hover { text-decoration: underline; }
.asktoggle { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); padding: 7px 12px; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600; }
.asktoggle.on { background: transparent; color: var(--accent); }
.layout { flex: 1; display: flex; min-height: 0; }
.main { flex: 1; overflow-y: auto; min-width: 0; }
.maintabs { display: flex; gap: 4px; padding: 8px 16px 0; background: var(--surface); border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.maintab { border: none; background: none; color: var(--muted); padding: 9px 14px; cursor: pointer; font: inherit; font-weight: 600; font-size: 13px; border-bottom: 2px solid transparent; }
.maintab:hover { color: var(--fg); }
.maintab.on { color: var(--accent); border-bottom-color: var(--accent); }
.stage1, .stage2 { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.stage1 .fstep { border: none; cursor: pointer; }
.stage1 .fstep.on { outline: 2px solid var(--accent); }
.cand-list { display: flex; flex-direction: column; }
.cand { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.cand:last-child { border-bottom: none; }
.cand-main { flex: 1; min-width: 0; }
.cand-top { display: flex; align-items: center; gap: 8px; }
.cand-co { font-weight: 700; }
.cand-meta { color: var(--muted); font-size: 12px; margin: 2px 0 6px; }
.cand-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.cand-assess { font-size: 12px; background: var(--hover); border-radius: 8px; padding: 6px 9px; }
.cand-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex: 0 0 auto; max-width: 240px; justify-content: flex-end; }
.pill.ok { background: #1b7f37; color: #fff; }
.pill.warn { background: #b8860b; color: #fff; }
.pill.bad { background: #b23b3b; color: #fff; }

/* Dashboard */
.dash { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.kpi { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow); }
.kpi-v { font-size: 24px; font-weight: 700; }
.kpi-l { font-size: 13px; margin-top: 2px; }
.kpi-s { color: var(--muted); font-size: 12px; }
.panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.panel-h { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 700; }
.panel-h .muted { font-weight: 400; }
.muted { color: var(--muted); font-size: 12px; }
.funnel { display: flex; gap: 8px; padding: 14px 16px; overflow-x: auto; }
.fstep { flex: 1 0 90px; text-align: center; background: var(--hover); border-radius: 10px; padding: 10px 8px; }
.fcount { font-size: 20px; font-weight: 700; }
.flabel { font-size: 12px; }
.fkey { color: var(--muted); font-size: 11px; }
.empty-panel { padding: 20px 16px; color: var(--muted); display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.linkbtn { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; font-weight: 600; padding: 0; }
.deals { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; padding: 14px 16px; }
.dealcard { border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--surface); }
.dc-top { display: flex; justify-content: space-between; align-items: baseline; }
.dc-co { font-weight: 700; }
.dc-size { color: var(--accent); font-weight: 700; font-size: 13px; }
.dc-meta { color: var(--muted); font-size: 12px; margin: 2px 0 8px; }
.dc-bar { height: 6px; background: var(--hover); border-radius: 4px; overflow: hidden; }
.dc-bar span { display: block; height: 100%; background: var(--accent); }
.dc-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.askbtn { border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 6px; padding: 3px 9px; cursor: pointer; font: inherit; font-size: 12px; }
.askbtn:hover { border-color: var(--accent); color: var(--accent); }
.mi { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 14px 16px; }
.mi-col { min-width: 0; }
.mi-h { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
.mi-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.mi-name { font-weight: 600; }
.mi-val { color: var(--muted); font-size: 12px; }
.pill { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--chip); }
.pill.closed-won { background: #1b7f37; color: #fff; }
.pill.closed-lost { background: #b23b3b; color: #fff; }
.pill.on-hold { background: #b8860b; color: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: var(--chip); padding: 3px 9px; border-radius: 999px; font-size: 12px; }
.mi-bench { margin-top: 10px; }

/* Chat panel */
.chatpanel { flex: 0 0 380px; max-width: 380px; display: flex; flex-direction: column; border-left: 1px solid var(--border); background: var(--surface); min-height: 0; }
.chat-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.chat-title { font-weight: 700; }
.iconbtn { border: none; background: none; color: var(--muted); cursor: pointer; font-size: 15px; }
.rail-v { display: flex; gap: 6px; padding: 10px 12px; overflow-x: auto; border-bottom: 1px solid var(--border); }
.agent { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--border); background: var(--card); border-radius: 10px; cursor: pointer; color: var(--fg); white-space: nowrap; }
.agent:hover { background: var(--hover); }
.agent.on { border-color: var(--accent); outline: 2px solid var(--accent); }
.agent .av { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
.agent .al { display: flex; flex-direction: column; text-align: left; }
.agent .an { font-weight: 600; font-size: 12px; }
.agent .as { color: var(--muted); font-size: 10px; }
.scopebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.scope-l { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
.scope { background: var(--input-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 5px 8px; font: inherit; font-size: 12px; flex: 1; min-width: 0; }
.thread { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.empty { margin: auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.empty-t { font-size: 15px; font-weight: 700; }
.empty-s { color: var(--muted); font-size: 12px; }
.starters { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; width: 100%; }
.starter { text-align: left; padding: 10px 12px; border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px; }
.starter:hover { background: var(--hover); border-color: var(--accent); }
.av-lg { width: 46px; height: 46px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 18px; font-weight: 700; }
.row { display: flex; gap: 8px; align-items: flex-end; }
.row.user { justify-content: flex-end; }
.msg-av { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 10px; font-weight: 700; flex: 0 0 auto; }
.bubble { max-width: 82%; padding: 9px 12px; border-radius: 14px; }
.bubble.user { background: var(--bubble-user); border-bottom-right-radius: 4px; }
.bubble.agent { background: var(--bubble-agent); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
.bubble .tools { margin-top: 6px; color: var(--muted); font-size: 11px; border-top: 1px dashed var(--border); padding-top: 5px; }
.md > *:first-child { margin-top: 0; } .md > *:last-child { margin-bottom: 0; }
.md p { margin: 7px 0; } .md h3, .md h4, .md h5 { margin: 10px 0 5px; font-size: 13px; }
.md ul, .md ol { margin: 5px 0; padding-left: 18px; } .md li { margin: 3px 0; }
.md code { background: var(--chip); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.md pre { background: var(--chip); padding: 10px; border-radius: 8px; overflow-x: auto; } .md pre code { background: none; padding: 0; }
.md a { color: var(--accent); }
.typing { display: inline-flex; gap: 4px; }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: b 1.2s infinite ease-in-out; }
.typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
@keyframes b { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border); }
.input { flex: 1; resize: none; max-height: 120px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; background: var(--input-bg); color: var(--fg); font: inherit; }
.input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
.send { width: 42px; border: none; border-radius: 10px; background: var(--accent); color: var(--accent-fg); cursor: pointer; font-size: 15px; }
.send:disabled { opacity: .5; cursor: default; }

@media (max-width: 860px) {
  .mi { grid-template-columns: 1fr; }
  .chatpanel { position: fixed; top: 0; right: 0; bottom: 0; width: 92vw; max-width: 420px; z-index: 30; box-shadow: -8px 0 24px rgba(0,0,0,.25); }
}

/* Deal detail drawer (native Station) */
.drawer-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 40; display: flex; justify-content: flex-end; }
.drawer { width: min(560px, 96vw); height: 100%; background: var(--bg); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: -10px 0 30px rgba(0,0,0,.3); }
.drawer-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
.drawer-title { font-weight: 700; font-size: 15px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chbtn { border: 1px solid var(--accent); background: var(--chip); color: var(--accent); border-radius: 8px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; white-space: nowrap; }
.chbtn:hover:not(:disabled) { background: var(--accent); color: var(--accent-fg); }
.chbtn:disabled { opacity: .6; cursor: default; }
.drawer-body { flex: 1; overflow-y: auto; padding: 16px; }
.dd-sub { color: var(--muted); font-size: 13px; }
.dd-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.dd-thesis { color: var(--fg); font-size: 13px; margin: 8px 0 4px; }
.dd-panel { border: 1px solid var(--border); border-radius: 12px; background: var(--card); margin-top: 14px; overflow: hidden; }
.dd-panel-h { font-weight: 700; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.verdict { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.verdict-state { font-weight: 800; padding: 3px 10px; border-radius: 999px; background: var(--chip); white-space: nowrap; }
.verdict.ok .verdict-state { background: #1b7f37; color: #fff; }
.verdict.warn .verdict-state { background: #b8860b; color: #fff; }
.verdict.bad .verdict-state { background: #b23b3b; color: #fff; }
.verdict-head { font-size: 13px; }
.dd-artifacts { padding: 6px 14px 12px; display: flex; flex-direction: column; gap: 6px; }
.artifact { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.artifact .a-ic { font-weight: 800; }
.artifact.done .a-ic { color: #1b7f37; }
.artifact.todo .a-ic { color: var(--muted); }
.artifact .a-label { font-weight: 600; }
.artifact .a-detail { color: var(--muted); font-size: 12px; }
.dd-figs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; padding: 12px 14px; }
.dd-fig { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--surface); }
.dd-fig .fig-v { font-size: 18px; font-weight: 700; }
.dd-fig .fig-l { font-size: 12px; }
.dd-fig .fig-src { color: var(--muted); font-size: 11px; margin-top: 3px; }
.dd-note { color: var(--muted); font-size: 11px; padding: 0 14px 12px; }
.dd-lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 14px; }
.dd-lane { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--surface); }
.lane-top { display: flex; justify-content: space-between; align-items: baseline; }
.lane-name { font-weight: 600; font-size: 13px; }
.lane-status { color: var(--muted); font-size: 11px; }
.lane-bar { height: 5px; background: var(--hover); border-radius: 4px; overflow: hidden; margin: 6px 0; }
.lane-bar span { display: block; height: 100%; background: var(--accent); }
.lane-owner { color: var(--muted); font-size: 11px; }

/* Deal workspace tabs / stages / orchestration */
.dd-topmeta { padding: 12px 16px 0; }
.dd-tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--border); overflow-x: auto; background: var(--surface); }
.dd-tab { border: none; background: none; color: var(--muted); padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; border-bottom: 2px solid transparent; white-space: nowrap; }
.dd-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.dd-actionnote { background: var(--chip); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 12px; margin-bottom: 12px; }
.stage-group { margin-bottom: 14px; }
.stage-name { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); margin-bottom: 6px; }
.stage-steps { display: flex; gap: 6px; flex-wrap: wrap; }
.fstep-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 62px; padding: 8px 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--fg); cursor: pointer; font: inherit; }
.fstep-btn:hover { background: var(--hover); }
.fstep-btn .fs-key { font-weight: 800; font-size: 12px; }
.fstep-btn .fs-label { font-size: 10px; color: var(--muted); }
.fstep-btn.done { border-color: #1b7f37; }
.fstep-btn.done .fs-key { color: #1b7f37; }
.fstep-btn.cur { border-color: var(--accent); background: var(--chip); }
.fstep-btn.on { outline: 2px solid var(--accent); }
.orch-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.btn { border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 8px; padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; }
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.btn.ghost { background: none; }
.artifact-view { padding: 12px 14px; }
.av-kind { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); margin-bottom: 6px; }
.av-list { margin: 0; padding-left: 18px; font-size: 13px; } .av-list li { margin: 3px 0; }
.dd-empty-p { padding: 14px; color: var(--muted); font-size: 13px; }
.ws-grid { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ws-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; border-bottom: 1px dashed var(--border); padding-bottom: 6px; }
.ws-row a { color: var(--accent); }

/* Deep-dive research (Stage 1 target detail + analyst research; Stage 2 market research) */
.chip.ok { background: #1b7f37; color: #fff; } .chip.warn { background: #b8860b; color: #fff; } .chip.bad, .chip.closed-lost { background: #b23b3b; color: #fff; }
.chip.closed-won { background: #1b7f37; color: #fff; } .chip.on-hold { background: #b8860b; color: #fff; } .chip.ai { background: var(--accent); color: var(--accent-fg); }
.td-toggle { border: none; background: none; color: var(--accent); cursor: pointer; font: inherit; font-weight: 600; font-size: 12px; padding: 4px 0 0; }
.td-wrap { width: 100%; margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 8px; }
.td-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.td-panel { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 10px 12px; min-width: 0; }
.td-panel.td-wide { grid-column: 1 / -1; }
.td-panel-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; margin-bottom: 8px; }
.td-filings { display: flex; flex-direction: column; gap: 8px; }
.td-filing { border-left: 2px solid var(--border); padding-left: 8px; }
.td-filing-head { font-weight: 600; font-size: 13px; }
.td-link { color: var(--accent); text-decoration: none; font-size: 12px; }
.q-card { display: flex; flex-direction: column; gap: 4px; }
.q-top { display: flex; align-items: center; gap: 10px; }
.q-score { font-size: 22px; font-weight: 700; border-radius: 8px; padding: 2px 10px; }
.q-score.ok { color: #1b7f37; } .q-score.warn { color: #b8860b; } .q-score.bad { color: #b23b3b; }
.q-rating { font-weight: 700; }
.td-summary { font-size: 13px; background: var(--hover); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.td-row { display: grid; grid-template-columns: 130px 1fr; gap: 10px; padding: 6px 0; border-top: 1px dashed var(--border); font-size: 13px; }
.td-row.rec { font-weight: 600; }
.td-k { color: var(--muted); font-size: 12px; }
.td-risks { margin: 0; padding-left: 16px; } .td-risks li { margin: 2px 0; }
.rc-list { display: flex; flex-direction: column; }
.rc { border-bottom: 1px solid var(--border); }
.rc-hd { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: none; border: none; cursor: pointer; color: var(--fg); text-align: left; }
.rc-hd:hover { background: var(--hover); }
.rc-caret { color: var(--muted); }
.rc-main { flex: 1; min-width: 0; }
.rc-body { padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.rc-rank { display: flex; align-items: center; gap: 8px; }
.rc-rank-badge { font-size: 18px; font-weight: 700; color: var(--accent); }
.rc-peer { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 3px 0; }
.peer-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.peer-dot.listed { background: #1b7f37; } .peer-dot.private { background: var(--muted); }
.rc-view { border-top: 1px dashed var(--border); padding: 8px 0; font-size: 13px; }
.rc-view-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.mr-list { display: flex; flex-direction: column; padding: 6px 14px 12px; }
.mr-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.mr-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.mr-val { color: var(--muted); font-size: 12px; }
/* Workspace VDR + quick links */
.chbtn.spo { }
.wsp-links { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 14px; }
.orch-links { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 0 12px; }
.wsp-link { border: 1px solid var(--border); background: var(--surface); color: var(--fg); border-radius: 8px; padding: 8px 12px; cursor: pointer; font: inherit; font-weight: 600; font-size: 13px; }
.wsp-link:hover { border-color: var(--accent); }
.wsp-link:disabled { opacity: .5; cursor: default; }
.wsp-link.teams { border-color: #4b53bc; color: #4b53bc; }
.wsp-link.spo { border-color: #036c70; color: #036c70; }
.wsp-link.mr { border-color: var(--accent); color: var(--accent); }
.vdr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 12px 14px; }
.vdr-folder { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; background: var(--surface); text-decoration: none; color: var(--fg); font-size: 13px; }
.vdr-folder:hover { border-color: var(--accent); color: var(--accent); }
.tpl-list { display: flex; flex-direction: column; padding: 6px 14px 12px; }
.tpl-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--border); text-decoration: none; color: var(--fg); font-size: 13px; }
.tpl-row:hover .tpl-name { color: var(--accent); }
.tpl-name { font-weight: 600; }
@media (max-width: 620px) { .td-grid { grid-template-columns: 1fr; } .td-row { grid-template-columns: 1fr; gap: 2px; } }
`;
