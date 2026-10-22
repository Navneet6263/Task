import React from 'react';
import { Chip, Select } from '../../ui';
import TaskActions from './TaskActions';
import { DUE_TEXT, PRIORITY_TONE, STATUSES, dueInfo } from './taskMeta';

// Board card: drag to another column to change status.
const TaskCard = ({ task, handleStatusChange, handlePriorityLock, openReassign, onCardClick }) => {
  const due = dueInfo(task);
  return (
    <div draggable role="button" tabIndex={0}
      onDragStart={(event) => { event.dataTransfer.setData('taskId', task.id); event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('opacity-40'); }}
      onDragEnd={(event) => event.currentTarget.classList.remove('opacity-40')}
      onClick={() => onCardClick(task)} onKeyDown={(event) => { if (event.key === 'Enter') onCardClick(task); }}
      className="group relative flex cursor-grab flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-muted hover:shadow-md active:cursor-grabbing">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{task.team_name}</span>
        <Chip tone={PRIORITY_TONE[task.priority] || 'warn'}>{task.priority}</Chip>
      </div>
      <h4 className="text-sm font-semibold leading-snug">{task.title}</h4>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={`font-medium ${DUE_TEXT[due.tone]}`}>{due.text}</span>
        <span className="text-muted">by {task.assigned_by_name || 'System'}</span>
        {task.blocked_reason && <span title={task.blocked_reason}><Chip tone="warn">Blocked</Chip></span>}
        {task.unread_comments > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white" title="Unread comments">{task.unread_comments}</span>}
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-2">
        <Select aria-label={`Status of ${task.title}`} className="flex-1 py-1 text-xs" value={task.status}
          onClick={(event) => event.stopPropagation()} onChange={(event) => handleStatusChange(task, event.target.value)}>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <TaskActions task={task} onLock={handlePriorityLock} onReassign={openReassign} className="opacity-60 transition-opacity group-hover:opacity-100" />
      </div>
      {task.priority_locked && <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-danger" title="Priority locked" />}
    </div>
  );
};

export default TaskCard;
