import { useEffect, useState } from 'react';
import { taskForm, timesheet } from '../../../services/api';

// Hours worked for custom reports, from the Timesheet and/or the time people log on tasks,
// merged into one shape. `include` is 'all', 'timesheet' or 'task'.
export default function useTimeRows({ active, from, to, timesheetOn, taskLogsOn, include }) {
  const [state, setState] = useState({ rows: [], loading: false, error: '' });
  useEffect(() => {
    if (!active || (!timesheetOn && !taskLogsOn)) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const jobs = [];
    if (timesheetOn && include !== 'task') {
      jobs.push(timesheet.report({ from, to }).then((r) => ({
        truncated: r.data.truncated,
        rows: r.data.rows.map((row) => ({ ...row, source: 'Timesheet', entry_id: `ts-${row.entry_id}` })),
      })));
    }
    if (taskLogsOn && include !== 'timesheet') {
      jobs.push(taskForm.timeReport({ from, to }).then((r) => ({
        truncated: r.data.truncated,
        rows: r.data.rows.map((row) => ({ ...row, source: 'Task log', task_id: row.entry_id, entry_id: `tk-${row.entry_id}` })),
      })));
    }
    Promise.allSettled(jobs).then((results) => {
      if (!live) return;
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failed = results.find((r) => r.status === 'rejected');
      const notes = [];
      if (ok.some((r) => r.truncated)) notes.push('Over 10,000 time entries in one source: only the first 10,000 are included. Pick a shorter period.');
      if (failed) notes.push(failed.reason?.response?.data?.error || (ok.length ? 'Some hours could not be loaded.' : 'Could not load hours worked.'));
      setState({ rows: ok.flatMap((r) => r.rows), loading: false, error: notes.join(' ') });
    });
    return () => { live = false; };
  }, [active, from, to, timesheetOn, taskLogsOn, include]);
  return state;
}
