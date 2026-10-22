import React from 'react';
import { Meter } from '../../ui';
import { statusLabel } from './tones';

const PROGRESS = { DONE: 100, IN_PROGRESS: 62, PENDING: 30 };
const TONE = { DONE: 'accent', IN_PROGRESS: 'info', PENDING: 'warn' };

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const TaskTimelineView = ({ filtered, setSelectedTask, setSheetTab }) => (
  <div className="flex flex-col gap-2">
    {filtered.map((task) => (
      <button key={task.id} type="button" onClick={() => { setSelectedTask(task); setSheetTab('details'); }}
        className="rounded-md border border-line bg-surface p-3 text-left hover:border-muted">
        <div className="mb-2 flex justify-between gap-2">
          <strong className="flex items-center gap-1.5 text-sm font-semibold">
            {task.title}
            {task.unread_comments > 0 && <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{task.unread_comments}</span>}
          </strong>
          <span className="shrink-0 text-[11px] text-muted">{dateLabel(task.due_date)}</span>
        </div>
        <Meter value={PROGRESS[task.status] || 14} tone={TONE[task.status] || 'info'} label={`${task.title} progress`} />
        <p className="mt-1.5 text-xs text-muted">{task.assigned_to_name || 'Unassigned'} · {statusLabel(task.status)}</p>
      </button>
    ))}
    {filtered.length === 0 && <p className="py-5 text-center text-xs text-muted">No tasks for timeline view.</p>}
  </div>
);

export default TaskTimelineView;
