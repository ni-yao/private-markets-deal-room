// Office document generation for the deal record — a real Word IC memo and an
// Excel deal model, built from the LIVE deal and written into the deal's
// SharePoint data room (see m365/graph.js saveDealDocument). Pure builders:
// they take a deal and return a Buffer, so they are independently testable and
// hold no Graph/tenant state.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';
import ExcelJS from 'exceljs';

const CUR = { USD: '$', EUR: '\u20ac', GBP: '\u00a3' };
const money = (deal) => {
  const sym = CUR[deal?.currency] || (deal?.currency ? `${deal.currency} ` : '$');
  const n = Number(deal?.dealSize);
  return Number.isFinite(n) ? `${sym}${n}M` : '\u2014';
};
const pct = (n) => (Number.isFinite(Number(n)) ? `${Number(n)}%` : '\u2014');
const dash = (v) => (v === 0 || v ? String(v) : '\u2014');
const dateStr = (v) => {
  if (!v) return '\u2014';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};

// The rows that describe a deal at a glance — reused by both the memo and the model.
function summaryRows(deal) {
  return [
    ['Company', deal.company || deal.id || '\u2014'],
    ['Sector', [deal.sector, deal.subSector].filter(Boolean).join(' \u00b7 ') || '\u2014'],
    ['Headquarters', deal.hq || deal.region || '\u2014'],
    ['Enterprise value', money(deal)],
    ['Stage', [deal.stage, deal.stageName].filter(Boolean).join(' \u2014 ') || '\u2014'],
    ['Status', deal.status || '\u2014'],
    ['IC readiness', pct(deal.readiness)],
    ['Target IC date', dateStr(deal.targetICDate || deal.projectedICDate)],
    ['Days to IC', dash(deal.daysToIC)],
    ['Lead analyst', deal.leadAnalyst || '\u2014'],
    ['Sponsor', deal.sponsorPersona || '\u2014'],
    ['Diligence progress', pct(deal.diligenceProgress)],
    ['Compliance', `${dash(deal.complianceCleared)} / ${dash(deal.complianceTotal)} cleared`],
    ['IC memo', `${dash(deal.memoProgress)} / ${dash(deal.memoTotal)} sections${deal.memoApproved ? ' \u00b7 approved' : ''}`],
  ];
}

// ---- Word: Investment Committee memo ---------------------------------------

const HR = () => new Paragraph({ border: { bottom: { color: 'CCCCCC', style: BorderStyle.SINGLE, size: 6, space: 1 } } });

function metaTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'E0E0E0' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E0E0E0' },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: '555555', size: 20 })] })] }),
        new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: String(v), size: 20 })] })] }),
      ],
    })),
  });
}

function bulletList(items) {
  return items.filter(Boolean).map((t) => new Paragraph({ text: String(t), bullet: { level: 0 } }));
}

