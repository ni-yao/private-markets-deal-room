import { useEffect, useRef, useState } from 'react';
import type { Candidate, ChatMessage } from '../types';
import { api } from '../api';

interface Props {
  candidate: Candidate;
  agent: string;
  onClose: () => void;
}

const STARTERS = [
  'Why this recommendation?',
  'What are the key risks?',
  'How does it fit the mandate?',
  'What diligence would you run next?'
];

// A persistent floating chat window: the analyst converses with the step's
// agent about ONE candidate. History is loaded from and saved to the server so
// closing and reopening the popup resumes the same thread.
export function CandidateChat({ candidate, agent, onClose }: Props) {
  const [log, setLog] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.candidateChat(candidate.id)
      .then((r) => { if (alive) { setLog(r.log || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [candidate.id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, busy, loading]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput('');
    setBusy(true);
    setLog((l) => [...l, { role: 'user', content: msg, at: new Date().toISOString() }]);
    try {
      const r = await api.sendCandidateChat(candidate.id, msg);
      setLog(r.log);
    } catch {
      setLog((l) => [...l, { role: 'agent', content: 'Sorry — I could not reach the model just now. Please try again.', at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="cchat" role="dialog" aria-label={`Chat with ${agent} about ${candidate.company}`}>
      <div className="cchat-head">
        <div className="cchat-id">
          <div className="cchat-agent">✦ {agent}</div>
          <div className="cchat-co">{candidate.company} · {candidate.sector} · ${candidate.dealSize}M</div>
        </div>
        <button className="cchat-x" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="cchat-body" ref={bodyRef}>
        {loading && <div className="cchat-note">Loading conversation…</div>}

        {!loading && log.length === 0 && (
          <div className="cchat-intro">
            Ask the <b>{agent}</b> about <b>{candidate.company}</b> — its mandate fit, the screen, risks, comps, or what diligence to run next.
            <div className="cchat-starters">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {log.map((m, i) => (
          <div className={`cchat-msg ${m.role}`} key={i}>
            <div className="cchat-bubble">{m.content}</div>
          </div>
        ))}

        {busy && (
          <div className="cchat-msg agent">
            <div className="cchat-bubble typing"><i /><i /><i /></div>
          </div>
        )}
      </div>

      <div className="cchat-input">
        <textarea
          ref={inputRef}
          value={input}
          placeholder={`Message the ${agent}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
          rows={1}
        />
        <button className="btn primary" onClick={() => send(input)} disabled={busy || !input.trim()}>Send</button>
      </div>
    </div>
  );
}
