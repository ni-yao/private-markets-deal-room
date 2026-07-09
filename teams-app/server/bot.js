// Bot Framework adapter for Adaptive Card notifications (Phase 2 seam).
//
// Captures the channel conversation reference on install, then posts proactive
// Adaptive Cards (deal events) into that channel with a deep link back to the
// tab. Card content is sourced from the shared backend — the bot holds no data.
// Everything is lazy + guarded so the app boots without bot credentials.

import { config, isBotConfigured } from './config.js';

const conversationReferences = new Map();
let adapter = null;
let botHandler = null;

export async function initBot() {
  if (!isBotConfigured()) return null;
  if (adapter && botHandler) return { adapter, botHandler };

  const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TeamsActivityHandler, TurnContext } =
    await import('botbuilder');

  const auth = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.bot.appId,
    MicrosoftAppPassword: config.bot.appPassword,
    MicrosoftAppType: config.bot.appType,
    MicrosoftAppTenantId: config.bot.tenantId,
  });

  adapter = new CloudAdapter(auth);
  adapter.onTurnError = async (_context, error) => {
    console.error('[bot] turn error:', error);
  };

  class DealRoomBot extends TeamsActivityHandler {
    constructor() {
      super();
      // Remember where to post proactive cards, and greet the channel with its
      // deal context when the app/bot is added.
      this.onConversationUpdate(async (context, next) => {
        const ref = TurnContext.getConversationReference(context.activity);
        conversationReferences.set(ref.conversation.id, ref);
        const added = context.activity.membersAdded || [];
        const botId = context.activity.recipient?.id;
        if (added.some((m) => m && m.id === botId)) {
          try { await sendWelcome(context); } catch { /* non-fatal */ }
        }
        await next();
      });
      this.onMessage(async (context, next) => {
        const ref = TurnContext.getConversationReference(context.activity);
        conversationReferences.set(ref.conversation.id, ref);
        await handleDealMessage(context, TurnContext);
        await next();
      });
    }
  }

  botHandler = new DealRoomBot();
  return { adapter, botHandler };
}

export function getConversationReferences() {
  return conversationReferences;
}

