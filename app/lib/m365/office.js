// Office document generation for the deal record — a real Word IC memo and an
// Excel deal model, built from the LIVE deal and written into the deal's
// SharePoint data room (see m365/graph.js saveDealDocument). Pure builders:
// they take a deal and return a Buffer, so they are independently testable and
// hold no Graph/tenant state.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, VerticalAlign, TabStopType,
} from 'docx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

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

// ---- Shared palette (hex without #) -----------------------------------------
const INK = '1F3864';    // deep navy — titles & headings
const ACCENT = '2E74B5'; // accent blue — eyebrow & rules
const MUTE = '6B7280';   // muted grey — captions
const LINE = 'D9DEE7';   // hairline borders
const BAND = 'EEF2F7';   // light table banding
const NOFILL = { style: BorderStyle.NONE };

// ---- Word: Investment Committee memorandum ----------------------------------

function rule(color = LINE, size = 6) {
  return new Paragraph({ spacing: { before: 40, after: 140 }, border: { bottom: { color, style: BorderStyle.SINGLE, size, space: 1 } } });
}
function sectionHeading(text) {
  return new Paragraph({ spacing: { before: 280, after: 90 }, keepNext: true, children: [new TextRun({ text, bold: true, color: INK, size: 24 })] });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120, line: 288 }, children: [new TextRun({ text: String(text), size: 21, color: '2B2B2B', ...opts })] });
}
function bullets(items) {
  return items.filter(Boolean).map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60, line: 276 }, children: [new TextRun({ text: String(t), size: 21, color: '2B2B2B' })] }));
}
function cellP(text, opts = {}) { return new Paragraph({ children: [new TextRun({ text: text === 0 || text ? String(text) : '\u2014', size: 20, ...opts })] }); }
function cell(children, { w, shade } = {}) {
  return new TableCell({
    width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: Array.isArray(children) ? children : [children],
  });
}

// Clean two-column key/value block — hairline row separators, no vertical rules.
function kvTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      left: NOFILL, right: NOFILL, insideVertical: NOFILL,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EDF1F6' },
    },
    rows: rows.map(([k, v], i) => new TableRow({
      children: [
        cell(cellP(k, { bold: true, color: MUTE }), { w: 34, shade: i % 2 ? 'FFFFFF' : 'F8FAFC' }),
        cell(cellP(v, { color: '2B2B2B' }), { w: 66, shade: i % 2 ? 'FFFFFF' : 'F8FAFC' }),
      ],
    })),
  });
}

// Headed data table with banded rows (workstreams, key figures).
function dataTable(headers, rows, widths) {
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(cellP(h, { bold: true, color: 'FFFFFF' }), { w: widths?.[i], shade: INK })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => cell(cellP(c), { w: widths?.[i], shade: ri % 2 ? BAND : 'FFFFFF' })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      left: NOFILL, right: NOFILL, insideVertical: NOFILL,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EDF1F6' },
    },
    rows: [head, ...bodyRows],
  });
}

// Recommendation call-out — shaded panel with a left accent bar.
function callout(title, text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NOFILL, bottom: NOFILL, right: NOFILL, insideHorizontal: NOFILL, insideVertical: NOFILL, left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } },
    rows: [new TableRow({ children: [cell([
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: title, bold: true, color: INK, size: 20 })] }),
      new Paragraph({ children: [new TextRun({ text, size: 21, color: '2B2B2B' })] }),
    ], { shade: BAND })] })],
  });
}

function recommendationText(readiness) {
  const r = Number(readiness) || 0;
  if (r >= 60) return 'Advance to Investment Committee. Diligence is materially complete; finalise the confirmatory workstreams and circulate the binding proposal ahead of the committee date.';
  if (r >= 25) return 'Continue diligence. Close the open workstreams below and re-assess IC readiness before scheduling the committee.';
  return 'Early diligence. Prioritise the commercial and financial workstreams to establish the core thesis before committing further resource.';
}

