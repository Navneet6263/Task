import React, { useState } from 'react';
import { Chip } from '../../ui';
import TaskActions from './TaskActions';
import { BUCKETS, DUE_TEXT, PRIORITY_TONE, bucketOf, dueInfo } from './taskMeta';

// Tasks grouped by when they are due; the circle completes a task in one click.
export default function AgendaView({ tasks, onOpen, handleStatusChange, handlePriorityLock, openReassign }) {
  const [collapsed, setCollapsed] = useState({ done: true });
  const groups = BUCKETS.map(([id, label, tone]) => ({ id, label, tone, items: tasks.filter((task) => bucketOf(task) === id) })).filter((g) => g.items.length);

  if (!groups.length) return <p className="rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center text-sm text-muted">No tasks match these filters. Nice and quiet.</p>;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-lg border border-line bg-surface">
          <button type="button" aria-expanded={!collapsed[group.id]} onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
            className="flex w-full items-center justify-between gap-2 border-b border-line bg-subtle/60 px-4 py-2 text-left">
            <span className={`text-sm font-semibold ${group.tone}`}>{group.label}</span>
            <span className="flex items-center gap-2 text-xs text-muted"><span className="font-mono">{group.items.length}</span><span className={`transition-transform ${collapsed[group.id] ? '' : 'rotate-90'}`}>›</span></span>
          </button>
          {!collapsed[group.id] && (
            <ul>
              {group.items.map((task) => {
                const done = task.status === 'DONE';
                const due = dueInfo(task);
                return (
                  <li key={task.id} className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-subtle">
                    <button type="button" aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`} title={done ? 'Mark as to do' : 'Mark as done'}
                      onClick={() => handleStatusChange(task, done ? 'TODO' : 'DONE')}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold transition ${done ? 'border-accent bg-accent text-accent-fg' : 'border-line text-transparent hover:border-accent hover:text-accent'}`}>✓</button>
                    <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-sm font-semibold ${done ? 'text-muted line-through' : ''}`}>{task.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{task.team_name}</span>
                        <span className={DUE_TEXT[due.tone]}>{due.text}</span>
                        {task.status === 'IN_PROGRESS' && <span className="text-info">In progress</span>}
                        {task.status === 'PENDING' && <span className="text-warn">Pending</span>}
                      </span>
                    </button>
                    <Chip tone={PRIORITY_TONE[task.priority] || 'warn'}>{task.priority}</Chip>
                    <TaskActions task={task} onLock={handlePriorityLock} onReassign={openReassign} className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
