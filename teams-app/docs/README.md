# Teams app screenshots

The repo landing page ([../../README.md](../../README.md)) keeps **one** web-app
screenshot (the hero) and showcases the rest **from Microsoft Teams**. The Teams
shots below are captured from the **Teams channel-tab web UI** (`teams-app/tab`,
served by the `ca-dealhub-teams` container) — a distinct interface from the full
web app — so they show exactly what Teams renders.

To refresh them, point a headless browser (e.g. Playwright/Chromium) at the tab
URL, drive the views, and save PNGs over the files below (same names). The tab
loads live deal data and exposes a **Demo — "view as"** role switcher, which is
handy for the RBAC shot (switch to *Analyst — user5* and open a Stage-2 deal to
get the "restricted to the deal team" lock).

| File | Root README section | What it shows |
|---|---|---|
| `teams-agent-chat.png` | 🤖 Talk to your deals | The Deal Room agent answering a natural-language question, grounded in live deal data. |
| `teams-dashboard.png` | 📊 The Teams dashboard | The channel-tab dashboard — KPIs, origination funnel, live pipeline deals. |
| `teams-stage1.png` | 🗂️ Stage 1 | Stage 1 — Origination & Screening (funnel + candidate pipeline). |
| `teams-stage2.png` | 🗂️ Stage 2 | Stage 2 — Diligence & Approval (deals in diligence). |
| `teams-rbac.png` | 🔐 Identity-aware access | An Analyst blocked from a Stage-2 deal (role-gated lock). |

## Capture tips

- Use a deal channel in the **Private Equity Deals** team so the bot resolves deal
  context from the channel.
- Prefer the **dark** Teams theme for a crisp look, and crop to the Teams content
  pane (hide personal chat lists / unrelated tenant chrome).
- Aim for ~1600px wide PNGs; keep them under a few hundred KB.
- Avoid real personal data in view — the demo deals (Sound United, National
  CineMedia, XBP Global, Allbirds) are ideal subjects.

Once a PNG is added, uncomment its `![…](teams-app/docs/<file>.png)` line in the
root README and it renders on the repo landing page.
