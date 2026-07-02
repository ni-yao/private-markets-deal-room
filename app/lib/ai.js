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
// internal reasoning — so they need a larger completion budget.
const isReasoningModel = /(^|[-_])(gpt-5|o1|o3|o4)/i.test(deployment);

let client = null;
let initError = null;

function getClient() {
  if (client || initError) return client;
  if (!endpoint) return null;
  try {
    if (apiKey) {
      client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });
    } else {
      const credential = new DefaultAzureCredential();
      const azureADTokenProvider = getBearerTokenProvider(
        credential,
        'https://cognitiveservices.azure.com/.default'
      );
      client = new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion, deployment });
    }
  } catch (err) {
    initError = err;
    client = null;
  }
  return client;
}

export function getModelInfo() {
  return {
    mode: endpoint ? 'live' : 'demo',
    model: deployment,
    endpoint: endpoint ? endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
    auth: endpoint ? (apiKey ? 'api-key' : 'managed-identity') : null
  };
}

export async function complete({ system, user, maxTokens = 700, temperature = 0.4 }) {
  const c = getClient();
  if (!c) return null;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  const params = isReasoningModel
    ? {
        model: deployment,
        messages,
        max_completion_tokens: Math.max(maxTokens * 5, 5000),
        reasoning_effort: 'low'
      }
    : { model: deployment, messages, temperature, max_tokens: maxTokens };
  const resp = await c.chat.completions.create(params);
  return resp.choices?.[0]?.message?.content?.trim() || null;
}
