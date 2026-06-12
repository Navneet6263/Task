import React from 'react';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const TaskBoardView = ({ filtered, setSelectedTask, setSheetTab, handleStatusChange, handleApproveDelete, handleRejectDelete }) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  
  return (
  <div className="grid grid-cols-4 gap-2.5">
    {STATUS_OPTIONS.map((status) => {
      const columnItems = filtered.filter((task) => task.status === status);
      return (
        <article key={status} className="rounded-xl border border-gray-200 bg-[#f7f9ff] px-2.5 py-2.5 min-h-[200px]">
          <header className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-extrabold">{STATUS_LABEL[status]}</h4>
            <span className="text-[11px] text-gray-500">{columnItems.length}</span>
          </header>
          
          {columnItems.map((task) => (
            <div
              key={task.id}
              className="relative rounded-xl border border-[#e5e9f5] bg-white px-2.5 py-2.5 mb-2 flex flex-col gap-2 cursor-pointer"
              onClick={() => { setSelectedTask(task); setSheetTab('details'); }}
            >
              {task.unread_comments > 0 && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(239,68,68,0.4)] border-2 border-white z-10">
                  {task.unread_comments}
                </div>
              )}
              <h5 className="text-sm font-bold">{task.title}</h5>
              <p className="text-xs text-gray-500">{task.assigned_to_name || 'Unassigned'}</p>
              
              <div className="flex justify-between items-center gap-2">
                <span className={`text-[11px] font-extrabold rounded-full px-2 py-1 ${
                  task.priority === 'HIGH' ? 'text-red-700 bg-red-100' :
                  task.priority === 'LOW' ? 'text-green-700 bg-green-100' : 'text-amber-800 bg-amber-100'
                }`}>
                  {task.priority || 'MEDIUM'}
                </span>
                <span className="text-[11px] text-gray-500">{dateLabel(task.due_date)}</span>
              </div>
              
              <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)}>
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>{STATUS_LABEL[value]}</option>
                ))}
              </select>

              {task.delete_requested_by ? (
                task.assigned_by === user.id ? (
                  <div className="flex gap-1 mt-1">
                    <button type="button" className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded px-2 py-1.5 text-[10px] font-bold cursor-pointer" onClick={(e) => { e.stopPropagation(); handleApproveDelete(task.id); }}>Approve Delete</button>
                    <button type="button" className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded px-2 py-1.5 text-[10px] font-bold cursor-pointer" onClick={(e) => { e.stopPropagation(); handleRejectDelete(task.id); }}>Reject</button>
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-red-500 font-bold text-center bg-red-50 py-1 rounded">Delete Request Pending</div>
                )
              ) : null}
            </div>
          ))}
          
          {columnItems.length === 0 && <div className="text-xs text-center text-gray-500 py-5">No tasks</div>}
        </article>
      );
    })}
  </div>
  );
};

export default TaskBoardView;
