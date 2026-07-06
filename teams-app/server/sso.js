// Teams SSO — On-Behalf-Of token exchange.
//
// The tab acquires a Teams SSO token (getAuthToken via @microsoft/teams-js) and
// posts it here; the server exchanges it for a Microsoft Graph token using the
// OBO flow, so calls run as the signed-in user. Demo mode (no SSO config) skips
// the exchange and returns null so the tab still works with anonymous data.

import { config, isSsoConfigured } from './config.js';

let cca = null;

async function getClient() {
  if (cca) return cca;
  // Imported lazily so the app still boots without @azure/msal-node installed.
  const { ConfidentialClientApplication } = await import('@azure/msal-node');
  cca = new ConfidentialClientApplication({
    auth: {
      clientId: config.entra.tabClientId,
      authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
      clientSecret: config.entra.tabClientSecret,
    },
  });
  return cca;
}

// Exchange a Teams SSO token for a downstream (Graph) access token.
export async function exchangeOnBehalfOf(ssoToken, scopes = ['https://graph.microsoft.com/User.Read']) {
  if (!isSsoConfigured() || !ssoToken) return null;
  const client = await getClient();
  const result = await client.acquireTokenOnBehalfOf({ oboAssertion: ssoToken, scopes });
  return result?.accessToken ?? null;
}

// Minimal identity extracted from the SSO token payload (no network call).
export function identityFromSsoToken(ssoToken) {
  if (!ssoToken || typeof ssoToken !== 'string' || ssoToken.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(ssoToken.split('.')[1], 'base64url').toString('utf8'));
    return {
      oid: payload.oid ?? null,
      name: payload.name ?? null,
      upn: payload.preferred_username ?? payload.upn ?? null,
      tid: payload.tid ?? null,
    };
  } catch {
    return null;
  }
}
