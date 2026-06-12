import React from 'react';

const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

const statusProgress = (status) => {
  if (status === 'DONE') return 100;
  if (status === 'IN_PROGRESS') return 62;
  if (status === 'PENDING') return 30;
  return 14;
};

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const TaskTimelineView = ({ filtered, setSelectedTask, setSheetTab }) => (
  <div className="flex flex-col gap-2.5">
    {filtered.map((task) => (
      <article
        key={task.id}
        className="border border-gray-200 rounded-xl bg-[#f8faff] px-2.5 py-2.5 cursor-pointer"
        onClick={() => { setSelectedTask(task); setSheetTab('details'); }}
      >
        <div className="flex justify-between gap-2 mb-2">
          <strong className="text-sm flex items-center gap-1.5">
            {task.title}
            {task.unread_comments > 0 && (
              <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-[0_2px_6px_rgba(239,68,68,0.35)] shrink-0">
                {task.unread_comments}
              </span>
            )}
          </strong>
          <span className="text-[11px] text-gray-500">{dateLabel(task.due_date)}</span>
        </div>
        
        <div className="h-1.5 rounded-full bg-[#e7ecf7] overflow-hidden">
          <span className="block h-full bg-gradient-to-r from-[#2f5dff] to-[#60a5fa]" style={{ width: `${statusProgress(task.status)}%` }} />
        </div>
        
        <p className="mt-1.5 text-xs text-gray-500">
          {task.assigned_to_name || 'Unassigned'} | {STATUS_LABEL[task.status] || task.status}
        </p>
      </article>
    ))}
    
    {filtered.length === 0 && <div className="text-xs text-center text-gray-500 py-5">No tasks for timeline view.</div>}
  </div>
);

export default TaskTimelineView;
