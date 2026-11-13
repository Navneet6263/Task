import React from 'react';
import LabelChip from './LabelChip';
import { useTaskMeta, useTaskSummary } from './taskExtrasStore';

// The Jira-style line on a card: labels, subtask progress, parent and open blockers.
// The task number is shown inside the task only (client request), so cards stay clean.
export default function TaskBadges({ task, showKey = false, max = 3 }) {
  const { keyOf } = useTaskMeta();
  const s = useTaskSummary(task.id);
  const labels = s?.labels || [];
  const sub = s?.subtasks;
  if (!showKey && !labels.length && !sub && !s?.parent && !s?.blocked_by) return null;
  return (
    <span className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
      {showKey && <span className="rounded bg-subtle px-1.5 py-px font-mono text-[10px] font-semibold text-muted">{keyOf(task.id)}</span>}
      {s?.blocked_by > 0 && <span title={`Blocked by ${s.blocked_by} open task${s.blocked_by === 1 ? '' : 's'}`} className="rounded bg-danger-soft px-1.5 py-px text-[10px] font-bold text-danger">🔒 Blocked</span>}
      {s?.parent && <span title={`Subtask of ${s.parent.title}`} className="max-w-[160px] truncate rounded bg-info-soft px-1.5 py-px text-[10px] font-semibold text-info">↳ {s.parent.title || keyOf(s.parent.id)}</span>}
      {sub && (
        <span title={`${sub.done} of ${sub.total} subtasks done`} className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-px text-[10px] font-semibold text-muted">
          <span className="relative h-1 w-8 overflow-hidden rounded-full bg-line"><span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(sub.done / sub.total) * 100}%` }} /></span>
          {sub.done}/{sub.total}
        </span>
      )}
      {labels.slice(0, max).map((l) => <LabelChip key={l.id} label={l} small />)}
      {labels.length > max && <span className="text-[10px] font-semibold text-muted">+{labels.length - max}</span>}
    </span>
  );
}
