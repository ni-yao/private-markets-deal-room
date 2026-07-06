import { app, authentication } from '@microsoft/teams-js';

export type TeamsInfo = { inTeams: boolean; theme: string; context?: unknown };

// Map the Teams theme to CSS variables (Phase 1 will map onto the existing
// Deal Room theme.css variables so reused components restyle automatically).
function applyTheme(theme: string) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const dark = theme === 'dark';
  const contrast = theme === 'contrast';
  root.style.setProperty('--bg', contrast ? '#000000' : dark ? '#1f1f1f' : '#ffffff');
  root.style.setProperty('--fg', contrast ? '#ffffff' : dark ? '#f3f3f3' : '#242424');
  root.style.setProperty('--muted', dark || contrast ? '#a6a6a6' : '#616161');
  root.style.setProperty('--accent', '#6264a7');
  root.style.setProperty('--card', contrast ? '#000000' : dark ? '#2b2b2b' : '#f5f5f5');
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
export async function getSsoToken(): Promise<string | null> {
  try {
    return await authentication.getAuthToken();
  } catch {
    return null;
  }
}
