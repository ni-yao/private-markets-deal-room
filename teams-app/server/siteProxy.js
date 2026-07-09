// Site proxy — serves the EXISTING Deal Room web UI (from the shared backend)
// through the Teams app origin, so the Channel Tab is the real dashboard with
// zero component duplication and a single data source. HTML responses get a
// small Teams bootstrap injected (theme sync + SSO notify); assets stream through.

import { config } from './config.js';

const BOOTSTRAP_TAGS =
  '\n<script src="https://res.cdn.office.net/teams-js/2.31.1/js/MicrosoftTeams.min.js"></script>' +
  '\n<script src="/teams-bootstrap.js"></script>\n';

export async function siteProxy(req, res) {
  const target = `${config.backend.url}${req.originalUrl}`;
  try {
    const upstream = await fetch(target, {
      headers: { accept: req.headers.accept || '*/*', 'user-agent': req.headers['user-agent'] || 'teams-app' },
    });
    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);

    if (contentType.includes('text/html')) {
      let html = await upstream.text();
      html = html.includes('</head>')
        ? html.replace('</head>', `${BOOTSTRAP_TAGS}</head>`)
        : `${html}${BOOTSTRAP_TAGS}`;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    upstream.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (lk !== 'content-encoding' && lk !== 'transfer-encoding' && lk !== 'content-length') {
        res.setHeader(key, value);
      }
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    res.status(502).send('Shared backend unreachable');
  }
}

// The injected bootstrap: initialize Teams, map the Teams theme onto the Deal
// Room client's REAL :root variables (with a proper dark + high-contrast
// palette), and — when the channel tab is scoped to a single deal (?deal=…) —
// apply a focused layout that hides the portfolio nav for a native fit.
export const TEAMS_BOOTSTRAP_JS = `(function () {
  var params = new URLSearchParams(window.location.search);
  var focused = !!params.get('deal');

  // Deal-scoped channel: Teams provides the channel context, so hide the app's
  // portfolio spine + top bar and give the single deal full width.
  var LAYOUT = focused
    ? '.spine{display:none !important;}.dealbar{display:none !important;}.app{grid-template-columns:1fr !important;}'
    : '';

  var DARK = ':root{' +
    '--ink:#e6eaf2;--ink-2:#c5cede;--muted:#9aa7bd;--faint:#6b7890;' +
    '--line:#2a3547;--line-2:#222b3a;--surface:#1b2233;--canvas:#141a27;--canvas-2:#1b2233;' +
    '--primary:#5b8cff;--primary-tint:#1e2a44;--blue:#5b8cff;' +
    '--orange:#fb923c;--orange-tint:#3a2417;--green:#4ade80;--green-tint:#16301f;' +
    '--positive:#2dd4bf;--positive-tint:#123027;--amber:#fbbf24;--amber-tint:#332a12;--danger:#f87171;' +
    '--shadow:0 1px 2px rgba(0,0,0,.4),0 6px 20px rgba(0,0,0,.35);' +
    '--shadow-lg:0 20px 55px rgba(0,0,0,.55);}' +
    'body{background:var(--canvas);color:var(--ink);}';

  var CONTRAST = ':root{' +
    '--ink:#ffffff;--ink-2:#ffffff;--muted:#ffff00;--faint:#ffff00;' +
    '--line:#ffffff;--line-2:#ffffff;--surface:#000000;--canvas:#000000;--canvas-2:#000000;' +
    '--primary:#ffff00;--primary-tint:#000000;--blue:#00ebff;--green:#3ff23f;--positive:#3ff23f;--danger:#ff5c5c;}' +
    'body{background:#000;color:#fff;}';

  function skin(theme) {
    var el = document.getElementById('teams-skin');
    if (!el) { el = document.createElement('style'); el.id = 'teams-skin'; (document.head || document.documentElement).appendChild(el); }
    var css = LAYOUT;
    if (theme === 'dark') css += DARK;
    else if (theme === 'contrast') css += CONTRAST;
    el.textContent = css;
    document.documentElement.setAttribute('data-teams-theme', theme || 'default');
  }

  // Apply layout immediately so there's no flash of the full portfolio shell.
  skin('default');

  try {
    if (window.microsoftTeams) {
      microsoftTeams.app.initialize()
        .then(function () { return microsoftTeams.app.getContext(); })
        .then(function (ctx) {
          skin(ctx && ctx.app && ctx.app.theme);
          microsoftTeams.app.registerOnThemeChangeHandler(skin);
          microsoftTeams.app.notifySuccess();
        })
        .catch(function () {});
    }
  } catch (e) {}
})();`;

// Channel-tab configuration page. Lets the user scope the channel to a single
// deal (or the whole portfolio), then configures the content URL accordingly.
export const TEAMS_CONFIG_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Configure The Deal Room</title>
    <script src="https://res.cdn.office.net/teams-js/2.31.1/js/MicrosoftTeams.min.js"></script>
    <style>
      body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; color: #242424; }
      h3 { margin: 0 0 6px; }
      p { color: #616161; margin: 0 0 16px; }
      label { display: block; font-weight: 600; margin-bottom: 6px; }
      select { width: 100%; max-width: 420px; padding: 8px 10px; border-radius: 6px; border: 1px solid #d1d1d1; font-size: 14px; }
    </style>
  </head>
  <body>
    <h3>The Deal Room</h3>
    <p>Choose what this channel tab shows, then click <b>Save</b>.</p>
    <label for="scope">Scope</label>
    <select id="scope"><option value="">Whole portfolio (dashboard)</option></select>
    <script>
      (function () {
        var sel = document.getElementById('scope');
        var deals = [];
        function labelFor(d) { return d.company || d.name || d.title || d.id; }
        function apply() {
          var origin = window.location.origin;
          var id = sel.value;
          var deal = deals.filter(function (d) { return d.id === id; })[0];
          var content = origin + '/?surface=teams' + (id ? '&deal=' + encodeURIComponent(id) : '');
          return microsoftTeams.pages.config.setConfig({
            entityId: id ? 'dealroom-deal-' + id : 'dealroom-dashboard',
            contentUrl: content,
            websiteUrl: content,
            suggestedDisplayName: deal ? labelFor(deal) : 'Deal Room'
          });
        }
        function ready() {
          microsoftTeams.pages.config.registerOnSaveHandler(function (saveEvent) {
            apply()
              .then(function () { saveEvent.notifySuccess(); })
              .catch(function () { saveEvent.notifyFailure('config failed'); });
          });
          microsoftTeams.pages.config.setValidityState(true);
          microsoftTeams.app.notifySuccess();
          // Populate the deal list from the shared backend (single data source).
          fetch('/api/deals').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
            deals = Array.isArray(list) ? list : (list.deals || []);
            deals.forEach(function (d) {
              var o = document.createElement('option');
              o.value = d.id; o.textContent = labelFor(d);
              sel.appendChild(o);
            });
          }).catch(function () {});
        }
        try { microsoftTeams.app.initialize().then(ready).catch(function () {}); } catch (e) {}
      })();
    </script>
  </body>
</html>`;