export async function buildIcMemoDocx(deal) {
  const workstreams = Array.isArray(deal.workstreams) ? deal.workstreams : [];
  const wsLines = workstreams.map((w) => {
    const name = w.name || w.title || w.lane || 'Workstream';
    const prog = Number.isFinite(Number(w.progress)) ? ` \u2014 ${Number(w.progress)}%` : '';
    const owner = w.owner || w.md || w.lead ? ` (${w.owner || w.md || w.lead})` : '';
    const status = w.status ? ` \u00b7 ${w.status}` : '';
    return `${name}${prog}${owner}${status}`;
  });

  const readiness = Number(deal.readiness) || 0;
  const recommendation = readiness >= 60
    ? 'Advance to Investment Committee. Diligence is materially complete; finalise confirmatory workstreams and circulate the binding proposal.'
    : readiness >= 25
      ? 'Continue diligence. Close the open workstreams below and re-assess IC readiness before scheduling the committee.'
      : 'Early diligence. Prioritise the commercial and financial workstreams to establish the core thesis before committing further resource.';

  const doc = new Document({
    creator: 'The Deal Room',
    title: `IC Memo \u2014 ${deal.company || deal.id}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: 'INVESTMENT COMMITTEE MEMO', bold: true, color: '2F5496', size: 18 })] }),
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: deal.company || deal.id || 'Deal' })] }),
        new Paragraph({ children: [new TextRun({ text: `Generated ${dateStr(new Date())} \u00b7 The Deal Room \u00b7 CONFIDENTIAL`, italics: true, color: '888888', size: 18 })] }),
        HR(),
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Deal at a glance' }),
        metaTable(summaryRows(deal)),
        new Paragraph({ text: '' }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Investment thesis' }),
        new Paragraph({ text: deal.thesis || 'Thesis pending \u2014 populate from the sourcing framework and diligence findings.' }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Diligence workstreams' }),
        ...(wsLines.length ? bulletList(wsLines) : [new Paragraph({ text: 'Workstreams not yet provisioned.' })]),
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Readiness & timeline' }),
        ...bulletList([
          `IC readiness: ${pct(deal.readiness)} \u00b7 diligence progress ${pct(deal.diligenceProgress)}.`,
          `Compliance: ${dash(deal.complianceCleared)} of ${dash(deal.complianceTotal)} items cleared.`,
          `Target IC date: ${dateStr(deal.targetICDate || deal.projectedICDate)}${Number.isFinite(Number(deal.daysToIC)) ? ` (in ${deal.daysToIC} days)` : ''}.`,
        ]),
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Recommendation' }),
        new Paragraph({ children: [new TextRun({ text: recommendation })] }),
        new Paragraph({ text: '' }),
        new Paragraph({ children: [new TextRun({ text: 'This memo was generated from the live deal record in The Deal Room. Figures reflect the state of diligence at generation time.', italics: true, color: '888888', size: 18 })] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

// ---- Excel: deal model / data export ---------------------------------------

export async function buildDealModelXlsx(deal) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Deal Room';
  wb.created = new Date();

  // Sheet 1 — Summary
  const s = wb.addWorksheet('Deal Summary', { properties: { defaultColWidth: 22 } });
  s.mergeCells('A1:B1');
  s.getCell('A1').value = `The Deal Room \u2014 ${deal.company || deal.id}`;
  s.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF2F5496' } };
  s.addRow([]);
  s.getColumn(1).width = 26; s.getColumn(2).width = 48;
  const hdr = s.addRow(['Metric', 'Value']);
  hdr.font = { bold: true }; hdr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; });
  for (const [k, v] of summaryRows(deal)) s.addRow([k, v]);
  // numeric cells for modelling
  s.addRow([]);
  s.addRow(['Enterprise value (M)', Number(deal.dealSize) || null]);
  s.addRow(['IC readiness (%)', Number(deal.readiness) || 0]);
  s.addRow(['Diligence progress (%)', Number(deal.diligenceProgress) || 0]);
  s.addRow(['Days to IC', Number(deal.daysToIC) || null]);
  s.getColumn(1).eachCell((c) => { if (c.row > 3) c.font = { color: { argb: 'FF555555' } }; });

  // Sheet 2 — Workstreams
  const w = wb.addWorksheet('Workstreams');
  w.columns = [
    { header: 'Workstream', key: 'name', width: 32 },
    { header: 'Owner', key: 'owner', width: 22 },
    { header: 'Progress (%)', key: 'progress', width: 14 },
    { header: 'Status', key: 'status', width: 18 },
  ];
  w.getRow(1).font = { bold: true };
  w.getRow(1).eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; });
  const workstreams = Array.isArray(deal.workstreams) ? deal.workstreams : [];
  if (workstreams.length) {
    for (const ws of workstreams) {
      w.addRow({
        name: ws.name || ws.title || ws.lane || 'Workstream',
        owner: ws.owner || ws.md || ws.lead || '',
        progress: Number.isFinite(Number(ws.progress)) ? Number(ws.progress) : '',
        status: ws.status || '',
      });
    }
  } else {
    w.addRow({ name: 'No workstreams provisioned yet', owner: '', progress: '', status: '' });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

export const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
