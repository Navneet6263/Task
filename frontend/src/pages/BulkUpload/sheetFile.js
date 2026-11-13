import { cellText } from '../Settings/employees/parseHrSheet';

const MAX_BYTES = 5 * 1024 * 1024;

export function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

const tidy = (rows) => rows.map((row) => (row || []).map(cellText));
const hasData = (rows) => rows.some((row) => row.some(Boolean));

// Reads an .xlsx (every tab) or .csv into plain text cells: { name, tabs: [{ name, rows }] }.
export async function readWorkbook(file) {
  const fileName = String(file?.name || '');
  const name = fileName.replace(/\.[^.]+$/, '');
  if (file.size > MAX_BYTES) throw new Error('This file is too big. Keep it under 5 MB.');
  if (/\.csv$/i.test(fileName)) {
    const rows = tidy(parseCsv((await file.text()).replace(/^﻿/, '')));
    if (!hasData(rows)) throw new Error('The file is empty.');
    return { name, tabs: [{ name, rows }] };
  }
  if (!/\.xlsx$/i.test(fileName)) throw new Error('Choose an Excel file (.xlsx) or a CSV file. If you have an old .xls file, open it in Excel and save it as .xlsx.');
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); } catch { throw new Error('This file could not be opened. Save it again as .xlsx and try once more.'); }
  const tabs = workbook.worksheets.filter((sheet) => sheet.state !== 'hidden' && sheet.state !== 'veryHidden').map((sheet) => {
    const matrix = [];
    sheet.eachRow({ includeEmpty: true }, (row, number) => { matrix[number - 1] = (row.values || []).slice(1); });
    return { name: sheet.name, rows: tidy(Array.from(matrix, (row) => row || [])) };
  }).filter((tab) => hasData(tab.rows));
  if (!tabs.length) throw new Error('The file is empty.');
  return { name, tabs };
}
