export const csvCell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
export function exportCsv(name, columns, rows) {
  const content = [columns.map(item => csvCell(item.label)).join(','), ...rows.map(row => columns.map(item => csvCell(row[item.key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
