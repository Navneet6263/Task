import React, { useState } from 'react';
import SnoozeMenu from './SnoozeMenu';
import { Button, Chip, Select } from '../../ui';
import { PRIORITY_TONE, STATUS_LABEL } from './tones';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const SUMMARY_KEY = { TODO: 'todo', IN_PROGRESS: 'in_progress', PENDING: 'pending', DONE: 'done' };

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function BoardCard({ task, status, dragging, userId, onOpen, onDragStart, onDragEnd, onMove, handleSnooze, handleApproveDelete, handleRejectDelete }) {
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      className={`relative mb-2 flex cursor-grab flex-col gap-2 rounded-md border border-line bg-surface p-2.5 hover:border-muted ${dragging ? 'opacity-40' : ''}`}>
      {task.unread_comments > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold text-white">{task.unread_comments}</span>
      )}
      <h5 className="text-sm font-semibold">{task.title}</h5>
      <p className="text-xs text-muted">{task.assigned_to_name || 'Unassigned'}</p>
      <div className="flex items-center justify-between gap-2">
        <Chip tone={PRIORITY_TONE[task.priority] || 'warn'}>{task.priority || 'MEDIUM'}</Chip>
        <span className="text-[11px] text-muted">{dateLabel(task.due_date)}</span>
      </div>
      <Select aria-label={`Status of ${task.title}`} className="py-1 text-xs" value={status} onClick={(event) => event.stopPropagation()} onChange={(event) => onMove(event.target.value)}>
        {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
      </Select>
      <div className="flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
        <span className="text-[10px] font-medium text-muted">Drag to move</span>
        <SnoozeMenu task={task} onSnooze={handleSnooze} />
      </div>
      {task.delete_requested_by && (task.assigned_by === userId ? (
        <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="danger" className="flex-1 !border-danger/40" onClick={() => handleApproveDelete(task.id)}>Approve Delete</Button>
          <Button size="sm" className="flex-1" onClick={() => handleRejectDelete(task.id)}>Reject</Button>
        </div>
      ) : <p className="rounded bg-danger-soft py-1 text-center text-[10px] font-semibold text-danger">Delete Request Pending</p>)}
    </div>
  );
}

const TaskBoardView = ({ summary, loadMore, boardBusy, filtered, setSelectedTask, setSheetTab, handleStatusChange, ...actions }) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [pendingStatuses, setPendingStatuses] = useState({});
  const [draggingId, setDraggingId] = useState(null);

  const effectiveStatus = (task) => pendingStatuses[task.id] || task.status;
  const moveTask = async (task, status) => {
    if (!task || effectiveStatus(task) === status) return;
    setPendingStatuses((current) => ({ ...current, [task.id]: status }));
    try { await handleStatusChange(task, status); }
    finally { setPendingStatuses((current) => { const next = { ...current }; delete next[task.id]; return next; }); }
  };
  const drop = (event, status) => {
    event.preventDefault();
    const task = filtered.find((item) => String(item.id) === String(draggingId));
    setDraggingId(null);
    moveTask(task, status);
  };

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
      {STATUS_OPTIONS.map((status) => {
        const columnItems = filtered.filter((task) => effectiveStatus(task) === status);
        const total = Number(summary?.[SUMMARY_KEY[status]] || 0);
        return (
          <article key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, status)}
            className={`min-h-[200px] rounded-lg border bg-subtle p-2.5 ${draggingId ? 'border-accent/60' : 'border-line'}`}>
            <header className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">{STATUS_LABEL[status]}</h4>
              <span className="font-mono text-xs text-muted">{summary ? total : columnItems.length}</span>
            </header>
            {summary && <p className="mb-2 text-xs text-muted">{columnItems.length} loaded</p>}
            {columnItems.map((task) => (
              <BoardCard key={task.id} task={task} status={effectiveStatus(task)} userId={user.id} dragging={String(draggingId) === String(task.id)} {...actions}
                onOpen={() => { setSelectedTask(task); setSheetTab('details'); }}
                onDragStart={(event) => { setDraggingId(task.id); event.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setDraggingId(null)} onMove={(value) => moveTask(task, value)} />
            ))}
            {loadMore && columnItems.length < total && (
              <Button size="sm" className="w-full" disabled={Boolean(boardBusy)} onClick={() => loadMore(status)}>{boardBusy === status ? 'Loading...' : 'Load more'}</Button>
            )}
            {columnItems.length === 0 && <p className="py-5 text-center text-xs text-muted">No tasks</p>}
          </article>
        );
      })}
    </div>
  );
};

export default TaskBoardView;
