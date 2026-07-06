import { useEffect, useMemo, useState } from 'react';
import type { SourcingDesk, DeskSource, DeskNews, DeskCatalyst, DeskCompany } from '../types';
import { api } from '../api';
import { timeAgo } from './Bits';

interface Props {
  onBack: () => void;
}

// News Signals — the public-catalyst analogue of CxO Signals. The Deal-Sourcing
// News Agent scans the live web (left, a flat feed with source tabs) and groups
// the catalysts by target company (right). Filings & Morningstar have moved to the
// ranked-target rows on the Deal Sourcing page.
export function NewsSignals({ onBack }: Props) {
  const [desk, setDesk] = useState<SourcingDesk | null>(null);
  const [tab, setTab] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [findingMore, setFindingMore] = useState(false);
  const [scanningFormD, setScanningFormD] = useState(false);
  const [editing, setEditing] = useState<{ finding: DeskNews; companyId: string } | null>(null);

  useEffect(() => {
    api.newsDesk().then(setDesk);
  }, []);

  // Flatten every news item across companies into one chronological feed, tagging
  // each with the company it maps to (so the left↔right connection is legible).
  const feed = useMemo(() => {
    const items = (desk?.companies ?? []).flatMap((c) =>
      c.news.map((n) => ({ ...n, company: c.name, companyId: c.id, ticker: c.ticker }))
    );
    items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
    return items;
  }, [desk]);

  // Source tabs derived from the distinct publishers actually present in the feed.
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of feed) {
      const src = n.publisher || 'Web';
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const short = (s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s);
    return [{ id: 'all', label: 'All sources', n: feed.length }, ...sorted.map(([label, n]) => ({ id: label, label: short(label), n }))];
  }, [feed]);

  if (!desk) {
    return (
      <div className="loading" style={{ height: 'calc(100vh - 0px)' }}>
        <div><div className="spin" /><div>Loading news signals…</div></div>
      </div>
    );
  }

  const catById = Object.fromEntries(desk.catalysts.map((c) => [c.id, c]));
  const filtered = tab === 'all' ? feed : feed.filter((n) => (n.publisher || 'Web') === tab);

  async function findMore() {
    if (findingMore) return;
    setFindingMore(true);
    try {
      const { desk: d } = await api.findMoreNews();
      setDesk(d);
    } finally {
      setFindingMore(false);
    }
  }

  async function scanFormD() {
    if (scanningFormD) return;
    setScanningFormD(true);
    try {
      const r = await api.scanFormD();
      setDesk(r.desk);
    } finally {
      setScanningFormD(false);
    }
  }

  async function changeCatalyst(findingId: string, catalyst: string) {
    await api.setFindingCatalyst(findingId, catalyst);
    setDesk((d) => {
      if (!d) return d;
      const companies = d.companies.map((c) => ({
        ...c,
        news: c.news.map((n) => (n.id === findingId ? { ...n, catalyst, manualOverride: true } : n))
      }));
      return { ...d, companies };
    });
    setEditing((e) => (e ? { ...e, finding: { ...e.finding, catalyst, manualOverride: true } } : e));
  }

  return (
    <div className="signals-page">
      <div className="signals-head">
        <button className="back-btn" onClick={onBack}>← Back to Deal Sourcing</button>
        <div>
          <div className="sig-eyebrow">O1 · Deal Sourcing · News Signals</div>
          <h2 className="sig-title">Public catalysts — the “why now”</h2>
        </div>
        <div className="sig-sub">
          The <b>Deal-Sourcing News Agent</b> scans the live web (left) and groups the catalyst
          signals by target company (right). Filings &amp; Morningstar now live on each ranked target.
        </div>
      </div>

      <div className="signals-body">
        {/* LEFT — the news feed, with source tabs */}
        <div className="m365-panel">
          <div className="m365-hd">
            <span className="m365-title">News feed</span>
            <span className="m365-count">{feed.length} items</span>
          </div>
          <div className="tabs wrap">
            {tabs.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                <span className="tab-n">{t.n}</span>
              </button>
            ))}
          </div>

          <div className="m365-list">
            {filtered.length === 0 && <div className="ss-empty" style={{ padding: 16 }}>No news items yet — run “Find more news”.</div>}
            {filtered.map((n) => (
              <div className="m-item" key={n.id}>
                <div className="m-top">
                  <span className={`src-badge ${n.source}`}>{n.publisher || sourceName(desk.sources, n.source)}</span>
                  <span className="m-when">{timeAgo(n.when)}</span>
                </div>
                <div className="m-subject">{n.headline}</div>
                <div className="m-preview">{n.detail}</div>
                <div className="m-newsfoot">
                  <span className="m-company">{n.company}{n.ticker ? <span className="ticker-badge">{n.ticker}</span> : null}</span>
                  <button className="cat-chip" onClick={() => setEditing({ finding: n, companyId: n.companyId })} title="AI-labeled catalyst — click to review / change">
                    <span className="cat-chip-ic">{catById[n.catalyst]?.icon}</span>
                    {catById[n.catalyst]?.label}
                    <span className={`cat-conf ${n.manualOverride ? 'manual' : ''}`}>
                      {n.manualOverride ? 'manual' : `AI ${Math.round(n.confidence * 100)}%`}
                    </span>
                  </button>
                  {n.url && <a className="nf-source" href={n.url} target="_blank" rel="noreferrer">🔗 {sourceHost(n.url)}</a>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — companies extracted from the news */}
        <div className="companies-panel">
          <div className="companies-hd">
            <span className="m365-title">Companies in the news</span>
            <span className="m365-count">{desk.companies.length} targets</span>
          </div>

          <div className="news-actions">
            <button className="find-more" onClick={findMore} disabled={findingMore}>
              {findingMore ? '✦ Scouting the live web (Bing-grounded agent)…' : '↻ Find more news'}
            </button>
            <button className="find-more formd" onClick={scanFormD} disabled={scanningFormD}>
              {scanningFormD ? '⚑ Scanning SEC Form D…' : '⚑ Scan Form D (private raises)'}
            </button>
          </div>

          {desk.companies.length === 0 && <div className="ss-empty" style={{ padding: 16 }}>No companies in the news yet — run “Find more news”.</div>}
          {desk.companies.map((c) => (
            <NewsCompanyCard
              key={c.id}
              c={c}
              open={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
              sources={desk.sources}
              catById={catById}
              onEditCatalyst={(finding) => setEditing({ finding, companyId: c.id })}
            />
          ))}
        </div>
      </div>

      {editing && (
        <CatalystModal
          finding={editing.finding}
          catalysts={desk.catalysts}
          onPick={(cid) => changeCatalyst(editing.finding.id, cid)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function NewsCompanyCard({ c, open, onToggle, sources, catById, onEditCatalyst }: {
  c: DeskCompany;
  open: boolean;
  onToggle: () => void;
  sources: DeskSource[];
  catById: Record<string, DeskCatalyst>;
  onEditCatalyst: (finding: DeskNews) => void;
}) {
  return (
    <div className={`co-card ${open ? 'open' : ''}`}>
      <button className="co-hd" onClick={onToggle}>
        <span className="co-caret">{open ? '▾' : '▸'}</span>
        <div className="co-main">
          <div className="co-name">{c.name}{c.ticker && <span className="ticker-badge">{c.ticker}</span>}{c.live && <span className="live-badge">● LIVE</span>}</div>
          <div className="co-meta">{c.sector} · {c.region} · ${c.dealSize}M{c.estimated ? ' (est.)' : ''} · {c.ownership}</div>
        </div>
        <div className="co-counts"><span title="news items">📰 {c.news.length}</span></div>
      </button>

      {open && (
        <div className="co-body">
          {c.news.map((n) => (
            <div className="news-find" key={n.id}>
              <div className="nf-top">
                <span className={`src-badge ${n.source}`}>{n.publisher || sourceName(sources, n.source)}</span>
                <span className="nf-when">{timeAgo(n.when)}</span>
              </div>
              <div className="nf-headline">{n.headline}</div>
              <div className="nf-detail">{n.detail}</div>
              {n.url && (
                <a className="nf-source" href={n.url} target="_blank" rel="noreferrer">🔗 {sourceHost(n.url)}</a>
              )}
              <button className="cat-chip" onClick={() => onEditCatalyst(n)} title="AI-labeled catalyst — click to review / change">
                <span className="cat-chip-ic">{catById[n.catalyst]?.icon}</span>
                {catById[n.catalyst]?.label}
                <span className={`cat-conf ${n.manualOverride ? 'manual' : ''}`}>
                  {n.manualOverride ? 'manual' : `AI ${Math.round(n.confidence * 100)}%`}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function sourceName(sources: DeskSource[], id: string) {
  return sources.find((s) => s.id === id)?.name || id;
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function CatalystModal({ finding, catalysts, onPick, onClose }: {
  finding: DeskNews; catalysts: DeskCatalyst[]; onPick: (id: string) => void; onClose: () => void;
}) {
  return (
    <div className="cat-overlay" onClick={onClose}>
      <div className="cat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cat-modal-hd">
          <div>
            <div className="cat-modal-eyebrow">Catalyst category · {finding.manualOverride ? 'manually set' : `AI-labeled ${Math.round(finding.confidence * 100)}%`}</div>
            <div className="cat-modal-headline">{finding.headline}</div>
          </div>
          <button className="cat-close" onClick={onClose}>✕</button>
        </div>

        <div className="cat-modal-label">Change the catalyst</div>
        <div className="cat-options">
          {catalysts.map((c) => (
            <button key={c.id} className={`cat-opt ${finding.catalyst === c.id ? 'sel' : ''}`} onClick={() => onPick(c.id)}>
              <span className="cat-opt-ic">{c.icon}</span>{c.label}
            </button>
          ))}
        </div>

        <div className="cat-modal-label">Catalyst reference</div>
        <div className="cat-table">
          <div className="cat-trow cat-thead">
            <div>Catalyst</div><div>What the analyst is scanning for</div><div>Why it's actionable</div>
          </div>
          {catalysts.map((c) => (
            <div className={`cat-trow ${finding.catalyst === c.id ? 'hl' : ''}`} key={c.id}>
              <div className="cat-tcell-name">{c.icon} {c.label}</div>
              <div>{c.scanning}</div>
              <div>{c.actionable}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