export async function buildIcMemoDocx(deal) {
  const company = deal.company || deal.id || 'Deal';
  const subtitle = [deal.sector, deal.subSector, deal.hq || deal.region].filter(Boolean).join('  \u00b7  ');
  const readiness = Number(deal.readiness) || 0;

  const workstreams = Array.isArray(deal.workstreams) ? deal.workstreams : [];
  const wsRows = workstreams.map((w) => [
    w.name || w.title || w.lane || 'Workstream',
    w.owner || w.md || w.lead || '\u2014',
    Number.isFinite(Number(w.progress)) ? `${Number(w.progress)}%` : '\u2014',
    w.status || 'In progress',
  ]);

  const figures = Array.isArray(deal.keyFigures) ? deal.keyFigures : [];
  const figRows = figures.slice(0, 12).map((f) => [f.label || '\u2014', f.value === 0 || f.value ? String(f.value) : '\u2014', f.source || '\u2014']);

  const firstSentence = String(deal.thesis || '').split(/(?<=\.)\s/)[0];
  const exec = deal.thesis
    ? `${company} is under evaluation in the ${deal.sector || 'target'} sector. ${firstSentence} Diligence is ${pct(deal.diligenceProgress)} complete with IC readiness at ${pct(deal.readiness)}.`
    : `${company} is under evaluation in the ${deal.sector || 'target'} sector. Diligence is ${pct(deal.diligenceProgress)} complete with IC readiness at ${pct(deal.readiness)}; the investment thesis is being finalised from sourcing and diligence findings.`;

  const footer = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
      children: [
        new TextRun({ text: 'CONFIDENTIAL \u00b7 The Deal Room', color: MUTE, size: 16 }),
        new TextRun({ text: '\t', size: 16 }),
        new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], color: MUTE, size: 16 }),
      ],
    })],
  });
  const header = new Header({
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${company} \u2014 Investment Committee Memorandum`, color: MUTE, size: 15 })] })],
  });

  const doc = new Document({
    creator: 'The Deal Room', title: `IC Memo \u2014 ${company}`, subject: 'Investment Committee Memorandum', company: 'The Deal Room',
    styles: { default: { document: { run: { font: 'Calibri', size: 21, color: '2B2B2B' } } } },
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
      headers: { default: header },
      footers: { default: footer },
      children: [
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: 'INVESTMENT COMMITTEE MEMORANDUM', bold: true, color: ACCENT, size: 16, characterSpacing: 20 })] }),
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: company, bold: true, color: INK, size: 44 })] }),
        subtitle ? new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: subtitle, color: MUTE, size: 20 })] }) : new Paragraph({ text: '' }),
        new Paragraph({ children: [new TextRun({ text: `Prepared ${dateStr(new Date())}  \u00b7  Enterprise value ${money(deal)}  \u00b7  IC readiness ${pct(deal.readiness)}`, color: MUTE, italics: true, size: 18 })] }),
        rule(ACCENT, 10),

        sectionHeading('Executive summary'),
        body(exec),

        sectionHeading('Deal snapshot'),
        kvTable(summaryRows(deal)),

        sectionHeading('Investment thesis'),
        ...(String(deal.thesis || '').trim()
          ? String(deal.thesis).split(/\n{2,}/).map((p) => body(p.trim()))
          : [body('Thesis pending \u2014 to be populated from the sourcing framework and confirmatory diligence findings.')]),

        ...(figRows.length ? [sectionHeading('Key figures'), dataTable(['Metric', 'Value', 'Source'], figRows, [46, 24, 30])] : []),

        sectionHeading('Diligence workstreams'),
        wsRows.length ? dataTable(['Workstream', 'Owner', 'Progress', 'Status'], wsRows, [40, 26, 14, 20]) : body('Workstreams not yet provisioned for this deal.'),

        sectionHeading('Readiness & timeline'),
        ...bullets([
          `IC readiness ${pct(deal.readiness)}; diligence progress ${pct(deal.diligenceProgress)}.`,
          `Compliance ${dash(deal.complianceCleared)} of ${dash(deal.complianceTotal)} items cleared.`,
          `IC memo ${dash(deal.memoProgress)} of ${dash(deal.memoTotal)} sections${deal.memoApproved ? ' \u00b7 approved' : ''}.`,
          `Target IC date ${dateStr(deal.targetICDate || deal.projectedICDate)}${Number.isFinite(Number(deal.daysToIC)) ? ` (in ${deal.daysToIC} days)` : ''}.`,
        ]),

        sectionHeading('Recommendation'),
        callout(readiness >= 60 ? 'Advance to Investment Committee' : readiness >= 25 ? 'Continue diligence' : 'Early diligence', recommendationText(readiness)),

        new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: 'Generated from the live deal record in The Deal Room. Figures reflect the state of diligence at generation time and are provided for committee discussion on a confidential basis.', italics: true, color: MUTE, size: 16 })] }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

// ---- Excel: deal model / data export ---------------------------------------

const XNAVY = 'FF1F3864', XACC = 'FF2E74B5', XMUT = 'FF6B7280', XBAND = 'FFEEF2F7', XLINE = 'FFD9DEE7';
const XTHIN = { style: 'thin', color: { argb: XLINE } };
const XBOX = { top: XTHIN, left: XTHIN, bottom: XTHIN, right: XTHIN };

// Shared table styling — navy header band, banded rows, hairline borders, frozen header + autofilter.
function styleTable(sheet) {
  const cols = sheet.columnCount;
  const header = sheet.getRow(1);
  header.height = 20;
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XNAVY } };
    c.alignment = { vertical: 'middle' };
    c.border = XBOX;
  });
  for (let r = 2; r <= sheet.rowCount; r++) {
    sheet.getRow(r).eachCell((c) => {
      c.font = { size: 10, color: { argb: 'FF2B2B2B' } };
      c.border = XBOX;
      if (r % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XBAND } };
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 1 }];
}

function composeModelWorkbook(deal) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Deal Room';
  wb.company = 'The Deal Room';
  wb.created = new Date();
  wb.title = `Deal Model \u2014 ${deal.company || deal.id}`;

  // ---- Summary ---------------------------------------------------------------
  const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  s.getColumn(1).width = 3; s.getColumn(2).width = 30; s.getColumn(3).width = 48; s.getColumn(4).width = 3;

  s.getCell('B2').value = deal.company || deal.id || 'Deal';
  s.getCell('B2').font = { name: 'Calibri', size: 20, bold: true, color: { argb: XNAVY } };
  s.getCell('B3').value = [deal.sector, deal.subSector, deal.hq || deal.region].filter(Boolean).join('  \u00b7  ');
  s.getCell('B3').font = { size: 11, color: { argb: XMUT } };
  s.getCell('B4').value = `Prepared ${dateStr(new Date())}  \u00b7  The Deal Room  \u00b7  CONFIDENTIAL`;
  s.getCell('B4').font = { size: 9, italic: true, color: { argb: XMUT } };

  s.getCell('B6').value = 'DEAL SUMMARY';
  s.getCell('B6').font = { size: 9, bold: true, color: { argb: XACC } };
  let row = 7;
  for (const [k, v] of summaryRows(deal)) {
    const kc = s.getCell(row, 2), vc = s.getCell(row, 3);
    kc.value = k; kc.font = { bold: true, color: { argb: XMUT }, size: 10 };
    vc.value = v === 0 || v ? v : '\u2014'; vc.font = { size: 10, color: { argb: 'FF2B2B2B' } };
    kc.border = { bottom: XTHIN }; vc.border = { bottom: XTHIN };
    if ((row - 7) % 2 === 1) { const f = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; kc.fill = f; vc.fill = f; }
    row++;
  }

  row += 1;
  s.getCell(row, 2).value = 'MODELLING INPUTS';
  s.getCell(row, 2).font = { size: 9, bold: true, color: { argb: XACC } };
  row++;
  const nums = [
    ['Enterprise value (M)', Number(deal.dealSize) || null, '#,##0'],
    ['IC readiness (%)', Number(deal.readiness) || 0, '0"%"'],
    ['Diligence progress (%)', Number(deal.diligenceProgress) || 0, '0"%"'],
    ['Days to IC', Number(deal.daysToIC) || null, '#,##0'],
  ];
  for (const [k, v, fmt] of nums) {
    const kc = s.getCell(row, 2), vc = s.getCell(row, 3);
    kc.value = k; kc.font = { color: { argb: XMUT }, size: 10 };
    vc.value = v; vc.numFmt = fmt; vc.font = { size: 10 }; vc.alignment = { horizontal: 'left' };
    row++;
  }
  s.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }];

  // ---- Key figures -----------------------------------------------------------
  const figures = Array.isArray(deal.keyFigures) ? deal.keyFigures : [];
  if (figures.length) {
    const kf = wb.addWorksheet('Key Figures', { views: [{ showGridLines: false }] });
    kf.columns = [
      { header: 'Metric', key: 'label', width: 40 },
      { header: 'Value', key: 'value', width: 24 },
      { header: 'Source', key: 'source', width: 26 },
      { header: 'Confidence', key: 'confidence', width: 16 },
    ];
    figures.forEach((f) => kf.addRow({ label: f.label || '', value: f.value ?? '', source: f.source || '', confidence: f.confidence || '' }));
    styleTable(kf);
  }

  // ---- Workstreams -----------------------------------------------------------
  const w = wb.addWorksheet('Workstreams', { views: [{ showGridLines: false }] });
  w.columns = [
    { header: 'Workstream', key: 'name', width: 34 },
    { header: 'Owner', key: 'owner', width: 22 },
    { header: 'Progress', key: 'progress', width: 12 },
    { header: 'Status', key: 'status', width: 20 },
  ];
  const workstreams = Array.isArray(deal.workstreams) ? deal.workstreams : [];
  if (workstreams.length) {
    for (const ws of workstreams) {
      w.addRow({
        name: ws.name || ws.title || ws.lane || 'Workstream',
        owner: ws.owner || ws.md || ws.lead || '',
        progress: Number.isFinite(Number(ws.progress)) ? Number(ws.progress) / 100 : '',
        status: ws.status || 'In progress',
      });
    }
    w.getColumn('progress').numFmt = '0%';
  } else {
    w.addRow({ name: 'No workstreams provisioned yet', owner: '', progress: '', status: '' });
  }
  styleTable(w);
  return wb;
}

export async function buildDealModelXlsx(deal) {
  const buf = await composeModelWorkbook(deal).xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

// The rows behind the model — reused by the HTML/CSV live sources.
function modelRows(deal) {
  const rows = [...summaryRows(deal)];
  const ws = Array.isArray(deal.workstreams) ? deal.workstreams : [];
  ws.forEach((w) => rows.push([
    `Workstream \u00b7 ${w.name || w.title || w.lane || 'Workstream'}`,
    `${Number.isFinite(Number(w.progress)) ? Number(w.progress) + '% \u00b7 ' : ''}${w.status || 'In progress'}${w.owner || w.md || w.lead ? ' \u00b7 ' + (w.owner || w.md || w.lead) : ''}`,
  ]));
  return rows;
}
const esc = (s) => String(s === 0 || s ? s : '\u2014').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Live HTML source for an Excel web query (Data ▸ Refresh All re-pulls this table).
export function buildModelHtml(deal) {
  const rows = modelRows(deal).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deal Model \u2014 ${esc(deal.company || deal.id)}</title></head><body><table border="1"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

// Live CSV source (Excel or any tool can pull this).
export function buildModelCsv(deal) {
  const q = (s) => `"${String(s === 0 || s ? s : '').replace(/"/g, '""')}"`;
  const lines = [['Field', 'Value'], ...modelRows(deal)].map((r) => r.map(q).join(','));
  return lines.join('\r\n');
}

