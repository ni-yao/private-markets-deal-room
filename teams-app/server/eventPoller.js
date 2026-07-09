// Event poller (Phase 2) — turns shared-backend deal events into Adaptive Card
// notifications WITHOUT modifying the app. Polls the existing signals feed
// (/api/graph/signals) and posts a card per genuinely-new signal. Self-guards:
// only runs when a backend is configured AND the bot is set up.

import { config, isBackendLive, isBotConfigured } from './config.js';
import { postDealEvent } from './notifications.js';

let timer = null;
let primed = false;
const seen = new Set();

function signalId(s) {
  return s.id || s.messageId || `${s.company || ''}:${s.receivedAt || s.date || s.subject || ''}`;
}

async function poll() {
  try {
    const r = await fetch(`${config.backend.url}/api/graph/signals`);
    if (!r.ok) return;
    const data = await r.json();
    const signals = Array.isArray(data) ? data : data.signals || data.value || [];
    for (const s of signals) {
      const id = signalId(s);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // First poll only seeds the backlog — alert on NEW signals thereafter.
      if (!primed) continue;
      await postDealEvent({
        title: `New sourcing signal: ${s.company || 'Unknown'}`,
        summary: s.subject || s.summary || s.intent || 'A new CxO / news signal arrived.',
        facts: {
          Company: s.company || '—',
          Intent: s.intent || '—',
          Source: s.source || 'signal',
        },
        deepLink: config.server.appBaseUrl || '',
      });
    }
    primed = true;
  } catch {
    // Backend momentarily unreachable — try again next tick.
  }
}

export function startEventPoller({ intervalMs = 30000 } = {}) {
  if (!isBackendLive() || !isBotConfigured()) return false;
  if (timer) return true;
  timer = setInterval(poll, intervalMs);
  poll();
  return true;
}

export function stopEventPoller() {
  if (timer) clearInterval(timer);
  timer = null;
}
