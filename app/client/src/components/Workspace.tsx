import { useState, useEffect } from 'react';
import type { Deal, MdOption, Swimlane, ChecklistSection } from '../types';
import { api } from '../api';

interface Props {
  deal: Deal;
  mdOptions: MdOption[];
  onAssign: (lane: string, md: string) => void;
  onCycleChecklist: (itemId: string) => void;
  onLaunch: () => void;
  launching: boolean;
}

type Sub = { kind: 'overview' } | { kind: 'checklist' } | { kind: 'templates' } | { kind: 'lane'; lane: string };

const LANE_COLOR: Record<string, string> = {
  commercial: '#0d9488',
  techai: '#7c3aed',
  operations: '#ea580c'
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Requested', cls: 'req' },
  received: { label: 'Received', cls: 'rec' },
  reviewed: { label: 'Reviewed', cls: 'rev' }
};

export function Workspace({ deal, mdOptions, onAssign, onCycleChecklist, onLaunch, launching }: Props) {
  const [sub, setSub] = useState<Sub>({ kind: 'overview' });
  const [ws, setWs] = useState<Deal['workspace']>(deal.workspace);
  // Re-seed local workspace when navigating between deals.
  useEffect(() => { setWs(deal.workspace); }, [deal.id]);

  // Screened (pre-launch) deal — nothing provisioned yet.
  if (!ws) {
    return (
      <div className="wsp">
        <div className="wsp-empty">
          <div className="wsp-empty-ic">🚀</div>
          <div>
            <div className="wsp-empty-t">Diligence workspace not yet provisioned</div>
            <div className="wsp-empty-s">
              {deal.company} has cleared the Screening Gate. Launching provisions the Teams + SharePoint
              deal space, the DD request list, the playbook templates and the three diligence swimlanes.
            </div>
          </div>
          <button className="btn primary" onClick={onLaunch} disabled={launching}>
            {launching ? 'Provisioning…' : '🚀 Launch Diligence & Approval'}
          </button>
        </div>
      </div>
    );
  }

  const openExt = (url?: string) => { if (url) window.open(url, '_blank', 'noopener'); };

  // Both the Teams space and the SharePoint data room are provisioned via
  // Microsoft Graph when M365 is connected. Until a resource is really
  // provisioned its stored deep-link is a placeholder that 404s — so we NEVER
  // navigate to it blindly. Instead every link is gated: if the resource is live
  // we open its real URL; otherwise we provision on demand (idempotent) and open
  // the freshly-resolved URL, or surface an actionable note.
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const teamsProvisioned = !!ws.teamsProvisioned && !!ws.teamsUrl;
  const spProvisioned = !!ws.sharePointProvisioned;

  // Provision (idempotent) and merge the refreshed workspace into local state.
  async function ensure(): Promise<Deal['workspace'] | undefined> {
    const r = await api.ensureDealTeams(deal.id);
    if (r.workspace) setWs(r.workspace);
    if (!r.connected) {
      setNote('Connect Microsoft 365 on the Home page, then reopen — this creates the deal’s Teams space and SharePoint data room.');
    } else if (!r.sharePointProvisioned) {
      // Connected, but the data-room folders aren’t created — the delegated token
      // is missing the SharePoint file scope (Files.ReadWrite.All). That scope IS
      // user-consentable in this tenant (no admin): reconnecting M365 re-prompts
      // for consent and grants it, after which the folders provision for real.
      setNote('The SharePoint data room isn’t set up yet. Reconnect Microsoft 365 on the Home page and approve file access when prompted (no admin needed), then reopen — the data-room folders will be created.');
    }
    return r.workspace;
  }

  // Teams: always open the REAL deal team (its General channel). Per-workstream
  // channels aren’t created (Channel.Create needs admin consent), so every Teams
  // link resolves to the deal team; workstreams are separated by SharePoint folders.
  async function openTeams() {
    if (teamsProvisioned) { openExt(ws.teamsUrl); return; }
    setBusy(true); setNote(null);
    try {
      const fresh = await ensure();
      if (fresh?.teamsProvisioned && fresh.teamsUrl) openExt(fresh.teamsUrl);
    } catch { setNote('Could not reach the server to create the Teams space.'); }
    finally { setBusy(false); }
  }

  // SharePoint: open the REAL data room only. NEVER redirect to a different
  // target (e.g. the Teams space) when it isn’t provisioned — a silent fallback
  // hides the failure and surprises the user. If the folders aren’t created yet,
  // attempt on-demand provisioning; if that can’t complete, show a clear,
  // actionable note and navigate nowhere.
  async function openSp(pick: (w: NonNullable<Deal['workspace']>) => string | undefined) {
    if (spProvisioned) { openExt(pick(ws)); return; }
    setBusy(true); setNote(null);
    try {
      const fresh = await ensure();
      if (fresh?.sharePointProvisioned) { openExt(pick(fresh)); return; }
      // Not provisioned — do NOT open anything else. ensure() has set an
      // actionable note explaining how to enable the data room.
    } catch { setNote('Could not reach the server to open the data room.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="wsp">
      {/* header */}
      <div className="wsp-head">
        <div>
          <div className="wsp-title">Deal workspace · {deal.company}</div>
          <div className="wsp-sub">Provisioned by {ws.provisionedBy}</div>
        </div>
        <div className="wsp-links">
          <button className="wsp-link teams" onClick={openTeams} disabled={busy}>
            {busy ? 'Working…' : teamsProvisioned ? 'Open in Teams ↗' : 'Create Teams space ↗'}
          </button>
          <button className="wsp-link spo" onClick={() => openSp((w) => w.sharePointUrl)} disabled={busy}>
            {busy ? 'Working…' : spProvisioned ? 'Open SharePoint ✓ ↗' : 'Set up data room ↗'}
          </button>
        </div>
      </div>

      {note && <div className="wsp-teams-note">⚠ {note}</div>}

      {/* tabs */}
      <div className="wsp-tabs">
        <button className={sub.kind === 'overview' ? 'on' : ''} onClick={() => setSub({ kind: 'overview' })}>◇ Architecture</button>
        <button className={sub.kind === 'checklist' ? 'on' : ''} onClick={() => setSub({ kind: 'checklist' })}>
          ☑ DD Checklist {deal.checklistStats ? <span className="wsp-tab-c">{deal.checklistStats.pct}%</span> : null}
        </button>
        <button className={sub.kind === 'templates' ? 'on' : ''} onClick={() => setSub({ kind: 'templates' })}>▤ Templates <span className="wsp-tab-c">{ws.templates.length}</span></button>
        {ws.swimlanes.map((s) => (
          <button key={s.lane} className={sub.kind === 'lane' && sub.lane === s.lane ? 'on' : ''} onClick={() => setSub({ kind: 'lane', lane: s.lane })}>
            <span className="wsp-dot" style={{ background: LANE_COLOR[s.lane] }} /> {s.label}
          </button>
        ))}
      </div>

      {sub.kind === 'overview' && (
        <Overview ws={ws} openTeams={openTeams} openSp={openSp} teamsProvisioned={teamsProvisioned} spProvisioned={spProvisioned} onGo={setSub} />
      )}
      {sub.kind === 'checklist' && (
        <Checklist sections={ws.checklist} onCycle={onCycleChecklist} stats={deal.checklistStats} />
      )}
      {sub.kind === 'templates' && (
        <Templates ws={ws} openSp={openSp} />
      )}
      {sub.kind === 'lane' && (
        <LanePage
          swimlane={ws.swimlanes.find((s) => s.lane === (sub as { lane: string }).lane)!}
          deal={deal}
          mdOptions={mdOptions}
          onAssign={onAssign}
          openTeams={openTeams}
          openSp={openSp}
        />
      )}
    </div>
  );
}

/* ---------------- Architecture diagram (SVG hub-and-spoke) ---------------- */
function Overview({ ws, openTeams, openSp, teamsProvisioned, spProvisioned, onGo }: { ws: NonNullable<Deal['workspace']>; openTeams: () => void; openSp: (pick: (w: NonNullable<Deal['workspace']>) => string | undefined) => void; teamsProvisioned: boolean; spProvisioned: boolean; onGo: (s: Sub) => void }) {
  // node: x,y are centre coordinates in the 960x430 viewBox
  const CX = 480, CY = 205;
  const nodes = [
    { id: 'teams', label: 'Microsoft Teams', sub: teamsProvisioned ? (ws.teamsChannelName || 'deal team') : 'create deal team', x: 205, y: 70, color: '#4b53bc', act: openTeams },
    { id: 'spo', label: 'SharePoint · VDR', sub: `${ws.folders.length} folders${spProvisioned ? ' · live' : ' · template'}`, x: 755, y: 70, color: '#036c70', act: () => openSp((w) => w.sharePointUrl) },
    { id: 'checklist', label: 'DD Checklist', sub: 'request list', x: 120, y: 205, color: '#2563eb', act: () => onGo({ kind: 'checklist' }) },
    { id: 'templates', label: 'Templates', sub: `${ws.templates.length} docs`, x: 840, y: 205, color: '#b45309', act: () => onGo({ kind: 'templates' }) },
    ...ws.swimlanes.map((s, i) => ({
      id: s.lane,
      label: s.label,
      sub: s.advisor,
      x: 270 + i * 210,
      y: 360,
      color: LANE_COLOR[s.lane],
      act: () => onGo({ kind: 'lane', lane: s.lane })
    }))
  ];

  const NW = 150, NH = 52;
  return (
    <div className="wsp-diagram">
      <svg viewBox="0 0 960 430" className="wsp-svg" role="img" aria-label="Deal workspace architecture">
        {/* connectors */}
        {nodes.map((n) => (
          <line key={`l-${n.id}`} x1={CX} y1={CY} x2={n.x} y2={n.y} className="wsp-edge" />
        ))}
        {/* hub */}
        <g>
          <rect x={CX - 105} y={CY - 40} width={210} height={80} rx={14} className="wsp-hub" />
          <text x={CX} y={CY - 8} className="wsp-hub-t">Deal Workspace</text>
          <text x={CX} y={CY + 14} className="wsp-hub-s">Teams + SharePoint · governed</text>
          <text x={CX} y={CY + 31} className="wsp-hub-x">IC {new Date(ws.icDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</text>
        </g>
        {/* nodes */}
        {nodes.map((n) => (
          <g key={n.id} className="wsp-node" onClick={n.act} role="button">
            <rect x={n.x - NW / 2} y={n.y - NH / 2} width={NW} height={NH} rx={11} style={{ stroke: n.color }} />
            <circle cx={n.x - NW / 2 + 16} cy={n.y} r={5} style={{ fill: n.color }} />
            <text x={n.x - NW / 2 + 30} y={n.y - 3} className="wsp-node-t">{n.label}</text>
            <text x={n.x - NW / 2 + 30} y={n.y + 13} className="wsp-node-s">{n.sub}</text>
          </g>
        ))}
      </svg>

      {/* resource strips */}
      <div className="wsp-res">
        <div className="wsp-res-col">
          <div className="wsp-res-h"><b>Teams channel</b><span onClick={openTeams} className="wsp-res-open">open ↗</span></div>
          <div className="wsp-chips">
            {ws.channels.map((c) => (
              <button key={c.name} className="wsp-chip" title={`${c.purpose} — opens the deal team`} onClick={openTeams}>#{c.name}</button>
            ))}
          </div>
          <div className="wsp-res-note">The deal team’s single General channel carries all workstream discussion. Per-workstream channels aren’t created — that needs tenant-admin consent — so each workstream is separated by its own SharePoint folder instead →</div>
        </div>
        <div className="wsp-res-col">
          <div className="wsp-res-h"><b>SharePoint data room</b><span onClick={() => openSp((w) => w.sharePointUrl)} className="wsp-res-open">open ↗</span></div>
          <div className="wsp-chips">
            {ws.folders.map((f) => (
              <button key={f.name} className="wsp-chip folder" onClick={() => openSp((w) => w.folders.find((x) => x.name === f.name)?.url)}>📁 {f.name}</button>
            ))}
          </div>
          {!spProvisioned && <div className="wsp-res-note">This is the standard {ws.folders.length}-folder VDR taxonomy — not set up yet. Reconnect Microsoft 365 on the Home page and approve file access when prompted (no admin needed); the folders are then created as a real, indexed SharePoint data room.</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- DD Checklist ---------------- */
function Checklist({ sections, onCycle, stats }: { sections: ChecklistSection[]; onCycle: (id: string) => void; stats?: Deal['checklistStats'] }) {
  return (
    <div className="wsp-checklist">
      <div className="wsp-cl-legend">
        <span>Click an item to advance: <b className="cl-b req">Requested</b> → <b className="cl-b rec">Received</b> → <b className="cl-b rev">Reviewed</b></span>
        {stats && <span className="wsp-cl-stat">{stats.reviewed} reviewed · {stats.received} received · {stats.requested} outstanding</span>}
      </div>
      {sections.map((sec) => {
        const rev = sec.items.filter((i) => i.status === 'reviewed').length;
        return (
          <div className="wsp-cl-sec" key={sec.id}>
            <div className="wsp-cl-sec-h">
              <span className="wsp-cl-sec-t">{sec.section}</span>
              {sec.lane && <span className={`wsp-lane-tag ${sec.lane}`}>{sec.lane}</span>}
              {sec.workstream && <span className="wsp-ws-tag">{sec.workstream}</span>}
              <span className="wsp-cl-sec-c">{rev}/{sec.items.length}</span>
            </div>
            {sec.items.map((it) => (
              <button key={it.id} className={`wsp-cl-item ${it.status}`} onClick={() => onCycle(it.id)}>
                <span className={`wsp-cl-box ${STATUS_META[it.status].cls}`}>{it.status === 'reviewed' ? '✓' : it.status === 'received' ? '·' : ''}</span>
                <span className="wsp-cl-txt">{it.text}</span>
                <span className={`wsp-cl-status ${STATUS_META[it.status].cls}`}>{STATUS_META[it.status].label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Templates ---------------- */
const TPL_ICON: Record<string, string> = { Excel: '📊', Word: '📝', PowerPoint: '📽' };
function Templates({ ws, openSp }: { ws: NonNullable<Deal['workspace']>; openSp: (pick: (w: NonNullable<Deal['workspace']>) => string | undefined) => void }) {
  return (
    <div className="wsp-templates">
      {ws.templates.map((t) => (
        <button key={t.id} className="wsp-tpl" onClick={() => openSp((w) => w.templates.find((x) => x.id === t.id)?.url)}>
          <span className="wsp-tpl-ic">{TPL_ICON[t.type] || '📄'}</span>
          <span className="wsp-tpl-body">
            <span className="wsp-tpl-n">{t.name} <span className="wsp-tpl-ext">.{t.ext}</span></span>
            <span className="wsp-tpl-d">{t.desc}</span>
          </span>
          <span className="wsp-tpl-go">↗</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- Swimlane subpage ---------------- */
function LanePage({ swimlane, deal, mdOptions, onAssign, openTeams, openSp }: {
  swimlane: Swimlane;
  deal: Deal;
  mdOptions: MdOption[];
  onAssign: (lane: string, md: string) => void;
  openTeams: () => void;
  openSp: (pick: (w: NonNullable<Deal['workspace']>) => string | undefined) => void;
}) {
  const color = LANE_COLOR[swimlane.lane];
  const relatedItems = (deal.workspace?.checklist || []).filter((s) => s.lane === swimlane.lane).flatMap((s) => s.items);
  const ws = deal.workstreams.find((w) => w.lane === swimlane.lane);
  return (
    <div className="wsp-lane">
      <div className="wsp-lane-head" style={{ borderColor: color }}>
        <div>
          <div className="wsp-lane-title" style={{ color }}>{swimlane.label}</div>
          <div className="wsp-lane-adv">{swimlane.advisorType} · <b>{swimlane.advisor}</b></div>
        </div>
        <label className="wsp-md">
          <span>Lane owner (MD)</span>
          <select value={swimlane.md} onChange={(e) => onAssign(swimlane.lane, e.target.value)}>
            {mdOptions.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.title}</option>)}
          </select>
        </label>
      </div>

      <div className="wsp-lane-grid">
        <div className="wsp-lane-card">
          <div className="wsp-lane-card-h">Scope</div>
          <ul className="wsp-scope">{swimlane.scope.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="wsp-lane-deliv">Deliverable · <b>{swimlane.deliverable}</b></div>
        </div>
        <div className="wsp-lane-card">
          <div className="wsp-lane-card-h">Workspace</div>
          <button className="wsp-chip" onClick={openTeams}>Teams channel ↗</button>
          <button className="wsp-chip folder" onClick={() => openSp((w) => w.swimlanes.find((s) => s.lane === swimlane.lane)?.folderUrl)}>SharePoint folder ↗</button>
          <div className="wsp-lane-prog">
            <div className="wsp-lane-prog-t"><span>Lane progress</span><b>{ws?.progress ?? 0}%</b></div>
            <div className="wsp-lane-prog-track"><i style={{ width: `${ws?.progress ?? 0}%`, background: color }} /></div>
          </div>
        </div>
        <div className="wsp-lane-card">
          <div className="wsp-lane-card-h">Owns checklist items</div>
          {relatedItems.length === 0 && <div className="wsp-lane-none">No lane-specific items.</div>}
          {relatedItems.map((it) => (
            <div className={`wsp-lane-item ${it.status}`} key={it.id}>
              <span className={`wsp-cl-box ${STATUS_META[it.status].cls}`}>{it.status === 'reviewed' ? '✓' : it.status === 'received' ? '·' : ''}</span>
              {it.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
