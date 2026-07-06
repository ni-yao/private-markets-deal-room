// AI client — talks to the deployed Azure AI Foundry (Azure OpenAI) model when
// configured, otherwise reports "demo" so callers fall back to seeded output.
// Auth prefers managed identity (DefaultAzureCredential); an API key is optional.

import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5-mini';
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
const apiKey = process.env.AZURE_OPENAI_API_KEY || '';

// gpt-5 and the o-series are reasoning models: they use max_completion_tokens
// (not max_tokens), only support the default temperature, and spend tokens on
// internal reasoning — so they need a larger completion budget. Detected per
// deployment inside complete() so a per-call override is handled correctly.

// One AzureOpenAI client per deployment (Azure binds the deployment at client
// construction, so a per-deployment cache lets callers target a different model —
// e.g. the higher-capacity news deployment for background report generation).
const clients = {};
let sharedCredential = null;

function clientFor(dep) {
  if (!endpoint) return null;
  if (clients[dep]) return clients[dep];
  try {
    if (apiKey) {
      clients[dep] = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment: dep });
    } else {
      sharedCredential = sharedCredential || new DefaultAzureCredential();
      const azureADTokenProvider = getBearerTokenProvider(sharedCredential, 'https://cognitiveservices.azure.com/.default');
      clients[dep] = new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion, deployment: dep });
    }
  } catch {
    clients[dep] = null;
  }
  return clients[dep];
}

export function getModelInfo() {
  return {
    mode: endpoint ? 'live' : 'demo',
    model: deployment,
    endpoint: endpoint ? endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
    auth: endpoint ? (apiKey ? 'api-key' : 'managed-identity') : null
  };
}

// Optional `dep` overrides the deployment for this call (defaults to the app model).
export async function complete({ system, user, maxTokens = 700, temperature = 0.4, deployment: dep = deployment }) {
  const c = clientFor(dep);
  if (!c) return null;
  const reasoning = /(^|[-_])(gpt-5|o1|o3|o4)/i.test(dep);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  const params = reasoning
    ? {
        model: dep,
        messages,
        max_completion_tokens: Math.max(maxTokens * 5, 5000),
        reasoning_effort: 'low'
      }
    : { model: dep, messages, temperature, max_tokens: maxTokens };
  const resp = await c.chat.completions.create(params);
  return resp.choices?.[0]?.message?.content?.trim() || null;
}
