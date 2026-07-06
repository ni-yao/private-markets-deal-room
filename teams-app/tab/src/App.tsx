import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { initTeams, getSsoToken, type TeamsInfo } from './teams';

type TeamsConfig = { demoMode: boolean; backend: string; sso: boolean; bot: boolean };
type Persona = { id: string; name?: string; title?: string } | null;

export default function App() {
  const [teams, setTeams] = useState<TeamsInfo | null>(null);
  const [cfg, setCfg] = useState<TeamsConfig | null>(null);
  const [persona, setPersona] = useState<Persona>(null);
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    (async () => {
      const t = await initTeams();
      setTeams(t);

      const c = await fetch('/api/teams/config')
        .then((r) => r.json())
        .catch(() => null);
      setCfg(c);

      // Per-user context: Teams SSO -> server OBO -> Deal Room persona.
      const token = await getSsoToken();
      const ctx = await fetch('/api/teams/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ssoToken: token }),
      })
        .then((r) => r.json())
        .catch(() => null);
      if (ctx?.persona) setPersona(ctx.persona);

      // Deal data comes from the shared backend via the server proxy.
      const h = await fetch('/api/health')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      setHealth(h?.status ? `backend: ${h.status}` : 'backend: not wired (demo)');
    })();
  }, []);

  return (
    <div style={page}>
      <h1 style={{ marginTop: 0 }}>The Deal Room</h1>
      <p style={{ color: 'var(--muted)' }}>
        Teams channel dashboard — a thin interface over the shared Deal Room backend.
      </p>

      <section style={card}>
        <h3 style={h3}>Session</h3>
        <div>
          In Teams: <b>{teams ? String(teams.inTeams) : '…'}</b> · Theme: <b>{teams?.theme ?? '…'}</b>
        </div>
        <div>
          Signed-in persona:{' '}
          <b>{persona?.name ? `${persona.name}${persona.title ? ` — ${persona.title}` : ''}` : 'anonymous (demo)'}</b>
        </div>
      </section>

      <section style={card}>
        <h3 style={h3}>Connectivity</h3>
        <div>
          Mode: <b>{cfg?.demoMode ? 'demo' : 'live'}</b> · Backend: <b>{cfg?.backend ?? '…'}</b>
        </div>
        <div>
          SSO: <b>{cfg ? String(cfg.sso) : '…'}</b> · Bot: <b>{cfg ? String(cfg.bot) : '…'}</b>
        </div>
        <div>{health}</div>
      </section>

      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Phase 1 wires the existing Deal Room React dashboard here (reusing app/client components) with full SSO + theme.
      </p>
    </div>
  );
}

const page: CSSProperties = {
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  color: 'var(--fg)',
  background: 'var(--bg)',
  minHeight: '100vh',
  padding: 24,
};
const card: CSSProperties = { background: 'var(--card)', borderRadius: 8, padding: 16, margin: '12px 0', maxWidth: 640 };
const h3: CSSProperties = { margin: '0 0 8px' };
