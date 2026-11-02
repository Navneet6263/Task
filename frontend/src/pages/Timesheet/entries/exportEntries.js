import { downloadWorkbook } from '../../../services/excelExport';
import { fmtDate } from '../format';

const statusText = (entry) => {
  if (entry.status === 'DRAFT') return 'Draft';
  if (entry.lock?.locked) return 'Locked';
  return 'Editable';
};

// The entries on screen (same filters) as a clean Excel sheet.
export function exportEntries({ rows, config, range, scope }) {
  const period = range.from || range.to ? `${fmtDate(range.from)} to ${fmtDate(range.to)}` : 'All time';
  return downloadWorkbook({
    fileName: `timesheet-entries-${config.today}`,
    title: 'Timesheet entries',
    lines: [`Period: ${period}`, ...(scope ? [`Showing: ${scope}`] : [])],
    sheets: [{
      name: 'Entries',
      rows,
      totals: { total_hours: 'sum' },
      columns: [
        { key: 'date_worked', label: 'Date worked', type: 'date' },
        { key: 'agent_name', label: 'Done by' },
        { key: 'agent_firm_name', label: 'Agent' },
        { key: 'client_name', label: 'Client' },
        { key: 'task_title', label: 'Task' },
        { key: 'job_type', label: 'Job type' },
        { key: 'work_type', label: 'Work type' },
        { key: 'period_type', label: 'Period type' },
        { key: 'period_ended', label: 'Period ended', type: 'date' },
        { key: 'description', label: 'Description', wrap: true },
        { key: 'total_hours', label: 'Hours', type: 'decimal' },
        { key: 'status', label: 'Status', value: statusText, tone: (entry) => ({ Draft: 'neutral', Locked: 'warn', Editable: 'ok' }[statusText(entry)]) },
      ],
    }],
  });
}
