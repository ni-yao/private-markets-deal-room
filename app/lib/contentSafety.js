// Content Safety guard — screens user-supplied chat text through Azure AI
// Content Safety before it reaches the deal orchestrator. Fail-open by design:
// any missing config, network error, or unexpected response returns
// { allowed: true } so a guard outage never takes the product down. Only
// content at or above config.contentSafety.threshold (default 6 of 7) blocks,
// so ordinary deal/business language never trips it.

import { DefaultAzureCredential } from '@azure/identity';
import { config, isContentSafetyLive } from './config.js';

const API_VERSION = '2024-09-01';
const CATEGORIES = ['Hate', 'SelfHarm', 'Sexual', 'Violence'];

let sharedCredential = null;

/**
 * @param {string} text
 * @returns {Promise<{allowed: boolean, category?: string, severity?: number}>}
 */
export async function screenText(text) {
  const body = String(text || '').trim();
  if (!body || !isContentSafetyLive()) return { allowed: true };

  const threshold = config.contentSafety.threshold;
  try {
    sharedCredential = sharedCredential || new DefaultAzureCredential();
    const token = await sharedCredential.getToken('https://cognitiveservices.azure.com/.default');
    if (!token?.token) return { allowed: true };

    const url = `${config.contentSafety.endpoint}/contentsafety/text:analyze?api-version=${API_VERSION}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: body.slice(0, 10000),
        categories: CATEGORIES,
        outputType: 'EightSeverityLevels',
      }),
    });
    if (!res.ok) return { allowed: true };

    const data = await res.json();
    const analyses = Array.isArray(data?.categoriesAnalysis) ? data.categoriesAnalysis : [];
    const hit = analyses.find((a) => Number(a?.severity) >= threshold);
    if (hit) return { allowed: false, category: hit.category, severity: Number(hit.severity) };
    return { allowed: true };
  } catch {
    // Fail-open: never let a guard error block the product.
    return { allowed: true };
  }
}
