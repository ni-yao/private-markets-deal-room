import { app, authentication } from '@microsoft/teams-js';

export type TeamsInfo = { inTeams: boolean; theme: string; context?: unknown };

// Map the Teams theme onto a full set of CSS variables so the native tab restyles
// automatically for default / dark / high-contrast, matching Teams' own palette.
function applyTheme(theme: string) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const dark = theme === 'dark';
  const contrast = theme === 'contrast';
  const t = (light: string, darkV: string, contrastV: string) => (contrast ? contrastV : dark ? darkV : light);

  root.style.setProperty('--bg', t('#f5f5f5', '#1f1f1f', '#000000'));
  root.style.setProperty('--surface', t('#ffffff', '#2b2b2b', '#000000'));
  root.style.setProperty('--card', t('#ffffff', '#292929', '#000000'));
  root.style.setProperty('--fg', t('#242424', '#f3f3f3', '#ffffff'));
  root.style.setProperty('--muted', t('#616161', '#adadad', '#c8c8c8'));
  root.style.setProperty('--border', t('#e0e0e0', '#3d3d3d', '#ffffff'));
  root.style.setProperty('--accent', t('#5b5fc7', '#7f85f5', '#ffff01'));
  root.style.setProperty('--accent-fg', t('#ffffff', '#ffffff', '#000000'));
  root.style.setProperty('--hover', t('#f0f0f0', '#333333', '#1a1a1a'));
  root.style.setProperty('--bubble-user', t('#e8ebfa', '#3b3d5c', '#0f0f00'));
  root.style.setProperty('--bubble-agent', t('#ffffff', '#333333', '#000000'));
  root.style.setProperty('--input-bg', t('#ffffff', '#1f1f1f', '#000000'));
  root.style.setProperty('--chip', t('#eeeef7', '#33344a', '#0f0f00'));
  root.style.setProperty('--shadow', dark || contrast ? 'none' : '0 1px 2px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)');
}

export async function initTeams(): Promise<TeamsInfo> {
  try {
    await app.initialize();
    const context = await app.getContext();
    const theme = context.app.theme || 'default';
    applyTheme(theme);
    app.registerOnThemeChangeHandler(applyTheme);
    app.notifySuccess();
    return { inTeams: true, theme, context };
  } catch {
    // Running outside Teams (local browser) — render with the default theme.
    applyTheme('default');
    return { inTeams: false, theme: 'default' };
  }
}

// Teams SSO token (exchanged server-side via OBO). Null outside Teams / no SSO.
// Time-boxed: outside the Teams host getAuthToken never resolves, so we cap it
// so the tab never blocks its data loads on SSO.
export async function getSsoToken(): Promise<string | null> {
  try {
    return await Promise.race([
      authentication.getAuthToken(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch {
    return null;
  }
}
