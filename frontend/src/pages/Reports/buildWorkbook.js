import { downloadWorkbook, fileSlug } from '../../services/excelExport';
import { MEMBER_COLUMNS } from './MembersTab';
import { TASK_COLUMNS, groupRows } from './reportColumns';
import { periodLabel } from './periods';

const metricColumns = [
  { key: 'metric', label: 'Metric', width: 34 },
  { key: 'value', label: 'Value', width: 16, type: 'number' },
  { key: 'note', label: 'Note', width: 60, wrap: true },
];

function summaryRows(stats) {
  return [
    { metric: 'Tasks created in period', value: stats.total },
    { metric: 'Completed', value: stats.done },
    { metric: 'Completion rate (%)', value: stats.completion },
    { metric: 'On-time completion (%)', value: stats.measured ? stats.onTime : null, note: `Based on ${stats.measured} completed tasks with a due date and completion time` },
    { metric: 'Overdue (open, past due date)', value: stats.overdue },
    { metric: 'Blocked (open, with a blocker)', value: stats.blocked },
    { metric: 'To do', value: stats.status.todo },
    { metric: 'In progress', value: stats.status.inProgress },
    { metric: 'Pending', value: stats.status.pending },
    { metric: 'High priority', value: stats.priority.HIGH },
    { metric: 'Medium priority', value: stats.priority.MEDIUM },
    { metric: 'Low priority', value: stats.priority.LOW },
  ];
}

// One Excel file with Summary, Team members, Weekly trend and Tasks sheets, in the
// columns, filters and grouping the user picked on screen.
export function exportReport({ team, from, to, stats, weeks, report, taskRows, columns, groupBy, filtersText }) {
  const period = periodLabel(from, to);
  const taskColumns = TASK_COLUMNS.filter((column) => columns.includes(column.key));
  return downloadWorkbook({
    fileName: `${fileSlug(team?.name)}-report-${from || 'all'}-to-${to || 'today'}`,
    title: `${team?.name || 'Team'} report`,
    lines: [`Period: ${period} (by task created date)`, `Generated: ${new Date().toLocaleString('en-GB')}`],
    sheets: [
      { name: 'Summary', title: `${team?.name || 'Team'} · Summary`, columns: metricColumns, rows: summaryRows(stats) },
      {
        name: 'Team members', title: `${team?.name || 'Team'} · Team members`, columns: MEMBER_COLUMNS, rows: report?.members || [],
        totals: { total: 'sum', active: 'sum', completed: 'sum', high_priority: 'sum', overdue: 'sum', blocked: 'sum', on_time: 'sum', measured_completions: 'sum' },
        note: 'Assigned tasks created in the period. Counts do not account for task complexity, leave or part-time schedules.',
      },
      {
        name: 'Weekly trend', title: 'Created vs completed per week',
        columns: [{ key: 'week', label: 'Week starting', type: 'date', width: 16 }, { key: 'created', label: 'Created', type: 'number', width: 12 }, { key: 'completed', label: 'Completed', type: 'number', width: 12 }],
        rows: weeks, totals: { created: 'sum', completed: 'sum' },
      },
      {
        name: 'Tasks', title: `Tasks (${taskRows.length})`, columns: taskColumns, rows: groupRows(taskRows, groupBy),
        note: filtersText ? `Filters: ${filtersText}` : 'All tasks created in the period.',
      },
    ],
  });
}