// ---- In-channel conversational agent ---------------------------------------
// A deal channel maps to exactly one deal. Because all deal channels now live in ONE
// parent team, the CHANNEL id (19:…@thread.tacv2) is the only reliable discriminator —
// the team/group id is shared by every deal. So we resolve by channel id FIRST and
// never rely on the shared team/group id.
function teamIdsFromActivity(activity) {
  const cd = activity.channelData || {};
  // conversation.id for a channel message is "19:<thread>@thread.tacv2;messageid=…";
  // strip the messageid suffix so it matches the stored channel id.
  const convBase = String(activity.conversation?.id || '').split(';')[0] || '';
  const ids = [cd.channel?.id, convBase, activity.conversation?.id, cd.team?.aadGroupId, cd.team?.id];
  return [...new Set(ids.filter(Boolean))];
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Resolve the deal for this channel -> { dealId, company } | null.
//   1. by channel/thread id (the persisted channel↔deal map), then
//   2. by the channel's DISPLAY NAME matched to a deal company — robust even when
//      the id map is stale/unhydrated, because a deal channel is named after its company.
async function resolveDeal(activity) {
  const base = config.backend.url;
  if (!base) return null;
  const cd = activity.channelData || {};
  const channelName = cd.channel?.name || '';
  const candidates = teamIdsFromActivity(activity);
  console.log(`[bot] resolveDeal convType=${activity.conversation?.conversationType} channelName="${channelName}" candidates=${JSON.stringify(candidates)}`);

  // 1. by id
  for (const tid of candidates) {
    try {
      const r = await fetch(`${base}/api/deals/resolve-team/${encodeURIComponent(tid)}`);
      if (r.ok) { const d = await r.json(); if (d?.dealId) { console.log(`[bot] resolved by id ${tid} -> ${d.company}`); return d; } }
    } catch { /* try the next candidate id */ }
  }

  // 2. by channel display name -> deal company
  if (channelName) {
    try {
      const r = await fetch(`${base}/api/deals`);
      if (r.ok) {
        const deals = await r.json();
        const cn = normName(channelName);
        const hit = (Array.isArray(deals) ? deals : []).find((d) => {
          const co = normName(d.company);
          return co && cn && (co === cn || co.startsWith(cn) || cn.startsWith(co) || co.includes(cn) || cn.includes(co));
        });
        if (hit) { console.log(`[bot] resolved by name "${channelName}" -> ${hit.company}`); return { dealId: hit.id, company: hit.company }; }
      }
    } catch { /* ignore */ }
  }

  console.log(`[bot] resolveDeal FAILED — no deal for channel "${channelName}" / ${candidates[0] || '(none)'}`);
  return null;
}

// Ask the deal agent (grounded in the deal, authenticated by the app's managed
// identity — no user sign-in) and return its reply text. If the message names a
// persona (AI MD, Retail MD, Supply Chain MD, Partner), route to that persona
// agent WITH the resolved deal context so it answers for THIS channel's deal;
// otherwise use the portfolio/deal analyst.
const PERSONA_MATCHERS = [
  { persona: 'ai-md', re: /\bai[\s-]?md\b|\btech(nology)?\b|\bai\s*(risk|readiness|dd|diligence|lever)/i },
  { persona: 'retail-md', re: /\bretail[\s-]?md\b|\bcommercial\b/i },
  { persona: 'supply-md', re: /\bsupply[\s-]?(chain)?[\s-]?md\b|\boperations?\b|\bsupply\s*chain\b/i },
  { persona: 'partner', re: /\bpartner\b|\binvestment committee\b|\bgo\/?no[\s-]?go\b/i },
];
function personaFor(text) {
  for (const m of PERSONA_MATCHERS) if (m.re.test(text)) return m.persona;
  return null;
}

// Persona lenses applied to the deal analyst so an @mention that names a lead
// (AI MD / Retail MD / Supply MD / Partner) answers in that persona's voice.
const PERSONA_FRAMING = {
  'ai-md': 'You are the Tech/AI diligence lead (AI MD). Focus on technology, data and AI risks, tech debt, scalability and AI/digital value-creation levers.',
  'retail-md': 'You are the Commercial diligence lead (Retail MD). Focus on commercial risks — market/demand, pricing, customer concentration — and commercial value-creation levers.',
  'supply-md': 'You are the Operations / Supply Chain lead (Supply MD). Focus on operational and supply-chain risks, cost-out and operational value-creation levers.',
  partner: 'You are the Deal Partner / IC sponsor. Give a crisp go/no-go read and the IC conditions you would require.',
};

async function askAgent(message, deal) {
  const base = config.backend.url;
  const persona = personaFor(message);
  // Orchestration: route a persona-intent request (AI MD / Retail MD / Supply MD /
  // Partner) to the MATCHING persona agent — which performs reads AND its lane's
  // governed WRITE actions (record findings/contributions, gate, IC) — scoped to
  // this channel's deal. Everything else goes to the deal analyst. The Deal Room
  // bot stays the single interface; the specialised agents still do the work.
  if (persona) {
    try {
      const r = await fetch(`${base}/api/persona-agents/${persona}/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, dealId: deal?.dealId }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.reply) { console.log(`[bot] routed to persona ${persona}`); return data.reply; }
      console.log(`[bot] persona ${persona} unavailable (HTTP ${r.status}) — falling back to analyst`);
    } catch (e) { console.log(`[bot] persona ${persona} call failed — falling back to analyst`); }
    // Resilient fallback: the analyst with the persona's framing (deal-grounded read).
    const framing = PERSONA_FRAMING[persona] || '';
    const fmsg = framing ? `${framing}\n\nQuestion: ${message}` : message;
    const fbody = deal?.dealId ? { message: fmsg, dealId: deal.dealId, scope: 'deal' } : { message: fmsg, scope: 'portfolio' };
    const fr = await fetch(`${base}/api/deal-agent/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fbody) });
    const fd = await fr.json().catch(() => ({}));
    return fd?.reply || fd?.error || 'I don’t have an answer right now.';
  }
  // No persona intent — the deal analyst answers, grounded in this channel's deal.
  const body = deal?.dealId ? { message, dealId: deal.dealId, scope: 'deal' } : { message, scope: 'portfolio' };
  const r = await fetch(`${base}/api/deal-agent/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return data?.reply || data?.error || 'I don’t have an answer right now.';
}

// Greet the channel with its deal context when the bot is installed.
async function sendWelcome(context) {
  const deal = await resolveDeal(context.activity).catch(() => null);
  if (deal?.company) {
    await context.sendActivity(`👋 I’m the deal agent for **${deal.company}**. Ask me anything about this deal — diligence risks, IC readiness, the thesis, key figures — right here. No sign-in needed; just @mention me.`);
  } else {
    await context.sendActivity('👋 I’m the deal agent — ask me about this deal. No sign-in needed; just @mention me.');
  }
}

async function handleDealMessage(context, TurnContext) {
  let text = '';
  try { text = (TurnContext.removeRecipientMention(context.activity) || context.activity.text || '').trim(); }
  catch { text = (context.activity.text || '').trim(); }
  const base = config.backend.url;
  if (!base) { await context.sendActivity('The deal agent backend is not configured.'); return; }
  const deal = await resolveDeal(context.activity).catch(() => null);
  if (!text) {
    await context.sendActivity(deal?.company
      ? `Ask me about **${deal.company}** — e.g. “Summarise the diligence risks” or “What’s the IC readiness?”`
      : 'Ask me about this deal — e.g. “What are the top risks?”');
    return;
  }
  try {
    await context.sendActivities([{ type: 'typing' }]);
    const reply = await askAgent(text, deal);
    await context.sendActivity(reply);
  } catch (err) {
    await context.sendActivity(`The deal agent hit an error — ${String(err?.message || err).slice(0, 140)}`);
  }
}

// Post an Adaptive Card to every channel the bot has been installed in.
export async function sendAdaptiveCardToAll(card) {
  const b = await initBot();
  if (!b) return { sent: 0, reason: 'bot-not-configured' };
  const { CardFactory } = await import('botbuilder');
  let sent = 0;
  for (const ref of conversationReferences.values()) {
    await b.adapter.continueConversationAsync(config.bot.appId, ref, async (context) => {
      await context.sendActivity({ attachments: [CardFactory.adaptiveCard(card)] });
    });
    sent++;
  }
  return { sent };
}
