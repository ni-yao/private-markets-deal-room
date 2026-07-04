import { useEffect, useState } from 'react';
import type { SourcingDesk, DeskSource, DeskCompany, DeskNews, DeskCatalyst, SourceTestResult } from '../types';
import { api } from '../api';
import { timeAgo } from './Bits';

interface Props {
  onBack: () => void;
}

const ROLE_META: Record<string, { tag: string; color: string }> = {
  discover: { tag: 'Discover', color: '#2563eb' },
  confirm: { tag: 'Confirm', color: '#7c3aed' },
  quality: { tag: 'Quality', color: '#0d9488' }
};

export function NewsFilings({ onBack }: Props) {
  const [desk, setDesk] = useState<SourcingDesk | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, SourceTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const [openNews, setOpenNews] = useState<Set<string>>(new Set());
  const [openFilings, setOpenFilings] = useState<Set<string>>(new Set());
  const [qualityRun, setQualityRun] = useState<Set<string>>(new Set());
  const [runningQuality, setRunningQuality] = useState<string | null>(null);
  const [findingMore, setFindingMore] = useState(false);
  const [editing, setEditing] = useState<{ finding: DeskNews; companyId: string } | null>(null);

  useEffect(() => {
    api.newsDesk().then((d) => {
      setDesk(d);
      // "In the News" starts fully collapsed. Companies whose Morningstar check
      // has already run (persisted, quality.live) show their card immediately;
      // any not-yet-checked company auto-runs a real Morningstar check once.
      setOpenNews(new Set());
      setQualityRun(new Set(d.companies.filter((c) => c.quality?.live).map((c) => c.id)));
      autoRunQuality(d.companies.filter((c) => !c.quality?.live).map((c) => c.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run the real Morningstar quality check for a batch of companies, one at a
  // time (gentle on the MCP), updating each card as its result returns.
  async function autoRunQuality(ids: string[]) {
    for (const id of ids) {
      try {
        const q = await api.runQuality(id);
        setDesk((d) => (d ? { ...d, companies: d.companies.map((c) => (c.id === id ? { ...c, quality: q } : c)) } : d));
        setQualityRun((s) => new Set([...s, id]));
      } catch {
        /* leave the manual button available for a retry */
      }
    }
  }

  if (!desk) {
    return (
      <div className="loading" style={{ height: 'calc(100vh - 60px)' }}>
        <div><div className="spin" /><div>Loading the sourcing desk…</div></div>
      </div>
    );
  }

  const catById = Object.fromEntries(desk.catalysts.map((c) => [c.id, c]));
  const sourcesByRole = (role: string) => desk.sources.filter((s) => s.role === role);

  async function testSource(id: string) {
    setTesting(id);
    setExpandedSource(id);
    try {
      const r = await api.testSource(id);
      setTests((t) => ({ ...t, [id]: r }));
    } finally {
      setTesting(null);
    }
  }

  async function findMore() {
    if (findingMore) return;
    setFindingMore(true);
    const priorIds = new Set(desk?.companies.map((c) => c.id) ?? []);
    try {
      const { desk: d } = await api.findMoreNews();
      setDesk(d);
      // Any newly discovered company auto-runs BOTH quantify-with-filings and the
      // Morningstar quality check. "In the News" stays collapsed for new finds.
      const newIds = d.companies.map((c) => c.id).filter((id) => !priorIds.has(id));
      if (newIds.length) {
        setOpenFilings((s) => new Set([...s, ...newIds]));
        autoRunQuality(newIds);
      }
    } finally {
      setFindingMore(false);
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

  async function runQuality(companyId: string) {
    if (runningQuality) return;
    setRunningQuality(companyId);
    try {
      const q = await api.runQuality(companyId);
      setDesk((d) => {
        if (!d) return d;
        return { ...d, companies: d.companies.map((c) => (c.id === companyId ? { ...c, quality: q } : c)) };
      });
      setQualityRun((s) => new Set([...s, companyId]));
    } finally {
      setRunningQuality(null);
    }
  }

  const toggleNews = (id: string) =>
    setOpenNews((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const l1 = desk.l1;

  return (
    <div className="desk-page">
      {/* Header + L1 mandate */}
      <div className="desk-head">
        <button className="back-btn" onClick={onBack}>← Back to Deal Sourcing</button>
        <div className="desk-titles">
          <div className="sig-eyebrow">O1 · Deal Sourcing · News &amp; Filings</div>
          <h2 className="sig-title">Public catalysts — the "why now"</h2>
        </div>
      </div>

      <div className="l1-banner">
        <span className="l1-tag">L1 · Fund mandate</span>
        <div className="l1-main">
          <div className="l1-name">{l1.name}</div>
          <div className="l1-crit">
            <span>{l1.sector.join(' · ')}</span>
            <span>·</span>
            <span>{l1.region.join(' · ')}</span>
            <span>·</span>
            <span>€{l1.sizeMin}–{l1.sizeMax}M EV</span>
          </div>
        </div>
        <div className="l1-note">Filtering the news universe to what this fund can actually deploy into.</div>
      </div>

      {/* Source table */}
      <div className="src-table">
        <div className="src-row src-th">
          <div>Source</div>
          <div>Primary job in News &amp; filings</div>
          <div>Sweet spot</div>
          <div>Role</div>
        </div>
        {desk.sources.map((s) => (
          <SourceRow
            key={s.id}
            s={s}
            expanded={expandedSource === s.id}
            test={tests[s.id]}
            testing={testing === s.id}
            onToggle={() => setExpandedSource(expandedSource === s.id ? null : s.id)}
            onTest={() => testSource(s.id)}
          />
        ))}
      </div>

      {/* Three-column workflow */}
      <div className="desk-cols">
        {/* Column 1 — In the News */}
        <div className="desk-col">
          <ColHeader n={1} title="In the News" sub="find early & private" sources={sourcesByRole('discover')} />
          <div className="col-body">
            {desk.companies.map((c) => (
              <div className={`co-block ${openNews.has(c.id) ? 'open' : ''}`} key={c.id}>
                <button className="co-block-hd" onClick={() => toggleNews(c.id)}>
                  <span className="cob-caret">{openNews.has(c.id) ? '▾' : '▸'}</span>
                  <div className="cob-main">
                    <div className="cob-name">{c.name}{c.live && <span className="live-badge">● LIVE</span>}</div>
                    <div className="cob-meta">{c.sector} · {c.region} · €{c.dealSize}M{c.estimated ? ' (est.)' : ''} · {c.ownership}</div>
                  </div>
                  <span className="cob-count">{c.news.length}</span>
                </button>
                {openNews.has(c.id) && (
                  <div className="co-block-body">
                    {c.news.map((n) => (
                      <div className="news-find" key={n.id}>
                        <div className="nf-top">
                          <span className={`src-badge ${n.source}`}>{n.publisher || sourceName(desk.sources, n.source)}</span>
                          <span className="nf-when">{timeAgo(n.when)}</span>
                        </div>
                        <div className="nf-headline">{n.headline}</div>
                        <div className="nf-detail">{n.detail}</div>
                        {n.url && (
                          <a className="nf-source" href={n.url} target="_blank" rel="noreferrer">
                            🔗 {sourceHost(n.url)}
                          </a>
                        )}
                        <button className="cat-chip" onClick={() => setEditing({ finding: n, companyId: c.id })} title="AI-labeled catalyst — click to review / change">
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
            ))}
            <button className="find-more" onClick={findMore} disabled={findingMore}>
              {findingMore ? '✦ Scouting the live web (Bing-grounded agent)…' : '↻ Find more news'}
            </button>
          </div>
        </div>

        {/* Column 2 — Quantify with Filings */}
        <div className="desk-col">
          <ColHeader n={2} title="Quantify with Filings" sub="confirm & validate" sources={sourcesByRole('confirm')} />
          <div className="col-body">
            {desk.companies.map((c) => {
              const open = openFilings.has(c.id);
              return (
                <div className={`co-block ${open ? 'open' : ''}`} key={c.id}>
                  <button className="co-block-hd" onClick={() => setOpenFilings((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}>
                    <span className="cob-caret">{open ? '▾' : '▸'}</span>
                    <div className="cob-main">
                      <div className="cob-name">{c.name}</div>
                      <div className="cob-meta">{c.filings.length} filing{c.filings.length === 1 ? '' : 's'} to validate</div>
                    </div>
                    <span className="cob-count">📄 {c.filings.length}</span>
                  </button>
                  {open && (
                    <div className="co-block-body">
                      {c.filings.map((f) => (
                        <div className="filing-find" key={f.id}>
                          <div className="nf-top">
                            <span className="filing-type">{f.filingType}</span>
                            <span className="src-badge sm">{sourceName(desk.sources, f.source)}</span>
                            <span className="nf-when">{timeAgo(f.when)}</span>
                          </div>
                          <div className="nf-headline">{f.headline}</div>
                          <div className="nf-detail">{f.detail}</div>
                          <div className="confirms">✓ confirms <b>{catById[f.confirms]?.label}</b></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3 — Check for Quality */}
        <div className="desk-col">
          <ColHeader n={3} title="Check for Quality" sub="sanity-check" sources={sourcesByRole('quality')} />
          <div className="col-body">
            {desk.companies.map((c) => {
              const ran = qualityRun.has(c.id);
              const running = runningQuality === c.id;
              return (
                <div className="co-block quality" key={c.id}>
                  <div className="co-block-hd static">
                    <div className="cob-main">
                      <div className="cob-name">{c.name}</div>
                      <div className="cob-meta">{c.sector} · {c.region}</div>
                    </div>
                  </div>
                  <div className="co-block-body">
                    {!ran ? (
                      <button className="quality-run" onClick={() => runQuality(c.id)} disabled={running}>
                        {running ? 'Running Morningstar check…' : '✦ Run Morningstar quality check'}
                      </button>
                    ) : (
                      <QualityCard c={c} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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

function ColHeader({ n, title, sub, sources }: { n: number; title: string; sub: string; sources: DeskSource[] }) {
  return (
    <div className="col-head">
      <div className="col-head-top">
        <span className="col-num">{n}</span>
        <div>
          <div className="col-title">{title}</div>
          <div className="col-sub">{sub}</div>
        </div>
      </div>
      <div className="col-sources">
        {sources.map((s) => (
          <span key={s.id} className="col-src"><span className={`sdot2 ${s.status}`} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}

function SourceRow({ s, expanded, test, testing, onToggle, onTest }: {
  s: DeskSource; expanded: boolean; test?: SourceTestResult; testing: boolean; onToggle: () => void; onTest: () => void;
}) {
  const role = ROLE_META[s.role];
  return (
    <>
      <button className={`src-row ${expanded ? 'exp' : ''}`} onClick={onToggle}>
        <div className="src-name"><span className={`sdot2 ${s.status}`} />{s.name}</div>
        <div className="src-job">{s.primaryJob}</div>
        <div className="src-sweet">{s.sweetSpot}</div>
        <div><span className="role-tag" style={{ background: role.color }}>{role.tag}</span></div>
      </button>
      {expanded && (
        <div className="src-detail">
          <div className="src-detail-grid">
            <span><i>Connection</i><b className={`conn ${s.status}`}>{s.status === 'connected' ? '● Connected' : '◐ Degraded'}</b></span>
            <span><i>Latency</i>{s.latencyMs} ms</span>
            <span><i>Last sync</i>{s.lastSyncMin === 0 ? 'just now' : `${s.lastSyncMin} min ago`}</span>
          </div>
          <div className="src-detail-actions">
            <button className="btn" onClick={onTest} disabled={testing}>{testing ? 'Testing…' : '⚡ Test connectivity'}</button>
            {test && (
              <span className={`test-result ${test.ok ? 'ok' : 'warn'}`}>{test.ok ? '✓' : '⚠'} {test.message}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function QualityCard({ c }: { c: DeskCompany }) {
  const q = c.quality;
  const pct = Math.round((q.score / 10) * 100);
  const band = q.score >= 7 ? 'strong' : q.score >= 5 ? 'moderate' : 'weak';
  return (
    <div className="quality-card">
      <div className="q-top">
        <div className={`q-score ${band}`}>{q.score.toFixed(1)}</div>
        <div>
          <div className="q-rating">{q.rating}</div>
          <div className={`q-trend ${q.trend}`}>{q.trend === 'improving' ? '↑' : q.trend === 'weakening' ? '↓' : '→'} {q.trend}</div>
        </div>
        <span className="src-badge sm morningstar" style={{ marginLeft: 'auto' }}>Morningstar</span>
      </div>
      <div className="q-bar"><i className={band} style={{ width: `${pct}%` }} /></div>
      {q.flags.length > 0 && (
        <div className="q-flags">{q.flags.map((f) => <span className="q-flag" key={f}>⚑ {f}</span>)}</div>
      )}
      <div className="q-note">{q.note}</div>
    </div>
  );
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
