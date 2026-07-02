import { useEffect, useMemo, useState } from 'react';
import type {
  Framework,
  FundMandate,
  Theme,
  Screen,
  ScoredTargets,
  ScoredTarget,
  ScreenMutationError
} from '../types';
import { api } from '../api';

const TIER_BADGE: Record<number, { label: string; cls: string; role: string }> = {
  1: { label: 'GATE', cls: 'gate', role: 'binding LPA constraints' },
  2: { label: 'GUIDE', cls: 'guide', role: 'sponsored hunting ground' },
  3: { label: 'RANK', cls: 'rank', role: 'scored screening criteria' }
};

export function SourcingFramework() {
  const [fw, setFw] = useState<Framework | null>(null);
  const [scored, setScored] = useState<ScoredTargets | null>(null);
  const [expanded, setExpanded] = useState<string | null>('fund-iv');
  const [editing, setEditing] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);

  async function refresh() {
    const [f, s] = await Promise.all([api.framework(), api.scoredTargets()]);
    setFw(f);
    setScored(s);
  }
  useEffect(() => {
    refresh();
  }, []);

  if (!fw) return <div className="framework"><div className="finding empty">Loading framework…</div></div>;

  async function toggleScreen(s: Screen) {
    await api.selectScreen(s.id, !s.selected);
    await refresh();
  }
  async function toggleTheme(t: Theme, selected: boolean) {
    await api.selectTheme(t.id, selected);
    await refresh();
  }

  return (
    <div className="framework">
      <div className="fw-grid">
        {/* Left: the three-tier hierarchy */}
        <div className="fw-tree">
          <FundCard
            fund={fw.fund}
            expanded={expanded === fw.fund.id}
            onToggle={() => setExpanded(expanded === fw.fund.id ? null : fw.fund.id)}
          />

          <div className="fw-themes-hd">
            <span className="fw-section-label">Investment themes &amp; screens</span>
          </div>

          {fw.themes.map((t) => (
            <ThemeBlock
              key={t.id}
              theme={t}
              fund={fw.fund}
              expandedId={expanded}
              editingId={editing}
              creatingUnder={creatingUnder}
              onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
              onToggleTheme={toggleTheme}
              onToggleScreen={toggleScreen}
              onEdit={(id) => { setEditing(id); setExpanded(id); }}
              onCancelEdit={() => setEditing(null)}
              onStartCreate={(themeId) => { setCreatingUnder(themeId); setExpanded(themeId); }}
              onCancelCreate={() => setCreatingUnder(null)}
              onSaved={async () => { setEditing(null); setCreatingUnder(null); await refresh(); }}
            />
          ))}
        </div>

        {/* Right: ranked targets */}
        <div className="scored">
          <div className="scored-hd">
            <span className="m365-title">Ranked targets</span>
            <span className="m365-count">
              {scored ? `${scored.selectedCount} screen${scored.selectedCount === 1 ? '' : 's'} active` : '…'}
            </span>
          </div>
          <div className="scored-sub">
            {scored?.totalCount ?? 0} companies discovered on the News &amp; filings desk —
            gated by the <b>Fund Mandate</b>, then ranked by your selected <b>screens</b>.
            {(scored?.gatedCount ?? 0) > 0 && (
              <span className="disc-note gated"> · {scored!.gatedCount} excluded by the gate</span>
            )}
            {(scored?.discoveredCount ?? 0) > 0 && (
              <span className="disc-note"> · {scored!.discoveredCount} new from “Find more news”</span>
            )}
          </div>
          {scored?.selectedCount === 0 && (
            <div className="finding empty" style={{ margin: '10px 0' }}>
              Select one or more screens (or a theme) to rank targets.
            </div>
          )}
          {scored?.targets.map((t) => <ScoredRow key={t.id} t={t} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tier 1 · Fund Mandate (GATE) ---------------- */
function FundCard({ fund, expanded, onToggle }: { fund: FundMandate; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="fw-fund">
      <div className="fw-fund-top" onClick={onToggle}>
        <span className={`tier-badge ${TIER_BADGE[1].cls}`}>{TIER_BADGE[1].label}</span>
        <div className="fw-fund-id">
          <div className="fw-fund-name">{fund.name}</div>
          <div className="fw-fund-sub">{fund.strategy} · {fund.fundSize}</div>
        </div>
        <span className="mand-caret">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className="fw-fund-body">
          <div className="fw-gate-note">Targets that breach any guardrail below are <b>excluded</b>, never scored.</div>
          <div className="fw-guardrails">
            <span><i>EV band</i>€{fund.evMin}–{fund.evMax}M</span>
            <span><i>Investment period</i>{fund.investmentPeriod}</span>
            <span><i>Term</i>{fund.term}</span>
            <span><i>Max equity / deal</i>{fund.maxEquityPerDeal}% of fund</span>
            <span><i>Max sector concentration</i>{fund.maxSectorConcentration}%</span>
            <span><i>Leverage limit</i>{fund.leverageLimit}</span>
            <span className="wide"><i>Permitted sectors</i>{fund.sectorsPermitted.join(' · ')}</span>
            <span className="wide"><i>Geographies</i>{fund.geographies.join(' · ')}</span>
            <span className="wide excl"><i>Excluded (LPA)</i>{fund.sectorsExcluded.join(' · ')}</span>
            <span className="wide"><i>ESG policy</i>{fund.esgPolicy}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Tier 2 · Theme (GUIDE) + nested screens ---------------- */
function ThemeBlock({
  theme, fund, expandedId, editingId, creatingUnder,
  onToggleExpand, onToggleTheme, onToggleScreen, onEdit, onCancelEdit, onStartCreate, onCancelCreate, onSaved
}: {
  theme: Theme;
  fund: FundMandate;
  expandedId: string | null;
  editingId: string | null;
  creatingUnder: string | null;
  onToggleExpand: (id: string) => void;
  onToggleTheme: (t: Theme, selected: boolean) => void;
  onToggleScreen: (s: Screen) => void;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onStartCreate: (themeId: string) => void;
  onCancelCreate: () => void;
  onSaved: () => void;
}) {
  const selectedCount = theme.screens.filter((s) => s.selected).length;
  const allSelected = theme.screens.length > 0 && selectedCount === theme.screens.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const expanded = expandedId === theme.id;

  return (
    <div className="fw-theme-block">
      <div className={`fw-theme ${allSelected ? 'sel' : ''}`}>
        <button
          className={`mand-check ${allSelected ? 'on' : ''} ${someSelected ? 'partial' : ''}`}
          onClick={() => onToggleTheme(theme, !allSelected)}
          title="Toggle every screen under this theme"
          disabled={theme.screens.length === 0}
        >
          {allSelected ? '✓' : someSelected ? '–' : ''}
        </button>
        <button className="mand-main" onClick={() => onToggleExpand(theme.id)}>
          <div className="mand-name">
            <span className={`tier-badge ${TIER_BADGE[2].cls}`}>{TIER_BADGE[2].label}</span>
            {theme.name}
            <span className={`fw-theme-status ${theme.status}`}>{theme.status}</span>
          </div>
          <div className="mand-sponsor">{theme.sponsor} · {theme.screens.length} screen{theme.screens.length === 1 ? '' : 's'}</div>
        </button>
        <span className="mand-caret" onClick={() => onToggleExpand(theme.id)}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="fw-theme-body">
          <div className="mand-thesis">{theme.thesis}</div>
          <div className="fw-whynow"><i>Why now</i>{theme.whyNow}</div>
          <div className="fw-playbook">
            {theme.valueCreation.map((v) => <span className="pb-chip" key={v}>{v}</span>)}
          </div>
          <div className="mand-crit">
            <span><i>Sector</i>{theme.sector}</span>
            <span><i>EV guidance</i>{theme.evGuidance}</span>
            <span className="wide"><i>Sub-sectors</i>{theme.subSectors.join(', ')}</span>
            <span className="wide"><i>Geography focus</i>{theme.geographyFocus.join(', ')}</span>
            <span className="wide"><i>Right to win</i>{theme.rightToWin}</span>
          </div>
        </div>
      )}

      {/* nested screens */}
      <div className="fw-screens">
        {theme.screens.map((s) => (
          <ScreenRow
            key={s.id}
            screen={s}
            theme={theme}
            fund={fund}
            expanded={expandedId === s.id}
            editing={editingId === s.id}
            onToggleExpand={() => onToggleExpand(s.id)}
            onToggleSelect={() => onToggleScreen(s)}
            onEdit={() => onEdit(s.id)}
            onCancelEdit={onCancelEdit}
            onSaved={onSaved}
          />
        ))}

        {creatingUnder === theme.id ? (
          <ScreenForm theme={theme} fund={fund} onCancel={onCancelCreate} onSaved={onSaved} />
        ) : (
          <button className="fw-add-screen" onClick={() => onStartCreate(theme.id)}>+ New screen under this theme</button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tier 3 · Screen (RANK) ---------------- */
function fmtBand(min: number | null, max: number | null, unit = '') {
  if (min == null && max == null) return 'any';
  return `${min ?? 0}–${max ?? '∞'}${unit}`;
}
function fmtMin(v: number | null, unit = '') {
  return v == null ? 'any' : `≥ ${v}${unit}`;
}

function ScreenRow({
  screen, theme, fund, expanded, editing, onToggleExpand, onToggleSelect, onEdit, onCancelEdit, onSaved
}: {
  screen: Screen;
  theme: Theme;
  fund: FundMandate;
  expanded: boolean;
  editing: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  return (
    <div className={`fw-screen ${screen.selected ? 'sel' : ''}`}>
      <div className="fw-screen-top">
        <button className={`mand-check ${screen.selected ? 'on' : ''}`} onClick={onToggleSelect} title="Score against this screen">
          {screen.selected ? '✓' : ''}
        </button>
        <button className="mand-main" onClick={onToggleExpand}>
          <div className="mand-name">{screen.name}{screen.custom ? <span className="fw-custom">custom</span> : null}</div>
          <div className="mand-sponsor">{screen.author}</div>
        </button>
        <span className="mand-caret" onClick={onToggleExpand}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && !editing && (
        <div className="fw-screen-body">
          <div className="mand-crit">
            <span><i>Sector</i>{screen.sector || '—'}</span>
            <span><i>Regions</i>{screen.regions.join(', ') || '—'}</span>
            <span><i>EV band</i>€{fmtBand(screen.evMin, screen.evMax, 'M')}</span>
            <span><i>Ownership</i>{screen.ownership.join(', ') || 'any'}</span>
          </div>
          <div className="fw-thresholds">
            <span className="thr"><i>Revenue</i>{fmtMin(screen.revenueMin, ' €M')}</span>
            <span className="thr"><i>EBITDA</i>{fmtMin(screen.ebitdaMin, ' €M')}</span>
            <span className="thr"><i>EBITDA margin</i>{fmtMin(screen.ebitdaMarginMin, '%')}</span>
            <span className="thr"><i>Growth</i>{fmtMin(screen.growthMin, '%')}</span>
          </div>
          <div className="mand-crit">
            <span className="wide"><i>Keywords</i>{screen.keywords.join(', ') || '—'}</span>
          </div>
          <button className="mand-edit" onClick={onEdit}>✎ Edit screen</button>
        </div>
      )}

      {expanded && editing && (
        <ScreenForm screen={screen} theme={theme} fund={fund} onCancel={onCancelEdit} onSaved={onSaved} />
      )}
    </div>
  );
}

/* ---------------- Screen create / edit form (with nesting validation) --------------- */
function ScreenForm({
  screen, theme, onCancel, onSaved
}: {
  screen?: Screen;
  theme: Theme;
  fund: FundMandate;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: screen?.name || '',
    sector: screen?.sector || theme.sector,
    regions: (screen?.regions || theme.geographyFocus).join(', '),
    evMin: screen?.evMin ?? '',
    evMax: screen?.evMax ?? '',
    revenueMin: screen?.revenueMin ?? '',
    ebitdaMin: screen?.ebitdaMin ?? '',
    ebitdaMarginMin: screen?.ebitdaMarginMin ?? '',
    growthMin: screen?.growthMin ?? '',
    ownership: (screen?.ownership || []).join(', '),
    keywords: (screen?.keywords || []).join(', ')
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setErrors([]);
    setWarnings([]);
    try {
      const payload = { ...f, themeId: theme.id } as never;
      const res = screen
        ? await api.updateScreen(screen.id, payload)
        : await api.createScreen(payload);
      if (res.ok) {
        setWarnings(res.data.warnings || []);
        onSaved();
      } else {
        const e = res.error as ScreenMutationError;
        setErrors(e.errors || ['Could not save the screen.']);
        setWarnings(e.warnings || []);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mand-form fw-form">
      {!screen && <div className="mand-form-title">New screen under “{theme.name}”</div>}
      <div className="fw-form-nest">Nests within <b>{theme.name}</b> → Fund IV mandate. Criteria may only narrow the parent.</div>

      {errors.length > 0 && (
        <div className="fw-errors">
          {errors.map((e, i) => <div key={i} className="fw-error">✕ {e}</div>)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="fw-warnings">
          {warnings.map((w, i) => <div key={i} className="fw-warn">▲ {w}</div>)}
        </div>
      )}

      <label>Name<input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Convenience grocery · DACH · €150–400M" /></label>
      <div className="mand-form-row">
        <label>Sector<input value={f.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Consumer & Retail" /></label>
        <label>Regions<input value={f.regions} onChange={(e) => set('regions', e.target.value)} placeholder="DACH, Nordics" /></label>
      </div>
      <div className="mand-form-row">
        <label>EV min €M<input type="number" value={f.evMin} onChange={(e) => set('evMin', e.target.value)} /></label>
        <label>EV max €M<input type="number" value={f.evMax} onChange={(e) => set('evMax', e.target.value)} /></label>
        <label>Ownership<input value={f.ownership} onChange={(e) => set('ownership', e.target.value)} placeholder="founder, family" /></label>
      </div>
      <div className="mand-form-row">
        <label>Revenue min €M<input type="number" value={f.revenueMin} onChange={(e) => set('revenueMin', e.target.value)} /></label>
        <label>EBITDA min €M<input type="number" value={f.ebitdaMin} onChange={(e) => set('ebitdaMin', e.target.value)} /></label>
      </div>
      <div className="mand-form-row">
        <label>EBITDA margin min %<input type="number" value={f.ebitdaMarginMin} onChange={(e) => set('ebitdaMarginMin', e.target.value)} /></label>
        <label>Growth min %<input type="number" value={f.growthMin} onChange={(e) => set('growthMin', e.target.value)} /></label>
      </div>
      <label>Keywords<input value={f.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="convenience, private-label, bolt-on" /></label>
      <div className="mand-form-actions">
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !f.name.trim()}>{busy ? 'Saving…' : screen ? 'Save screen' : 'Create screen'}</button>
      </div>
    </div>
  );
}

/* ---------------- Ranked target row ---------------- */
const PART_KEYS: { k: keyof NonNullable<ScoredTarget['parts']>; label: string }[] = [
  { k: 'sector', label: 'Sec' },
  { k: 'region', label: 'Reg' },
  { k: 'ev', label: 'EV' },
  { k: 'ownership', label: 'Own' },
  { k: 'keywords', label: 'Kw' },
  { k: 'revenue', label: 'Rev' },
  { k: 'ebitda', label: 'Ebt' },
  { k: 'margin', label: 'Mgn' },
  { k: 'growth', label: 'Grw' }
];

function ScoredRow({ t }: { t: ScoredTarget }) {
  if (t.gated) {
    return (
      <div className="scored-row gated">
        <div className="score-badge excluded" title="Excluded by the fund mandate">⦸</div>
        <div className="scored-main">
          <div className="scored-name">
            {t.name}
            <span className="gate-tag">excluded by gate</span>
          </div>
          <div className="scored-meta">{t.sector} · {t.region} · €{t.dealSize}M · {t.ownership}</div>
          <div className="gate-reasons">
            {t.gateReasons.map((r, i) => <span key={i} className="gate-reason">{r}</span>)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`scored-row ${t.justDiscovered ? 'new' : ''}`}>
      <div className={`score-badge ${t.band}`}>{t.score}</div>
      <div className="scored-main">
        <div className="scored-name">
          {t.name}
          <span className="gate-pass" title="Passes the fund mandate">✓ gate</span>
          {t.justDiscovered && <span className="new-badge">✦ new</span>}
          <span className="scored-srcs">
            {t.sources.map((s) => <span key={s} className={`src-tag ${s}`}>{s === 'cxo' ? 'CxO' : 'News'}</span>)}
          </span>
        </div>
        <div className="scored-meta">{t.sector} · {t.region} · €{t.dealSize}M · {t.ownership}</div>
        {t.matchedScreen ? (
          <div className="scored-match">
            best screen <b>{t.matchedScreen.name}</b>
            {t.parts && (
              <span className="score-parts">
                {PART_KEYS.map(({ k, label }) => (
                  <span key={k} className={`sp ${t.parts![k] > 0 ? 'hit' : 'miss'}`} title={`${label}: ${t.parts![k]}`}>{label}</span>
                ))}
              </span>
            )}
          </div>
        ) : (
          <div className="scored-match none">no screen selected</div>
        )}
      </div>
    </div>
  );
}
