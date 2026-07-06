import { useEffect, useState } from 'react';
import type { Mailbox, SignalCompany, SourcingDesk } from '../types';
import { api } from '../api';

// CxO Signals summary — a compact card on the Deal Sourcing page. Surfaces the
// M365 signal metrics (emails / chats / meeting notes) and the number of target
// companies identified, and opens the full CxO Signals desk on click.
export function CxoSummary({ onOpen }: { onOpen: () => void }) {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [companies, setCompanies] = useState<SignalCompany[] | null>(null);

  useEffect(() => {
    api.mailbox().then(setMailbox).catch(() => {});
    api.signalCompanies().then(setCompanies).catch(() => {});
  }, []);

  const emails = mailbox?.emails.length ?? 0;
  const chats = mailbox?.chats.length ?? 0;
  const meetings = mailbox?.meetings.length ?? 0;
  const targets = companies?.length ?? 0;

  return (
    <button className="src-summary cxo" onClick={onOpen}>
      <div className="ss-head">
        <span className="ss-ic">✦</span>
        <div className="ss-titles">
          <div className="ss-title">CxO Signals</div>
          <div className="ss-sub">M365 intent — emails, chats & meeting notes</div>
        </div>
        <span className="ss-go">explore →</span>
      </div>
      <div className="ss-metrics">
        <div className="ss-metric"><span className="ss-n">{emails}</span><span className="ss-l">✉ Emails</span></div>
        <div className="ss-metric"><span className="ss-n">{chats}</span><span className="ss-l">💬 Chats</span></div>
        <div className="ss-metric"><span className="ss-n">{meetings}</span><span className="ss-l">🗓 Meeting notes</span></div>
      </div>

      <div className="ss-colist">
        <div className="ss-colist-hd">
          <span className="ss-foot-n">{targets}</span> target{targets === 1 ? '' : 's'} identified from signals
        </div>
        {companies == null && <div className="ss-empty">Loading CxO signals…</div>}
        {companies != null && targets === 0 && <div className="ss-empty">No CxO targets yet — signals will surface here.</div>}
        {(companies ?? []).map((c) => (
          <div className="ss-corow" key={c.id}>
            <span className="ss-coname"><span className={`intent-dot ${c.intent}`} /> {c.name}</span>
            <span className="ss-cometa">{c.sector}</span>
            <span className="ss-cofilings">✉ {c.counts.total}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

// News Signals summary — a compact card on the Deal Sourcing page. Lists the
// companies surfaced in the news with how many catalyst items each carries, and
// opens the full News Signals desk on click. (Filings & Morningstar now live on
// the ranked-target rows below.)
export function NewsSummary({ onOpen }: { onOpen: () => void }) {
  const [desk, setDesk] = useState<SourcingDesk | null>(null);

  useEffect(() => {
    api.newsDesk().then(setDesk).catch(() => {});
  }, []);

  const companies = desk?.companies ?? [];
  const newsItems = companies.reduce((n, c) => n + c.news.length, 0);

  return (
    <button className="src-summary news" onClick={onOpen}>
      <div className="ss-head">
        <span className="ss-ic">📰</span>
        <div className="ss-titles">
          <div className="ss-title">News Signals</div>
          <div className="ss-sub">Public catalysts — companies in the news &amp; the “why now”</div>
        </div>
        <span className="ss-go">explore →</span>
      </div>

      <div className="ss-metrics">
        <div className="ss-metric"><span className="ss-n">{companies.length}</span><span className="ss-l">📈 In the news</span></div>
        <div className="ss-metric"><span className="ss-n">{newsItems}</span><span className="ss-l">📰 Catalyst items</span></div>
      </div>

      <div className="ss-colist">
        {desk == null && <div className="ss-empty">Loading news signals…</div>}
        {desk != null && companies.length === 0 && <div className="ss-empty">No companies in the news yet — run “Find more news”.</div>}
        {companies.map((c) => (
          <div className="ss-corow" key={c.id}>
            <span className="ss-coname">{c.name}{c.ticker ? <span className="ticker-badge">{c.ticker}</span> : null}</span>
            <span className="ss-cometa">{c.sector}</span>
            <span className="ss-cofilings">📰 {c.news.length}</span>
          </div>
        ))}
      </div>
    </button>
  );
}
