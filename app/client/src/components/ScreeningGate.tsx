import { useEffect, useState } from 'react';
import type { GateTargets, GateTarget } from '../types';
import { api } from '../api';

interface Props {
  onPursued: () => void;
}

// The Screening Gate (O4) decision desk — the MD reviews the gate-ready
// shortlist and records PURSUE on each target worth taking into diligence.
// PURSUE creates a *screened* deal that then appears in "Deals Ready".
export function ScreeningGate({ onPursued }: Props) {
  const [gate, setGate] = useState<GateTargets | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setGate(await api.gateTargets());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function pursue(t: GateTarget) {
    setBusy(t.id);
    try {
      await api.pursueTarget(t.id);
      await refresh();
      onPursued();
    } finally {
      setBusy(null);
    }
  }

  if (!gate) return <div className="panel"><div className="pb"><div className="finding empty">Loading gate-ready targets…</div></div></div>;

  const pursuable = gate.targets.filter((t) => !t.pursued).length;

  return (
    <div className="panel gate-panel">
      <div className="ph">
        <span className="ic">⚖</span>
        <h3>Screening Gate · decision desk</h3>
        <span className="sub" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, textTransform: 'none', letterSpacing: 0 }}>
          {gate.targets.length} gate-ready · {pursuable} to decide
        </span>
      </div>
      <div className="pb">
        <div className="gate-note">
          The MD reviews the gate-ready shortlist (strong mandate fit) and records <b>PURSUE</b> on the targets
          worth taking forward. Pursuing a target passes the gate and creates a deal in <b>Deals Ready → Screened</b>,
          awaiting a diligence launch.
        </div>
        <div className="gate-list">
          {gate.targets.length === 0 && <div className="finding empty">No gate-ready targets yet — source & screen in O1 first.</div>}
          {gate.targets.map((t) => (
            <div className={`gate-row ${t.pursued ? 'pursued' : ''}`} key={t.id}>
              <div className="gate-score">{t.score}</div>
              <div className="gate-main">
                <div className="gate-name">{t.name}</div>
                <div className="gate-meta">{t.sector} · {t.region} · €{t.dealSize}M · {t.ownership}{t.matchedScreen ? ` · screen: ${t.matchedScreen.name}` : ''}</div>
              </div>
              {t.pursued ? (
                <span className="gate-done">✓ Pursued</span>
              ) : (
                <button className="btn gate-btn" onClick={() => pursue(t)} disabled={busy === t.id}>
                  {busy === t.id ? 'Recording…' : '⚡ PURSUE →'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
