import React from 'react';
import { Button } from '../../ui';

const LockIcon = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d={open ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4'} />
  </svg>
);
const ReassignIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M17 3l4 4-4 4M21 7H8a4 4 0 00-4 4v2" /></svg>
);

// Lock priority and reassign; shared by every My Tasks view.
export default function TaskActions({ task, onLock, onReassign, className = '' }) {
  return (
    <span className={`flex gap-1 ${className}`} onClick={(event) => event.stopPropagation()}>
      <Button size="icon" variant="ghost" className={`h-8 w-8 ${task.priority_locked ? '!text-danger' : ''}`}
        title={task.priority_locked ? 'Unlock priority' : 'Lock priority'} aria-label={task.priority_locked ? 'Unlock priority' : 'Lock priority'} aria-pressed={Boolean(task.priority_locked)}
        onClick={() => onLock(task.id)}>
        <LockIcon open={!task.priority_locked} />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" title="Reassign task" aria-label="Reassign task" onClick={() => onReassign(task)}>
        <ReassignIcon />
      </Button>
    </span>
  );
}
