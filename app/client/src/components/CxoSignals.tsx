import { useEffect, useState } from 'react';
import type { Mailbox, SignalCompany, CrmRelationship, Intent } from '../types';
import { api } from '../api';
import { timeAgo } from './Bits';

interface Props {
  onBack: () => void;
}

type Tab = 'emails' | 'chats' | 'meetings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'emails', label: 'Emails', icon: '✉' },
  { id: 'chats', label: 'Chats', icon: '💬' },
  { id: 'meetings', label: 'Meeting notes', icon: '🗓' }
];

function IntentDot({ intent }: { intent: Intent }) {
  return <span className={`intent-dot ${intent}`} title={`${intent} intent`} />;
}

export function CxoSignals({ onBack }: Props) {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [companies, setCompanies] = useState<SignalCompany[]>([]);
  const [tab, setTab] = useState<Tab>('emails');
  const [expanded, setExpanded] = useState<string | null>('frostbite');
  const [crm, setCrm] = useState<Record<string, CrmRelationship>>({});
  const [crmLoading, setCrmLoading] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.mailbox(), api.signalCompanies()]).then(([mb, cos]) => {
      setMailbox(mb);
      setCompanies(cos);
    });
  }, []);

  async function checkCrm(id: string) {
    if (crm[id] || crmLoading) return;
    setCrmLoading(id);
    try {
      const r = await api.crm(id);
      setCrm((c) => ({ ...c, [id]: r }));
    } finally {
      setCrmLoading(null);
    }
  }

  if (!mailbox) {
    return (
      <div className="loading" style={{ height: 'calc(100vh - 0px)' }}>
        <div><div className="spin" /><div>Loading M365 signals…</div></div>
      </div>
    );
  }

  const totalItems = mailbox.emails.length + mailbox.chats.length + mailbox.meetings.length;

  return (
    <div className="signals-page">
      <div className="signals-head">
        <button className="back-btn" onClick={onBack}>← Back to Deal Sourcing</button>
        <div>
          <div className="sig-eyebrow">O1 · Deal Sourcing · CxO Signals</div>
          <h2 className="sig-title">Signals of intent &amp; receptivity</h2>
        </div>
        <div className="sig-sub">
          The <b>Deal-Sourcing Signal Agent</b> mines your M365 data (left) and groups the intent
          signals by target company (right).
        </div>
      </div>

      <div className="signals-body">
        {/* LEFT — my M365 data */}
        <div className="m365-panel">
          <div className="m365-hd">
            <span className="m365-title">My M365 data</span>
            <span className="m365-count">{totalItems} items</span>
          </div>
          <div className="tabs">
            {TABS.map((t) => {
              const n = mailbox[t.id].length;
              return (
                <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                  <span className="tab-ic">{t.icon}</span>
                  {t.label}
                  <span className="tab-n">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="m365-list">
            {tab === 'emails' && mailbox.emails.map((e) => (
              <div className="m-item" key={e.id}>
                <div className="m-top">
                  <IntentDot intent={e.intent} />
                  <span className="m-from">{e.from.split(' <')[0]}</span>
                  <span className="m-when">{timeAgo(e.when)}</span>
                </div>
                <div className="m-subject">{e.subject}</div>
                <div className="m-preview">{e.preview}</div>
                <div className="m-role">{e.role}</div>
              </div>
            ))}
            {tab === 'chats' && mailbox.chats.map((c) => (
              <div className="m-item" key={c.id}>
                <div className="m-top">
                  <IntentDot intent={c.intent} />
                  <span className="m-from">{c.from}</span>
                  <span className="m-when">{timeAgo(c.when)}</span>
                </div>
                <div className="m-preview">{c.preview}</div>
                <div className="m-role">{c.channel}</div>
              </div>
            ))}
            {tab === 'meetings' && mailbox.meetings.map((m) => (
              <div className="m-item" key={m.id}>
                <div className="m-top">
                  <IntentDot intent={m.intent} />
                  <span className="m-from">{m.title}</span>
                  <span className="m-when">{timeAgo(m.when)}</span>
                </div>
                <div className="m-preview">{m.preview}</div>
                <div className="m-role">{m.attendees}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — signals grouped by company */}
        <div className="companies-panel">
          <div className="companies-hd">
            <span className="m365-title">Signals by company</span>
            <span className="m365-count">{companies.length} targets</span>
          </div>

          {companies.map((c) => {
            const open = expanded === c.id;
            const r = crm[c.id];
            return (
              <div className={`co-card ${open ? 'open' : ''}`} key={c.id}>
                <button className="co-hd" onClick={() => setExpanded(open ? null : c.id)}>
                  <span className="co-caret">{open ? '▾' : '▸'}</span>
                  <div className="co-main">
                    <div className="co-name">{c.name} <IntentDot intent={c.intent} /></div>
                    <div className="co-meta">{c.sector} · {c.hq}</div>
                  </div>
                  <div className="co-counts">
                    <span title="emails">✉ {c.counts.emails}</span>
                    <span title="chats">💬 {c.counts.chats}</span>
                    <span title="meetings">🗓 {c.counts.meetings}</span>
                  </div>
                </button>

                {open && (
                  <div className="co-body">
                    <div className="co-summary">{c.summary}</div>

                    <div className="co-crm">
                      {!r ? (
                        <button className="crm-btn" onClick={() => checkCrm(c.id)} disabled={crmLoading === c.id}>
                          {crmLoading === c.id ? 'Checking Dynamics 365…' : '⌕ Check Dynamics 365 CRM relationship'}
                        </button>
                      ) : (
                        <div className={`crm-result ${r.exists ? 'found' : 'none'}`}>
                          <div className="crm-badge">{r.exists ? '● CRM relationship found' : '○ No CRM record — net new'}</div>
                          {r.exists && (
                            <div className="crm-detail">
                              <span><i>Status</i> {r.status}</span>
                              <span><i>Owner</i> {r.owner}</span>
                              <span><i>Opportunities</i> {r.opportunities}</span>
                              {r.lastContact && <span><i>Last contact</i> {timeAgo(r.lastContact)}</span>}
                            </div>
                          )}
                          <div className="crm-note">{r.note}</div>
                        </div>
                      )}
                    </div>

                    <SignalGroup label="Emails" icon="✉" items={c.signals.emails.map((e) => ({ id: e.id, head: e.from.split(' <')[0], sub: e.subject, body: e.preview, when: e.when, intent: e.intent }))} />
                    <SignalGroup label="Chats" icon="💬" items={c.signals.chats.map((x) => ({ id: x.id, head: x.from, sub: x.channel, body: x.preview, when: x.when, intent: x.intent }))} />
                    <SignalGroup label="Meeting notes" icon="🗓" items={c.signals.meetings.map((m) => ({ id: m.id, head: m.title, sub: m.attendees, body: m.preview, when: m.when, intent: m.intent }))} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SigItem { id: string; head: string; sub: string; body: string; when: string; intent: Intent; }

function SignalGroup({ label, icon, items }: { label: string; icon: string; items: SigItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="sig-group">
      <div className="sig-group-hd">{icon} {label} <span className="sig-group-n">{items.length}</span></div>
      {items.map((it) => (
        <div className="sig-item" key={it.id}>
          <span className={`intent-dot ${it.intent}`} />
          <div className="sig-item-main">
            <div className="sig-item-head">{it.head} <span className="sig-item-when">· {timeAgo(it.when)}</span></div>
            <div className="sig-item-sub">{it.sub}</div>
            <div className="sig-item-body">{it.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