// A refreshable Excel model — the polished workbook plus a "Live Data" sheet wired to
// a Microsoft web query pointing at buildModelHtml (Data ▸ Refresh All updates it).
export async function buildLiveModelXlsx(deal, liveUrl) {
  const wb = composeModelWorkbook(deal);
  const live = wb.addWorksheet('Live Data', { views: [{ showGridLines: false }] });
  live.getColumn(1).width = 46; live.getColumn(2).width = 40;
  live.getCell('A1').value = 'Live data — use Data ▸ Refresh All in Excel to pull the latest from The Deal Room.';
  live.getCell('A1').font = { italic: true, color: { argb: 'FF6B7280' }, size: 10 };
  const buf = await wb.xlsx.writeBuffer();
  return injectWebQuery(Buffer.isBuffer(buf) ? buf : Buffer.from(buf), 'Live Data', liveUrl);
}

// Inject a Microsoft "web query" (type=4) bound to a worksheet so Excel refreshes it
// from `url`. Post-processes the exceljs zip: adds connections + queryTable parts and
// wires them via the worksheet + workbook relationships and content types.
async function injectWebQuery(xlsxBuffer, sheetName, url) {
  const zip = await JSZip.loadAsync(xlsxBuffer);
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const nameRe = new RegExp(`<sheet[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*r:id="([^"]+)"[^>]*/>`);
  const m = workbookXml.match(nameRe);
  if (!m) throw new Error('live sheet not found');
  const relRe = new RegExp(`<Relationship[^>]*Id="${m[1]}"[^>]*Target="([^"]+)"`);
  const rm = wbRels.match(relRe);
  if (!rm) throw new Error('sheet rel not found');
  const sheetFile = ('xl/' + rm[1].replace(/^\//, '')).split('/').pop(); // e.g. sheet4.xml
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`;

  zip.file('xl/connections.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><connection id="1" name="DealRoomLive" type="4" refreshedVersion="6" background="1" saveData="1"><webPr sourceData="1" parsePre="1" consecutive="1" xl2000="1" url="${url.replace(/&/g, '&amp;')}" htmlTables="1"/></connection></connections>`);

  zip.file('xl/queryTables/queryTable1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<queryTable xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="DealRoomLive" connectionId="1" autoFormatId="16" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1"/>`);

  let sheetRels = zip.file(sheetRelsPath)
    ? await zip.file(sheetRelsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  sheetRels = sheetRels.replace('</Relationships>',
    '<Relationship Id="rIdQt1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/queryTable" Target="../queryTables/queryTable1.xml"/></Relationships>');
  zip.file(sheetRelsPath, sheetRels);

  zip.file('xl/_rels/workbook.xml.rels', wbRels.replace('</Relationships>',
    '<Relationship Id="rIdConn1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections" Target="connections.xml"/></Relationships>'));

  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace('</Types>',
    '<Override PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"/>' +
    '<Override PartName="/xl/queryTables/queryTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml"/></Types>');
  zip.file('[Content_Types].xml', ct);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
