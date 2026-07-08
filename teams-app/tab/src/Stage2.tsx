import type { Deal } from './types';

// Native Stage 2 — Diligence & Approval. A focused roster of the deals that have
// entered diligence (launched / D-stage). Each opens the full Deal Workspace
// (Stages & orchestration, deliverables, IC readiness) via the shared DealDetail
// drawer. Stage-2 visibility is enforced inside DealDetail (deal-team only).

const money = (n?: number) => (n == null ? '—' : n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n}M`);

export default function Stage2({ deals, onOpen, onAsk }: { deals: Deal[]; onOpen: (id: string) => void; onAsk: (id: string) => void }) {
  const inDiligence = (deals || []).filter((d) => {
    const st = String((d as any).stage || '').toUpperCase();
    const name = String((d as any).stageName || '');
    return st.startsWith('D') || /diligence|approval/i.test(name) || (d as any).status === 'launched';
  });

  return (
    <div className="stage2">
      <section className="panel">
        <div className="panel-h">Diligence & Approval<span className="muted">{inDiligence.length} deal{inDiligence.length === 1 ? '' : 's'} in diligence</span></div>
        {!inDiligence.length ? (
          <div className="empty-panel">No deals in diligence yet. Pursue a candidate at the Stage 1 gate to launch one.</div>
        ) : (
          <div className="deals">
            {inDiligence.map((d) => {
              const readiness = (d as any).readiness ?? 0;
              return (
                <div className="dealcard" key={d.id} onClick={() => onOpen(d.id)} style={{ cursor: 'pointer' }}>
                  <div className="dc-top">
                    <span className="dc-co">{(d as any).company}</span>
                    <span className="dc-size">{money((d as any).dealSize)}</span>
                  </div>
                  <div className="dc-meta">{[(d as any).sector, (d as any).stageName || (d as any).stage].filter(Boolean).join(' · ')}</div>
                  <div className="dc-bar"><span style={{ width: `${Math.max(0, Math.min(100, readiness))}%` }} /></div>
                  <div className="dc-foot">
                    <span className="muted">IC readiness {readiness}%{(d as any).daysToIC != null ? ` · IC in ${(d as any).daysToIC}d` : ''}</span>
                    <button className="askbtn" onClick={(e) => { e.stopPropagation(); onAsk(d.id); }}>Ask ▸</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
