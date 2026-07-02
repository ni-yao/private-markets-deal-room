// Microsoft Graph change-notification receiver for the O1 Deal-Sourcing signal
// flow. Graph calls this endpoint when the watched mailbox changes:
//   1. Validation handshake — Graph POSTs ?validationToken=... and expects the
//      token echoed back as text/plain within 10s.
//   2. Notifications — Graph POSTs { value: [ ...changeNotifications ] }.
//
// Received mail notifications are kept in memory as "sourcing signals" so the
// Deal-Sourcing (O1) agent can surface them. This endpoint needs no Graph
// permission itself — it only receives callbacks.

import { Router } from 'express';

const router = Router();
const MAX_SIGNALS = 200;
const signals = [];
const clientState = process.env.GRAPH_CLIENT_STATE || '';

function record(note) {
  signals.unshift({
    subscriptionId: note.subscriptionId,
    changeType: note.changeType,
    resource: note.resource,
    messageId: note.resourceData?.id || null,
    receivedAt: new Date().toISOString()
  });
  if (signals.length > MAX_SIGNALS) signals.length = MAX_SIGNALS;
}

// Validation handshake + notification receiver
router.post('/notifications', (req, res) => {
  const token = req.query.validationToken;
  if (token) {
    // Graph validation: echo the token verbatim as text/plain, 200.
    return res.status(200).type('text/plain').send(String(token));
  }
  const notifications = Array.isArray(req.body?.value) ? req.body.value : [];
  for (const n of notifications) {
    if (clientState && n.clientState && n.clientState !== clientState) continue;
    record(n);
  }
  // Acknowledge fast so Graph does not retry.
  res.sendStatus(202);
});

// Some tooling issues a GET probe with the validation token too.
router.get('/notifications', (req, res) => {
  const token = req.query.validationToken;
  if (token) return res.status(200).type('text/plain').send(String(token));
  res.json({ status: 'ready', endpoint: 'graph notifications' });
});

// Read the received mailbox signals (feeds the O1 Deal-Sourcing step).
router.get('/signals', (_req, res) => {
  res.json({ count: signals.length, signals });
});

export default router;
