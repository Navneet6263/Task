import React from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const TaskListView = ({ paginated, selectedTask, setSelectedTask, setSheetTab, handleStatusChange, handleDelete, handleApproveDelete, handleRejectDelete, handlePickBug, handleResolveBug }) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const navigate = useNavigate();

  const handleMailClick = (e, task) => {
    e.stopPropagation();
    // Save task context to localStorage — Communications page will pick this up
    localStorage.setItem('comm_task_context', JSON.stringify({
      id: task.id,
      title: task.title,
      description: task.description,
      issue_type: task.issue_type,
      priority: task.priority,
      status: task.status,
      client_name: task.client_name || '',
      assigned_to_name: task.assigned_to_name || '',
    }));
    navigate('/communications');
  };
  
  return (
  <div className="overflow-auto">
    <table className="w-full min-w-[780px] border-collapse">
      <thead>
        <tr>
          <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Task</th>
          <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Assignee</th>
          <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Due</th>
          <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Priority</th>
          <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Status</th>
          <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Actions</th>
        </tr>
      </thead>
      
      <tbody>
        {paginated.map((task) => (
          <tr
            key={task.id}
            className={`cursor-pointer ${selectedTask?.id === task.id ? 'bg-[rgba(47,93,255,0.08)]' : ''}`}
            onClick={() => { setSelectedTask(task); setSheetTab('details'); }}
          >
            <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-extrabold rounded-full px-2 py-0.5 ${
                  task.issue_type === 'bug' ? 'bg-red-100 text-red-700' : 
                  task.issue_type === 'story' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {(task.issue_type || 'task').toUpperCase()}
                </span>
                {task.manager_assigned && <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">MANAGER</span>}
                <strong className="font-bold relative flex items-center gap-1.5">
                  {task.title}
                  {task.unread_comments > 0 && (
                    <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-[0_2px_6px_rgba(239,68,68,0.35)] shrink-0">
                      {task.unread_comments}
                    </span>
                  )}
                </strong>
              </div>
            </td>
            
            <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl grid place-items-center text-white text-[11px] font-extrabold bg-gradient-to-br from-[#2f5dff] to-[#0ea5e9]">
                  {initials(task.assigned_to_name)}
                </span>
                <span>{task.assigned_to_name || 'Unassigned'}</span>
              </div>
            </td>
            
            <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle">{dateLabel(task.due_date)}</td>
            
            <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle">
              <span className={`text-[11px] font-extrabold rounded-full px-2 py-1 ${
                task.priority === 'HIGH' ? 'text-red-700 bg-red-100' :
                task.priority === 'LOW' ? 'text-green-700 bg-green-100' : 'text-amber-800 bg-amber-100'
              }`}>
                {task.priority || 'MEDIUM'}
              </span>
            </td>
            
            <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle">
              <span className={`text-[11px] font-extrabold rounded-full px-2 py-1 inline-flex ${
                task.status === 'DONE' ? 'text-green-700 bg-green-100' :
                task.status === 'IN_PROGRESS' ? 'text-sky-700 bg-sky-100' :
                task.status === 'PENDING' ? 'text-amber-800 bg-amber-100' : 'text-blue-700 bg-blue-100'
              }`}>
                {STATUS_LABEL[task.status] || task.status}
              </span>
            </td>
            
            <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle">
              <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                {/* Mail / Send Email Icon */}
                <button
                  type="button"
                  title="Send email about this task"
                  onClick={(e) => handleMailClick(e, task)}
                  className="h-[38px] w-[38px] flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)] transition-all duration-200 cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </button>

                {task.issue_type === 'bug' && task.status !== 'DONE' && !task.picked_by && (
                  <button type="button" className="h-[38px] border border-gray-300 rounded-xl bg-white text-gray-700 text-sm font-bold px-3.5 cursor-pointer" onClick={() => handlePickBug(task.id)}>
                    Pick
                  </button>
                )}
                
                {task.issue_type === 'bug' && task.status !== 'DONE' && task.picked_by && (
                  <button type="button" className="h-[38px] border border-gray-300 rounded-xl bg-white text-gray-700 text-sm font-bold px-3.5 cursor-pointer" onClick={() => handleResolveBug(task.id)}>
                    Resolve
                  </button>
                )}
                
                {task.issue_type !== 'bug' && (
                  <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5 min-w-[112px]" value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                    ))}
                  </select>
                )}
                
                {task.delete_requested_by ? (
                  task.assigned_by === user.id ? (
                    <div className="flex gap-1">
                      <button type="button" className="h-[38px] border border-red-200 rounded-xl bg-red-500 text-white text-xs font-bold px-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleApproveDelete(task.id); }}>Approve Delete</button>
                      <button type="button" className="h-[38px] border border-gray-300 rounded-xl bg-gray-500 text-white text-xs font-bold px-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleRejectDelete(task.id); }}>Reject</button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-red-500 px-2">Delete Pending</span>
                  )
                ) : (
                  <button type="button" className="h-[38px] border border-red-200 rounded-xl bg-red-100 text-red-700 text-sm font-bold px-3.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}>Delete</button>
                )}
              </div>
            </td>
          </tr>
        ))}
        
        {paginated.length === 0 && (
          <tr>
            <td colSpan={6} className="text-center text-gray-500 p-4">No tasks found for selected filters.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
  );
};

export default TaskListView;
