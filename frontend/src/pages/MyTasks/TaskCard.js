import React from 'react';

const dateLabel = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  
  const today = new Date();
  const isOverdue = date < today && date.toDateString() !== today.toDateString();
  const isToday = date.toDateString() === today.toDateString();
  
  let colorClass = 'text-slate-500 bg-slate-100';
  if (isOverdue) colorClass = 'text-rose-600 bg-rose-50 border-rose-200';
  else if (isToday) colorClass = 'text-amber-600 bg-amber-50 border-amber-200';
  
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
      {isOverdue ? 'Overdue: ' : isToday ? 'Due Today: ' : ''}
      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </span>
  );
};

const priorityInfo = (val) => {
  if (val === 'HIGH') return { 
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, 
    color: 'text-rose-600 bg-rose-50 border-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.3)]' 
  };
  if (val === 'MEDIUM') return { 
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, 
    color: 'text-amber-600 bg-amber-50 border-amber-200' 
  };
  return { 
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, 
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200' 
  };
};

const TaskCard = ({ task, handleStatusChange, handlePriorityLock, openReassign, onCardClick }) => {
  const prio = priorityInfo(task.priority);
  
  return (
    <div 
      className="group relative bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-300 p-4 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', task.id);
        e.currentTarget.style.opacity = '0.5';
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
      onClick={() => onCardClick(task)}
    >
      {task.priority_locked && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center shadow-lg text-[10px] border-2 border-white text-white z-10" title="Priority Locked">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
      )}
      
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/50">
          {task.team_name}
        </span>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${prio.color}`}>
          <span>{prio.icon}</span>
          {task.priority}
        </div>
      </div>
      
      <h4 className="font-display text-sm font-bold text-slate-800 leading-snug mb-3">
        {task.title}
      </h4>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {dateLabel(task.due_date)}
        <span className="px-2 py-0.5 rounded text-[10px] font-bold border text-slate-500 bg-slate-50">
          By: {task.assigned_by_name || 'System'}
        </span>
      </div>
      
      <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <select 
          className="flex-1 h-8 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 px-2 outline-none hover:border-blue-400 focus:ring-2 focus:ring-blue-500/20 cursor-pointer transition-all"
          value={task.status}
          onChange={(e) => { e.stopPropagation(); handleStatusChange(task, e.target.value); }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="TODO">To Do (Up Next)</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="PENDING">Pending Blocked</option>
          <option value="DONE">Completed</option>
        </select>
        
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            type="button" 
            title={task.priority_locked ? "Unlock Priority" : "Lock Priority"}
            onClick={(e) => { e.stopPropagation(); handlePriorityLock(task.id); }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${task.priority_locked ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            {task.priority_locked ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            )}
          </button>
          <button 
            type="button" 
            title="Reassign Task"
            onClick={(e) => { e.stopPropagation(); openReassign(task); }}
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 3l4 4-4 4M21 7H8a4 4 0 00-4 4v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
