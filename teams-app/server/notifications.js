// Adaptive Card composition for deal events (new signal, gate PURSUE, IC-ready,
// compliance flag). Cards carry a deep link back to the Teams tab. The event
// payload originates from the shared backend (e.g. the Graph webhook / pipeline).

import { config } from './config.js';
import { sendAdaptiveCardToAll } from './bot.js';

export function buildDealCard(event = {}) {
  const title = event.title || 'Deal Room update';
  const facts = Object.entries(event.facts || {}).map(([k, v]) => ({ title: k, value: String(v) }));
  const deepLink =
    event.deepLink ||
    (config.server.appBaseUrl
      ? config.server.appBaseUrl + (event.dealId ? '/?surface=teams&deal=' + encodeURIComponent(event.dealId) : '/')
      : '');

  const body = [{ type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: title, wrap: true }];
  if (event.summary) body.push({ type: 'TextBlock', text: event.summary, wrap: true, spacing: 'Small' });
  if (facts.length) body.push({ type: 'FactSet', facts });

  const actions = deepLink ? [{ type: 'Action.OpenUrl', title: 'Open in Deal Room', url: deepLink }] : [];

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body,
    actions,
  };
}

export async function postDealEvent(event) {
  return sendAdaptiveCardToAll(buildDealCard(event));
}
