/**
 * @jest-environment node
 */
import ExcelJS from 'exceljs';
import { excelDate, fillWorkbook } from './excelExport';
import { groupRows, TASK_COLUMNS } from '../pages/Reports/reportColumns';

const columns = TASK_COLUMNS.filter((c) => ['id', 'title', 'status', 'priority', 'due_date', 'created_at'].includes(c.key));
const rows = [
  { id: 1, title: 'Fix login', status: 'DONE', priority: 'HIGH', due_date: '2026-10-20', created_at: '2026-10-01T09:30:00' },
  { id: 2, title: 'Write docs', status: 'TODO', priority: 'LOW', due_date: null, created_at: '2026-10-02T14:00:00' },
];

async function roundTrip(spec) {
  const buffer = await fillWorkbook(new ExcelJS.Workbook(), spec).xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded;
}

test('dates keep their wall-clock value in Excel', () => {
  expect(excelDate('2026-10-20').toISOString()).toBe('2026-10-20T00:00:00.000Z');
  expect(excelDate('2026-10-01T09:30:00').toISOString()).toBe('2026-10-01T09:30:00.000Z');
  expect(excelDate('')).toBeNull();
});

test('a report sheet has a title, styled frozen header, typed cells, coloured status and an autofilter', async () => {
  const book = await roundTrip({ title: 'Team report', lines: ['Period: Oct'], sheets: [{ name: 'Tasks', columns, rows }] });
  const ws = book.getWorksheet('Tasks');
  expect(ws.getCell('A1').value).toBe('Team report');
  expect(ws.getCell('A2').value).toBe('Period: Oct');
  const header = ws.getRow(4);
  expect(header.getCell(2).value).toBe('Task');
  expect(header.getCell(1).fill.fgColor.argb).toBe('17775A');
  expect(header.getCell(1).font.bold).toBe(true);
  expect(ws.getCell('A5').value).toBe(1);
  expect(ws.getCell('C5').value).toBe('Done');
  expect(ws.getCell('C5').fill.fgColor.argb).toBe('DCEFE6');
  expect(ws.getCell('D5').font.color.argb).toBe('B3261E');
  expect(ws.getCell('E5').value).toBeInstanceOf(Date);
  expect(ws.getCell('E5').numFmt).toBe('dd-mmm-yyyy');
  expect(ws.getCell('E6').value).toBeNull();
  expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
  expect(ws.autoFilter).toBeTruthy();
});

test('group header rows and a SUM totals row are written', async () => {
  const numbers = [{ key: 'name', label: 'Member' }, { key: 'total', label: 'Total', type: 'number' }];
  const book = await roundTrip({
    title: 'T', sheets: [
      { name: 'Grouped', columns, rows: groupRows(rows, 'status') },
      { name: 'Members', columns: numbers, rows: [{ name: 'A', total: 3 }, { name: 'B', total: 4 }], totals: { total: 'sum' } },
    ],
  });
  expect(book.getWorksheet('Grouped').getCell('A3').value).toBe('ID');
  expect(book.getWorksheet('Grouped').getCell('A4').value).toBe('Status: Done (1)');
  const members = book.getWorksheet('Members');
  expect(members.getCell('A6').value).toBe('Total');
  expect(members.getCell('B6').value.formula).toBe('SUM(B4:B5)');
});

test('columns size to their content, long text wraps instead of overlapping, and pages print one wide', async () => {
  const long = 'Prepared October payroll for all 48 staff including arrears, bonuses and statutory deductions';
  const book = await roundTrip({ title: 'Hours', sheets: [{ name: 'Entries', columns: [
    { key: 'person', label: 'Person' }, { key: 'note', label: 'Note' }, { key: 'hours', label: 'Hours', type: 'decimal' },
  ], rows: [{ person: 'Asha Rao', note: long, hours: 2.5 }, { person: 'Rahul Verma Kumar', note: 'Short', hours: 1 }] }] });
  const ws = book.getWorksheet('Entries');
  expect(ws.getColumn(1).width).toBeGreaterThanOrEqual('Rahul Verma Kumar'.length);
  expect(ws.getColumn(2).width).toBeLessThanOrEqual(60);
  const noteCell = ws.getRow(4).getCell(2);
  expect(noteCell.value).toBe(long);
  expect(noteCell.alignment.wrapText).toBe(true);
  expect(ws.getRow(4).getCell(1).alignment.wrapText).toBeFalsy();
  expect(ws.pageSetup.fitToWidth).toBe(1);
});
