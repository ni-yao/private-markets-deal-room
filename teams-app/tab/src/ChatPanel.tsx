import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown } from './md';
import type { Agent, Deal } from './types';

type Msg = { role: 'user' | 'agent'; text: string; source?: string; tools?: string[]; pending?: boolean };

const DEAL_STARTERS = [
  'Give me the IC readiness verdict and what is blocking it.',
  'Show comparable deals and IC precedents from Fabric.',
  'What are the top risks and the compliance status?',
];

export default function ChatPanel({ agents, deals, focusDealId, onClose }: {
  agents: Agent[]; deals: Deal[]; focusDealId: string; onClose: () => void;
}) {
  const [agentKey, setAgentKey] = useState('orchestrator');
  const [dealId, setDealId] = useState('');
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [prevId, setPrevId] = useState<Record<string, string | undefined>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (focusDealId) setDealId(focusDealId); }, [focusDealId]);

  const agent = agents.find((a) => a.key === agentKey) || agents[0];
  const threadKey = `${agent?.key}:${dealId || 'portfolio'}`;
  const messages = threads[threadKey] || [];
  const activeDeal = deals.find((x) => x.id === dealId) || null;
  const starters = useMemo(() => (dealId ? DEAL_STARTERS.concat(agent?.starters.slice(0, 1) || []) : agent?.starters.slice() || []), [agent, dealId]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending || !agent) return;
    setInput('');
    setThreads((t) => ({ ...t, [threadKey]: [...(t[threadKey] || []), { role: 'user', text: msg }, { role: 'agent', text: '', pending: true }] }));
    setSending(true);
    const endpoint = agent.kind === 'orchestrator' ? '/api/deal-agent/chat' : `/api/persona-agents/${agent.persona}/chat`;
    const body: Record<string, unknown> = { message: msg, previousResponseId: prevId[threadKey] };
    if (dealId) body.dealId = dealId;
    if (agent.kind === 'orchestrator') body.scope = dealId ? 'deal' : 'portfolio';
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      const reply = data?.reply || data?.error || 'No response.';
      const tools = Array.isArray(data?.toolCalls) && data.toolCalls.length ? Array.from(new Set(data.toolCalls)) as string[] : undefined;
      if (data?.responseId) setPrevId((p) => ({ ...p, [threadKey]: data.responseId }));
      setThreads((t) => { const arr = (t[threadKey] || []).slice(); arr[arr.length - 1] = { role: 'agent', text: reply, source: data?.source, tools }; return { ...t, [threadKey]: arr }; });
    } catch (e: any) {
      setThreads((t) => { const arr = (t[threadKey] || []).slice(); arr[arr.length - 1] = { role: 'agent', text: `Sorry — I couldn't reach the agent (${String(e?.message || e)}).`, source: 'error' }; return { ...t, [threadKey]: arr }; });
    } finally { setSending(false); }
  }

  if (!agent) return null;

  return (
    <aside className="chatpanel">
      <div className="chat-head">
        <div className="chat-title">Ask the agents</div>
        <button className="iconbtn" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      <div className="rail-v">
        {agents.map((a) => (
          <button key={a.key} onClick={() => setAgentKey(a.key)} className={`agent${a.key === agentKey ? ' on' : ''}`} title={a.subtitle}>
            <span className="av">{a.initials}</span>
            <span className="al"><span className="an">{a.label}</span><span className="as">{a.subtitle}</span></span>
          </button>
        ))}
      </div>

      <div className="scopebar">
        <span className="scope-l">Focus</span>
        <select value={dealId} onChange={(e) => setDealId(e.target.value)} className="scope">
          <option value="">Whole portfolio</option>
          {deals.map((d) => (<option key={d.id} value={d.id}>{d.company}{d.stageName ? ` · ${d.stageName}` : ''}</option>))}
        </select>
      </div>

      <div ref={scrollRef} className="thread">
        {messages.length === 0 ? (
          <div className="empty">
            <div className="av-lg">{agent.initials}</div>
            <div className="empty-t">Ask {agent.label}</div>
            <div className="empty-s">{agent.subtitle}{activeDeal ? ` · ${activeDeal.company}` : ''}</div>
            <div className="starters">{starters.map((s, i) => (<button key={i} className="starter" onClick={() => send(s)}>{s}</button>))}</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              {m.role === 'agent' ? <span className="msg-av">{agent.initials}</span> : null}
              <div className={`bubble ${m.role}`}>
                {m.pending ? (<span className="typing"><span></span><span></span><span></span></span>)
                  : m.role === 'agent' ? (<><div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />{m.tools?.length ? <div className="tools">grounded via {m.tools.join(', ')}</div> : m.source === 'live' ? <div className="tools">live</div> : null}</>)
                    : (<div>{m.text}</div>)}
              </div>
            </div>
          ))
        )}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea className="input" placeholder={`Message ${agent.label}…`} value={input} rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="send" type="submit" disabled={sending || !input.trim()} aria-label="Send">{sending ? '…' : '➤'}</button>
      </form>
    </aside>
  );
}
