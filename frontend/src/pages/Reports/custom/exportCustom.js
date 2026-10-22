import { downloadWorkbook, fileSlug } from '../../../services/excelExport';
import { periodLabel } from '../periods';
import { DIMENSIONS, METRICS } from './customReport';

export const reportTitle = (config) => {
  const dim = DIMENSIONS[config.rowDim]?.label || '';
  const first = METRICS[config.metrics[0]]?.label || '';
  const split = config.splitDim && config.splitDim !== config.rowDim ? ` split by ${DIMENSIONS[config.splitDim].label.toLowerCase()}` : '';
  return `${first} by ${dim.toLowerCase()}${split}`;
};

// Writes exactly the on-screen table, plus the raw rows it was built from.
export function exportCustomReport({ pivot, config, name, scopeLabel, from, to, rawRows }) {
  const dim = DIMENSIONS[config.rowDim];
  const first = METRICS[config.metrics[0]];
  const split = pivot.splits.length > 0;
  const columns = [{ key: 'label', label: dim.label, width: 30 }, ...(split
    ? [...pivot.splits.map((s, i) => ({ key: `s${i}`, label: s, type: first.type, width: Math.max(12, s.length + 4) })), { key: 'total', label: `Total ${first.label.toLowerCase()}`, type: first.type, width: 16 }]
    : config.metrics.map((id) => ({ key: id, label: METRICS[id].label, type: METRICS[id].type, width: Math.max(12, METRICS[id].label.length + 4) })))];
  const rows = pivot.groups.map((g) => (split
    ? { label: g.label, ...Object.fromEntries(pivot.splits.map((s, i) => [`s${i}`, g.split[s] || null])), total: g.values[config.metrics[0]] }
    : { label: g.label, ...g.values }));
  const totals = split
    ? { ...Object.fromEntries(pivot.splits.map((s, i) => [`s${i}`, pivot.splitTotals[s]])), total: pivot.totals[config.metrics[0]] }
    : pivot.totals;

  const rawSheet = config.source === 'time'
    ? { name: 'Time entries', columns: [
        { key: 'work_date', label: 'Date', type: 'date', width: 14 }, { key: 'client_name', label: 'Client', width: 26 },
        { key: 'user_name', label: 'Person', width: 22 }, { key: 'job_type', label: 'Job type', width: 18 }, { key: 'work_type', label: 'Work type', width: 18 },
        { key: 'hours', label: 'Hours', type: 'decimal', width: 10 }, { key: 'note', label: 'Note', width: 40, wrap: true }], rows: rawRows, totals: { hours: 'sum' } }
    : { name: 'Tasks', columns: [
        { key: 'id', label: 'ID', type: 'number', width: 9 }, { key: 'title', label: 'Task', width: 44, wrap: true }, { key: 'client_name', label: 'Client', width: 22 },
        { key: 'assigned_to_name', label: 'Assignee', width: 22 }, { key: 'status', label: 'Status', width: 14 }, { key: 'priority', label: 'Priority', width: 11 },
        { key: 'created_at', label: 'Created', type: 'datetime', width: 18 }, { key: 'completed_at', label: 'Completed', type: 'datetime', width: 18 }], rows: rawRows };

  const title = name || reportTitle(config);
  return downloadWorkbook({
    fileName: `${fileSlug(title)}-${from || 'all'}-to-${to || 'today'}`,
    title,
    lines: [`${scopeLabel} · Period: ${periodLabel(from, to)}`, `Generated: ${new Date().toLocaleString('en-GB')}`],
    sheets: [{ name: 'Report', columns, rows, totals }, rawSheet],
  });
}
