import React, { useState } from 'react';
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

const dateTimeLabel = (value) => {
  if (!value) return { date: '-', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '-', time: '' };
  return {
    date: parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    time: parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
  };
};

const TaskListView = ({
  paginated, selectedTask, setSelectedTask, setSheetTab,
  handleStatusChange, handleDelete, handleApproveDelete, handleRejectDelete,
  handlePickBug, handleResolveBug, onBulkDelete,
}) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const navigate = useNavigate();

  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const allSelected = paginated.length > 0 && paginated.every(t => selected.has(t.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(t => n.delete(t.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(t => n.add(t.id)); return n; });
    }
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      if (onBulkDelete) await onBulkDelete([...selected]);
      setSelected(new Set());
      setConfirmBulk(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleMailClick = (e, task) => {
    e.stopPropagation();
    localStorage.setItem('comm_task_context', JSON.stringify({
      id: task.id, title: task.title, description: task.description,
      issue_type: task.issue_type, priority: task.priority, status: task.status,
      client_name: task.client_name || '', assigned_to_name: task.assigned_to_name || '',
    }));
    navigate('/communications');
  };

  return (
    <div className="overflow-auto">
      {/* ── Bulk Delete Bar ── */}
      {selected.size > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: 'linear-gradient(135deg,#fee2e2,#fef2f2)',
            border: '1px solid #fca5a5', borderRadius: '14px',
            padding: '10px 16px', marginBottom: '10px',
            animation: 'dashRise 0.25s ease forwards',
          }}
        >
          <span style={{ fontWeight: 700, color: '#b91c1c', fontSize: '14px' }}>
            {selected.size} task{selected.size > 1 ? 's' : ''} selected
          </span>

          {!confirmBulk ? (
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              style={{
                background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: '10px', padding: '7px 18px',
                fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
              }}
            >
              🗑️ Delete Selected
            </button>
          ) : (
            <>
              <span style={{ fontSize: '13px', color: '#7f1d1d', fontWeight: 600 }}>
                Are you sure you want to delete the selected tasks?
              </span>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={handleBulkDelete}
                style={{
                  background: '#dc2626', color: '#fff', border: 'none',
                  borderRadius: '10px', padding: '7px 18px',
                  fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}
              >
                {bulkBusy ? 'Deleting...' : '✅ Yes, Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulk(false)}
                style={{
                  background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                  borderRadius: '10px', padding: '7px 16px',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => { setSelected(new Set()); setConfirmBulk(false); }}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: '#94a3b8', fontSize: '18px', cursor: 'pointer',
            }}
            title="Deselect all"
          >
            ✕
          </button>
        </div>
      )}

      <table className="w-full min-w-[1040px] border-collapse">
        <thead>
          <tr>
            {/* Checkbox header */}
            <th className="p-2.5 border-b border-gray-200 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                title="Select all on this page"
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2f5dff' }}
              />
            </th>
            <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Task</th>
            <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Created By</th>
            <th className="p-2.5 border-b border-gray-200 text-gray-500 text-xs text-left">Created At</th>
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
              className={`cursor-pointer ${
                selected.has(task.id)
                  ? 'bg-[rgba(220,38,38,0.06)]'
                  : selectedTask?.id === task.id
                  ? 'bg-[rgba(47,93,255,0.08)]'
                  : ''
              }`}
              onClick={() => { setSelectedTask(task); setSheetTab('details'); }}
            >
              {/* Checkbox cell */}
              <td className="p-2.5 border-b border-[#edf1fb] align-middle" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(task.id)}
                  onChange={() => toggleOne(task.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#dc2626' }}
                />
              </td>

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
                <span className="font-semibold">{task.created_by_name || task.assigned_by_name || 'System'}</span>
              </td>

              <td className="p-2.5 border-b border-[#edf1fb] text-sm text-gray-800 align-middle whitespace-nowrap">
                {(() => {
                  const created = dateTimeLabel(task.created_at);
                  return (
                    <div className="flex flex-col">
                      <span className="font-semibold">{created.date}</span>
                      <span className="text-[11px] text-gray-500">{created.time}</span>
                    </div>
                  );
                })()}
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
                  {/* Mail Icon */}
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
              <td colSpan={9} className="text-center text-gray-500 p-4">No tasks found for selected filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TaskListView;
