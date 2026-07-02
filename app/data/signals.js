// Seed M365 data for the O1 · Deal Sourcing "CxO signals" explorer.
//   mailbox    — the analyst's raw personal M365 data (left-hand tabs):
//                emails, chats, meeting notes (+ a little noise for realism).
//   companies  — target companies with the subset of items that read as
//                signals of intent / receptivity (right-hand grouped view),
//                plus a simulated Dynamics 365 CRM relationship lookup.

function hoursAgo(h) {
  const t = new Date();
  t.setHours(t.getHours() - h);
  return t.toISOString();
}
function daysAgo(d) {
  return hoursAgo(d * 24);
}

// ---- Companies -------------------------------------------------------------
export const signalCompanies = [
  {
    id: 'frostbite',
    name: 'Frostbite Foods',
    sector: 'Consumer & Retail',
    hq: 'Munich, Germany',
    summary: 'Founder-led DACH frozen & convenience foods maker; three bolt-ons available.',
    intent: 'high',
    crm: {
      exists: true,
      status: 'Active relationship',
      owner: 'Eleanor Bishop (Partner)',
      stage: 'Watchlist',
      opportunities: 1,
      lastContact: daysAgo(38),
      note: 'Prior partnership conversation logged at last year’s summit. Warm intro available — founder receptive to a minority growth deal.'
    }
  },
  {
    id: 'gridsense',
    name: 'GridSense AI',
    sector: 'Software · Energy AI',
    hq: 'Copenhagen, Denmark',
    summary: 'Energy-grid AI with proprietary sensor data; Series C insider round oversubscribed.',
    intent: 'high',
    crm: {
      exists: false,
      note: 'No CRM record — net-new target. A Dynamics 365 record will be created automatically when the deal moves to auto-screen (O2).'
    }
  },
  {
    id: 'meridian',
    name: 'Meridian Components',
    sector: 'Industrials',
    hq: 'Stuttgart, Germany',
    summary: 'Precision components maker riding the reshoring tailwind; founder nearing retirement.',
    intent: 'medium',
    crm: {
      exists: true,
      status: 'Contact only',
      owner: 'James Whitfield (Retail MD)',
      stage: '—',
      opportunities: 0,
      lastContact: daysAgo(190),
      note: 'Known contact from a prior process; no active opportunity. Relationship is cold — re-engagement needed.'
    }
  }
];

// ---- Mailbox: emails -------------------------------------------------------
// 10 company-tagged emails (4 / 3 / 3) + 2 noise items.
export const emails = [
  { id: 'e1', company: 'frostbite', from: 'Lena Brandt <lena@frostbitefoods.de>', role: 'Founder & CEO', subject: 'Re: Great to reconnect at the DACH Food Summit', preview: 'Really enjoyed our chat. We’re finally open to bringing in a growth partner — would value your perspective on how you’d think about it.', when: hoursAgo(6), intent: 'high' },
  { id: 'e2', company: 'frostbite', from: 'Markus Vogel <markus.vogel@frostbitefoods.de>', role: 'CFO', subject: 'Preliminary numbers ahead of our call', preview: 'Sharing last year’s P&L and the bolt-on pipeline informally so you have context before we speak Thursday.', when: hoursAgo(30), intent: 'high' },
  { id: 'e3', company: 'frostbite', from: 'Sofia Klein <sofia.klein@brunnerpartners.de>', role: 'Advisor, Brunner Partners', subject: 'Frostbite may run a limited process in Q3', preview: 'Heads up — the family is testing appetite quietly before deciding whether to launch. Wanted you in early.', when: daysAgo(3), intent: 'medium' },
  { id: 'e4', company: 'frostbite', from: 'Maya Olsen <maya.olsen@ourfirm.com>', role: 'Internal · Analyst', subject: 'Frostbite Foods — founder open to minority?', preview: 'Notes from the summit + my read on why this fits the convenience-grocery mandate. Recommend we move quickly.', when: daysAgo(2), intent: 'high' },
  { id: 'e5', company: 'gridsense', from: 'Aisha Rahman <aisha@gridsense.ai>', role: 'Co-founder & CEO', subject: 'Thanks for the intro — happy to chat', preview: 'Appreciate Daniel connecting us. We’re selectively adding a strategic partner alongside the insider round — open to a conversation.', when: hoursAgo(20), intent: 'high' },
  { id: 'e6', company: 'gridsense', from: 'Daniel Okafor <daniel@northlight.vc>', role: 'Partner, Northlight VC', subject: 'GridSense round is oversubscribed — they want a strategic', preview: 'They’d prefer a partner who understands energy infra. Their sensor-data moat is the real story. Can intro this week.', when: daysAgo(1), intent: 'high' },
  { id: 'e7', company: 'gridsense', from: 'Priya Nair <priya.nair@ourfirm.com>', role: 'Internal · AI MD', subject: 'GridSense AI — proprietary sensor data moat', preview: 'Did a quick tech read: defensibility looks genuine, not a GPT wrapper. Worth a deeper AI-readiness pass.', when: daysAgo(1), intent: 'medium' },
  { id: 'e8', company: 'meridian', from: 'Karl Ober <k.ober@meridian-components.de>', role: 'Founder & Owner', subject: 'Succession planning — exploring options', preview: 'As you know I’m stepping back in the next couple of years. Starting to think about the right long-term home for the business.', when: daysAgo(5), intent: 'high' },
  { id: 'e9', company: 'meridian', from: 'Thomas Reid <treid@tradewatch.io>', role: 'Trade analyst', subject: 'Meridian benefiting from reshoring tailwind', preview: 'Order book up sharply as OEMs dual-source away from tariff-exposed regions. Founder-owned, no PE on the cap table.', when: daysAgo(6), intent: 'medium' },
  { id: 'e10', company: 'meridian', from: 'Maya Olsen <maya.olsen@ourfirm.com>', role: 'Internal · Analyst', subject: 'Meridian Components — founder retirement window', preview: 'Succession + reshoring = a clean entry. Relationship is cold though — we last spoke ~6 months ago.', when: daysAgo(4), intent: 'medium' },
  { id: 'e11', company: null, from: 'Bloomberg <noreply@bloomberg.net>', role: 'Newsletter', subject: 'Five Things to Start Your Day', preview: 'Markets mixed as rate-cut bets firm; European consumer names in focus…', when: hoursAgo(9), intent: 'low' },
  { id: 'e12', company: null, from: 'IT Service Desk <it@ourfirm.com>', role: 'Internal · Ops', subject: 'Scheduled maintenance this weekend', preview: 'The deal model repository will be briefly unavailable Saturday 22:00–23:00 CET.', when: daysAgo(1), intent: 'low' }
];

