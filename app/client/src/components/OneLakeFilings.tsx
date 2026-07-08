import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Deal, OneLakeStatus } from '../types';

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

interface Props {
  deal: Deal;
  onDealUpdate?: (d: Deal) => void;
}

// SEC filings auto-archived into the Fabric lakehouse's Files/Filings folder. Shows
// the per-deal manifest and an honest connectivity status; the "Archive now" button
// (re)pulls the company's filings from SEC and writes them to OneLake.
export function OneLakeFilings({ deal, onDealUpdate }: Props) {
  const [status, setStatus] = useState<OneLakeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { api.onelakeProbe().then(setStatus).catch(() => setStatus(null)); }, []);

  const manifest = deal.onelakeFilings;

  const archive = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await api.archiveOneLake(deal.id, 4);
      if (r.error) { setNote(`Archive failed: ${r.error}`); return; }
      if (!r.matched) { setNote('No SEC coverage for this company (likely private) — nothing to archive.'); return; }
      const fresh = await api.deal(deal.id);
      onDealUpdate?.(fresh);
      setNote(`Archived ${r.saved.length} filing(s) to Fabric OneLake.`);
    } catch (e) {
      setNote(`Archive failed: ${String((e as Error).message)}`);
    } finally { setBusy(false); }
  };

  if (!status?.configured) {
    return (
      <div className="olf">
        <div className="olf-note">Fabric OneLake filing archive is not configured in this environment.</div>
      </div>
    );
  }

  return (
    <div className="olf">
      <div className="olf-head">
        <span className={`olf-dot ${status.connected ? 'ok' : 'off'}`} />
        <span className="olf-title">SEC filings → Fabric OneLake</span>
        <span className="olf-path">{status.filingsPath}</span>
        {status.fabricUrl && <a className="olf-open" href={status.fabricUrl} target="_blank" rel="noreferrer">Open in Fabric ↗</a>}
        <button className="btn ghost sm olf-btn" onClick={archive} disabled={busy}>{busy ? 'Archiving…' : manifest ? '↻ Re-archive' : '↓ Archive filings'}</button>
      </div>

      {!status.connected && (
        <div className="olf-warn">
          The app identity cannot write to this OneLake workspace yet — a one-time Contributor/Member grant on the “Deal Room” workspace is required. {status.probeError ? `(${status.probeError})` : ''}
        </div>
      )}

      {manifest ? (
        <div className="olf-list">
          <div className="olf-sub">{manifest.secName} · CIK {manifest.cik} · archived {new Date(manifest.at).toLocaleString()}</div>
          {manifest.saved.map((f, i) => (
            <div className="olf-row" key={i}>
              <span className="olf-form">{f.form}</span>
              <span className="olf-filed">{f.filed}</span>
              <span className="olf-docs">{f.count} docs · {kb(f.bytes)}</span>
              <span className="olf-folder">{f.folder.replace(`${manifest.filingsPath}/`, '')}</span>
            </div>
          ))}
          {manifest.errors?.length > 0 && (
            <div className="olf-errs">{manifest.errors.length} filing(s) failed: {manifest.errors[0].error}</div>
          )}
        </div>
      ) : (
        <div className="olf-empty">No filings archived yet for {deal.company}. Click “Archive filings” to pull the company’s SEC filings into Fabric.</div>
      )}

      {note && <div className="olf-msg">{note}</div>}
    </div>
  );
}
