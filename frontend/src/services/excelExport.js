// Styled .xlsx export. ExcelJS (~1 MB) is loaded only when someone downloads a file.
const BRAND = '17775A';
const LINE = 'D6DFDA';
const ZEBRA = 'F5F8F6';
export const TONES = {
  ok: { fill: 'DCEFE6', font: '17775A' },
  warn: { fill: 'FBEFD9', font: '8F5000' },
  danger: { fill: 'FAE6E4', font: 'B3261E' },
  info: { fill: 'E3EBF8', font: '2155A3' },
  neutral: { fill: 'EAF0ED', font: '56665E' },
};
const FORMATS = { date: 'dd-mmm-yyyy', datetime: 'dd-mmm-yyyy hh:mm', number: '#,##0', decimal: '#,##0.00', percent: '0%' };

// 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm[:ss]' → Date that Excel shows with the same wall-clock value.
export function excelDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : null;
}

const thin = { style: 'thin', color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const columnLetter = (n) => { let s = ''; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

function cellValue(column, row) {
  const raw = column.value ? column.value(row) : row[column.key];
  if (raw === null || raw === undefined || raw === '') return null;
  if (column.type === 'date' || column.type === 'datetime') return excelDate(raw);
  if (['number', 'decimal', 'percent'].includes(column.type)) return Number(raw);
  return String(raw);
}

function addSheet(workbook, sheet, meta) {
  const ws = workbook.addWorksheet(sheet.name.slice(0, 31), { views: [{ showGridLines: false }] });
  const cols = sheet.columns;
  const last = columnLetter(cols.length);
  ws.columns = cols.map((column) => ({ width: column.width || Math.min(48, Math.max(10, column.label.length + 4)) }));

  ws.mergeCells(`A1:${last}1`);
  Object.assign(ws.getCell('A1'), { value: sheet.title || meta.title, font: { bold: true, size: 15, color: { argb: BRAND } } });
  ws.getRow(1).height = 24;
  (meta.lines || []).forEach((line, index) => {
    const r = index + 2;
    ws.mergeCells(`A${r}:${last}${r}`);
    Object.assign(ws.getCell(`A${r}`), { value: line, font: { size: 10, color: { argb: '56665E' } } });
  });

  const headerIndex = (meta.lines || []).length + 3;
  const header = ws.getRow(headerIndex);
  cols.forEach((column, i) => {
    const cell = header.getCell(i + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = fill(BRAND);
    cell.alignment = { vertical: 'middle', horizontal: column.type && column.type !== 'text' ? 'right' : 'left', wrapText: true };
    cell.border = box;
  });
  header.height = 22;

  sheet.rows.forEach((row, index) => {
    const excelRow = ws.getRow(headerIndex + 1 + index);
    const banded = row.__group ? 'E3EBE6' : index % 2 ? ZEBRA : null;
    cols.forEach((column, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = row.__group ? (i === 0 ? row.__group : null) : cellValue(column, row);
      cell.border = box;
      cell.alignment = { vertical: 'top', wrapText: column.wrap === true, horizontal: column.type && column.type !== 'text' ? 'right' : 'left' };
      if (FORMATS[column.type]) cell.numFmt = FORMATS[column.type];
      const tone = !row.__group && column.tone ? TONES[column.tone(row)] : null;
      if (tone) { cell.fill = fill(tone.fill); cell.font = { bold: true, color: { argb: tone.font } }; }
      else if (banded) cell.fill = fill(banded);
      if (row.__group) cell.font = { bold: true, color: { argb: '16201B' } };
    });
  });

  let lastRow = headerIndex + sheet.rows.length;
  if (sheet.totals) {
    lastRow += 1;
    const totalRow = ws.getRow(lastRow);
    cols.forEach((column, i) => {
      const cell = totalRow.getCell(i + 1);
      const spec = sheet.totals[column.key];
      if (i === 0) cell.value = 'Total';
      else if (spec === 'sum') cell.value = { formula: `SUM(${columnLetter(i + 1)}${headerIndex + 1}:${columnLetter(i + 1)}${lastRow - 1})` };
      else if (spec !== undefined) cell.value = spec;
      if (FORMATS[column.type]) cell.numFmt = FORMATS[column.type];
      cell.font = { bold: true };
      cell.fill = fill('DCEFE6');
      cell.border = { ...box, top: { style: 'double', color: { argb: BRAND } } };
      cell.alignment = { horizontal: column.type && column.type !== 'text' ? 'right' : 'left' };
    });
  }

  if (sheet.rows.length) ws.autoFilter = { from: { row: headerIndex, column: 1 }, to: { row: headerIndex + sheet.rows.length, column: cols.length } };
  ws.views = [{ state: 'frozen', ySplit: headerIndex, showGridLines: false }];
  if (sheet.note) {
    const r = lastRow + 2;
    ws.mergeCells(`A${r}:${last}${r}`);
    Object.assign(ws.getCell(`A${r}`), { value: sheet.note, font: { italic: true, size: 9, color: { argb: '56665E' } } });
  }
}

// sheets: [{ name, title?, columns: [{ key, label, width?, type?, value?(row), tone?(row), wrap? }], rows, totals?, note? }]
export function fillWorkbook(workbook, { title, lines = [], sheets }) {
  workbook.creator = 'GreenTask';
  workbook.created = new Date();
  sheets.forEach((sheet) => addSheet(workbook, sheet, { title, lines }));
  return workbook;
}

export async function downloadWorkbook({ fileName, ...spec }) {
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
  const workbook = fillWorkbook(new ExcelJS.Workbook(), spec);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const fileSlug = (text) => String(text || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