// ---- Mailbox: chats (Teams) ------------------------------------------------
export const chats = [
  { id: 'c1', company: 'frostbite', from: 'Lena Brandt', channel: 'Direct message', preview: 'Honestly we’d love to explore what a partnership could look like — no bankers yet, just us.', when: hoursAgo(4), intent: 'high' },
  { id: 'c2', company: 'frostbite', from: 'Deal Team · Consumer', channel: 'Teams channel', preview: 'Maya: Founder pinged me directly. This is a proprietary look before any process — let’s not lose it.', when: hoursAgo(28), intent: 'high' },
  { id: 'c3', company: 'gridsense', from: 'Aisha Rahman', channel: 'Direct message', preview: 'Can share the data-rights overview under NDA. That’s the part most investors miss.', when: hoursAgo(18), intent: 'high' },
  { id: 'c4', company: 'gridsense', from: 'Deal Team · Tech', channel: 'Teams channel', preview: 'Priya: sensor telemetry looks proprietary and sticky. AI-readiness likely strong.', when: daysAgo(1), intent: 'medium' },
  { id: 'c5', company: 'meridian', from: 'Karl Ober', channel: 'Direct message', preview: 'Not in a rush, but I want to get the ownership question right. Open to an informal chat.', when: daysAgo(5), intent: 'medium' },
  { id: 'c6', company: null, from: 'Ops · Pipeline', channel: 'Teams channel', preview: 'Reminder: weekly pipeline sync moved to Friday 10:00.', when: daysAgo(2), intent: 'low' }
];

// ---- Mailbox: meeting notes ------------------------------------------------
export const meetings = [
  { id: 'm1', company: 'frostbite', title: 'DACH Food Summit — booth conversation', attendees: 'Lena Brandt (Frostbite), Maya Olsen', preview: 'Founder volunteered that the family is finally aligned on external capital. Wants a partner, not an exit. Very warm.', when: daysAgo(9), intent: 'high' },
  { id: 'm2', company: 'frostbite', title: 'Intro call recap — Frostbite', attendees: 'Markus Vogel (CFO), Maya Olsen, Eleanor Bishop', preview: 'Walked through margins and the bolt-on pipeline. CFO comfortable sharing more under NDA. Next: preliminary model.', when: daysAgo(1), intent: 'high' },
  { id: 'm3', company: 'gridsense', title: 'GridSense product demo — notes', attendees: 'Aisha Rahman (CEO), Priya Nair', preview: 'Live demo of the grid-optimisation model. Proprietary sensor network is the moat. CEO open to a strategic partner.', when: hoursAgo(16), intent: 'high' },
  { id: 'm4', company: 'meridian', title: 'Meridian site visit — notes', attendees: 'Karl Ober (Founder), James Whitfield', preview: 'Founder candid about succession timeline. Order book strong on reshoring. No active process — early but real.', when: daysAgo(6), intent: 'medium' },
  { id: 'm5', company: null, title: 'Weekly pipeline sync', attendees: 'Deal team', preview: 'Reviewed 14 active screens; agreed to prioritise founder-led consumer names.', when: daysAgo(2), intent: 'low' }
];

export const mailbox = { emails, chats, meetings };

export function crmForCompany(id) {
  const c = signalCompanies.find((x) => x.id === id);
  return c ? { companyId: c.id, company: c.name, ...c.crm } : null;
}

export function companiesWithSignals() {
  return signalCompanies.map((c) => {
    const es = emails.filter((e) => e.company === c.id);
    const cs = chats.filter((x) => x.company === c.id);
    const ms = meetings.filter((x) => x.company === c.id);
    return {
      id: c.id,
      name: c.name,
      sector: c.sector,
      hq: c.hq,
      summary: c.summary,
      intent: c.intent,
      counts: { emails: es.length, chats: cs.length, meetings: ms.length, total: es.length + cs.length + ms.length },
      hasCrm: c.crm.exists,
      signals: { emails: es, chats: cs, meetings: ms }
    };
  });
}
