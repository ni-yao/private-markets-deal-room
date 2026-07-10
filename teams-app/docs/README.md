# Teams app screenshots

The repo landing page ([../../README.md](../../README.md)) keeps **one** web-app
screenshot (the hero) and showcases the rest **from Microsoft Teams**. Drop the
PNGs below into this folder using the exact filenames, then **uncomment** the
matching `![…]` line in the root README (each slot is marked with an HTML comment
right where it belongs).

| File (place here) | Root README section | What to capture |
|---|---|---|
| `teams-agent-chat.png` | 🤖 Talk to your deals | `@Deal Room Assistant` answering a natural-language question **inside a deal channel** (show the @mention + a grounded reply). |
| `teams-dashboard.png` | 📊 The Teams dashboard | The **SSO channel tab** — Home command centre and/or a per-deal detail view rendered natively in Teams. |
| `teams-stage1.png` | 🗂️ Stage 1 | The **Stage 1** screening view (funnel / sourcing / screening gate) in the Teams tab. |
| `teams-stage2.png` | 🗂️ Stage 2 | The **Stage 2** diligence view (DD checklist / swimlanes) in the Teams tab. |
| `teams-rbac.png` *(optional)* | 🔐 Identity-aware access | A **role-gated** moment — e.g. an analyst getting a read-only / denied response vs a partner's full answer. |

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
