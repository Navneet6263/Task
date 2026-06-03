import React from 'react';
import TaskComments from '../../components/TaskComments';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

const statusProgress = (status) => {
  if (status === 'DONE') return 100;
  if (status === 'IN_PROGRESS') return 62;
  if (status === 'PENDING') return 30;
  return 14;
};

const statusClass = (status) => {
  if (status === 'DONE') return 'done';
  if (status === 'IN_PROGRESS') return 'progress';
  if (status === 'PENDING') return 'pending';
  return 'todo';
};

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const toInputDate = (value) => {
  if (!value) return '';
  return String(value).split('T')[0];
};

const TaskDetailModal = ({ selectedTask, sheetTab, setSheetTab, setSelectedTask, handleDelete, handlePanelUpdate, members, availableTaskOptions, selectedTaskCategories }) => {
  const wasEdited = selectedTask.updated_at && selectedTask.created_at && selectedTask.updated_at !== selectedTask.created_at;

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-[90] p-4" onClick={() => setSelectedTask(null)}>
      <aside className="grid grid-cols-[360px_1fr] w-[min(1080px,98vw)] h-[min(88vh,780px)] rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.32)] overflow-hidden animate-[dsv2Slide_0.22s_cubic-bezier(.22,.68,0,1.2)]" onClick={(e) => e.stopPropagation()}>
        
        {/* LEFT PANEL */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8] px-6 py-7 flex flex-col gap-4 overflow-y-auto text-white">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold tracking-wider text-[#93c5fd] bg-white/[0.08] border border-white/[0.12] rounded-full px-3 py-1">
              TASK-{selectedTask.id}
            </div>
            <button className="bg-white/10 border border-white/[0.18] text-white w-8 h-8 rounded-full text-[15px] cursor-pointer flex items-center justify-center hover:bg-white/[0.22]" type="button" onClick={() => setSelectedTask(null)} title="Close">✕</button>
          </div>
          
          <div className="flex gap-2 flex-wrap items-center">
            <span className={`text-[10px] font-extrabold rounded-full px-2 py-0.5 ${
              selectedTask.issue_type === 'bug' ? 'bg-red-100 text-red-700' : 
              selectedTask.issue_type === 'story' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {(selectedTask.issue_type || 'task').toUpperCase()}
            </span>
            {selectedTask.manager_assigned && <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">MGR</span>}
            <span className={`inline-flex items-center text-[11px] font-extrabold rounded-full px-2.5 py-1 ${
              selectedTask.priority === 'HIGH' ? 'bg-red-100/15 text-[#fca5a5]' :
              selectedTask.priority === 'LOW' ? 'bg-green-100/15 text-[#6ee7b7]' : 'bg-amber-100/15 text-[#fde68a]'
            }`}>
              {selectedTask.priority || 'MEDIUM'}
            </span>
          </div>
          
          <h2 className="font-display text-[22px] font-extrabold text-white leading-tight m-0">{selectedTask.title}</h2>
          <p className="text-sm text-[#94a3b8] leading-relaxed">{selectedTask.description || 'No description provided for this task.'}</p>
          
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[11px] text-[#94a3b8] font-semibold">
              <span>Progress</span>
              <span>{statusProgress(selectedTask.status)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.12] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#60a5fa] to-[#34d399] transition-all duration-400" style={{ width: `${statusProgress(selectedTask.status)}%` }} />
            </div>
            <span className={`inline-flex items-center text-[11px] font-extrabold rounded-full px-2.5 py-1 ${
              selectedTask.status === 'DONE' ? 'bg-green-100/15 text-[#6ee7b7]' :
              selectedTask.status === 'IN_PROGRESS' ? 'bg-sky-100/15 text-[#7dd3fc]' :
              selectedTask.status === 'PENDING' ? 'bg-amber-100/15 text-[#fde68a]' : 'bg-blue-100/15 text-[#93c5fd]'
            }`}>
              {STATUS_LABEL[selectedTask.status] || selectedTask.status}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Product', value: selectedTask.product || '—' },
              { label: 'Type', value: selectedTask.task_type || '—' },
              { label: 'Category', value: selectedTask.category || '—' },
              { label: 'Due Date', value: dateLabel(selectedTask.due_date) },
              { label: 'Assignee', value: selectedTask.assigned_to_name || 'Unassigned' },
              { label: 'Start', value: dateLabel(selectedTask.start_date) },
            ].map((item, i) => (
              <div key={i} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2.5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wider">{item.label}</span>
                <strong className="text-sm text-white font-bold whitespace-nowrap overflow-hidden text-ellipsis">{item.value}</strong>
              </div>
            ))}
          </div>
          
          {selectedTask.reference_image && (
            <div className="rounded-2xl overflow-hidden border border-white/[0.12]">
              <span className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider px-2.5 py-2 pb-1">Reference Image</span>
              <img src={selectedTask.reference_image} alt={`${selectedTask.title} reference`} className="w-full block max-h-[200px] object-cover" />
            </div>
          )}
          
          <button type="button" className="mt-auto border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] text-[#fca5a5] rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[rgba(239,68,68,0.22)] hover:border-[rgba(239,68,68,0.6)]" onClick={() => handleDelete(selectedTask.id)}>
            Delete Task
          </button>
        </div>
        
        {/* RIGHT PANEL */}
        <div className="flex flex-col bg-[#f8faff] overflow-hidden">
          <div className="flex gap-0 border-b-2 border-gray-200 bg-white px-6">
            {['details', 'edit', 'comments'].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`px-4 py-3.5 text-sm font-bold border-b-[3px] mb-[-2px] cursor-pointer capitalize whitespace-nowrap ${
                  sheetTab === tab ? 'text-[#1e40af] border-[#2f5dff]' : 'text-gray-500 border-transparent hover:text-[#2f5dff]'
                } bg-none`}
                onClick={() => setSheetTab(tab)}
              >
                {tab === 'details' ? 'Details' : tab === 'edit' ? 'Edit' : 'Comments'}
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {sheetTab === 'details' && (
              <div className="flex flex-col gap-5">
                {[
                  { title: 'Task Overview', rows: [
                    { label: 'Issue Type', value: (selectedTask.issue_type || 'task').toUpperCase() },
                    { label: 'Status', value: STATUS_LABEL[selectedTask.status], badge: true, status: selectedTask.status },
                    { label: 'Priority', value: selectedTask.priority || 'MEDIUM', priorityBadge: true },
                    { label: 'Assignee', value: selectedTask.assigned_to_name || 'Unassigned' },
                    { label: 'Assigned By', value: selectedTask.assigned_by_name || '—' },
                  ]},
                  { title: 'Classification', rows: [
                    { label: 'Task Type', value: selectedTask.task_type || '—' },
                    { label: 'Product', value: selectedTask.product || '—' },
                    { label: 'Category', value: selectedTask.category || '—' },
                  ]},
                  { title: 'Timeline', rows: [
                    { label: 'Assigned Date', value: dateLabel(selectedTask.assigned_date) },
                    { label: 'Start Date', value: dateLabel(selectedTask.start_date) },
                    { label: 'Due Date', value: dateLabel(selectedTask.due_date) },
                  ]},
                ].map((section, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-200 px-4 py-4">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 mb-3">{section.title}</h4>
                    <div className="flex flex-col gap-0">
                      {section.rows.map((row, j) => (
                        <div key={j} className={`flex items-center justify-between py-2 gap-3 ${j !== section.rows.length - 1 ? 'border-b border-gray-200' : ''}`}>
                          <span className="text-sm text-gray-500">{row.label}</span>
                          {row.badge ? (
                            <strong className={`text-sm font-bold text-right inline-flex items-center text-[11px] font-extrabold rounded-full px-2.5 py-1 ${
                              row.status === 'DONE' ? 'bg-green-100 text-green-700' :
                              row.status === 'IN_PROGRESS' ? 'bg-sky-100 text-sky-700' :
                              row.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'
                            }`}>{row.value}</strong>
                          ) : row.priorityBadge ? (
                            <strong className={`text-sm font-bold text-right inline-flex items-center text-[11px] font-extrabold rounded-full px-2.5 py-1 ${
                              row.value === 'HIGH' ? 'bg-red-100 text-red-700' :
                              row.value === 'LOW' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
                            }`}>{row.value}</strong>
                          ) : (
                            <strong className="text-sm text-gray-900 font-bold text-right">{row.value}</strong>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {sheetTab === 'edit' && (
              <div className="flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-600">Status</span>
                  <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={selectedTask.status} onChange={(e) => handlePanelUpdate('status', e.target.value)}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Priority</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={selectedTask.priority} onChange={(e) => handlePanelUpdate('priority', e.target.value)}>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Assignee</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={selectedTask.assigned_to || ''} onChange={(e) => handlePanelUpdate('assigned_to', e.target.value)}>
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Task Type</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={selectedTask.task_type || ''} onChange={(e) => handlePanelUpdate('task_type', e.target.value)}>
                      <option value="">Select type</option>
                      {availableTaskOptions.task_types.map((o) => <option key={o.id || o.label} value={o.label}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Product / Module</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={selectedTask.product || ''} onChange={(e) => handlePanelUpdate('product', e.target.value)}>
                      <option value="">Select product</option>
                      {availableTaskOptions.products.map((o) => <option key={o.id || o.label} value={o.label}>{o.label}</option>)}
                    </select>
                  </label>
                </div>
                
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-600">Category</span>
                  <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={selectedTask.category || ''} onChange={(e) => handlePanelUpdate('category', e.target.value)}>
                    <option value="">Select category</option>
                    {selectedTaskCategories.map((o) => <option key={o.id || `${o.label}-${o.parent_value || ''}`} value={o.label}>{o.label}</option>)}
                  </select>
                </label>
                
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Assigned Date</span>
                    <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" type="date" value={toInputDate(selectedTask.assigned_date)} onChange={(e) => handlePanelUpdate('assigned_date', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">Start Date</span>
                    <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" type="date" value={toInputDate(selectedTask.start_date)} onChange={(e) => handlePanelUpdate('start_date', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-600">End Date</span>
                    <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" type="date" value={toInputDate(selectedTask.due_date)} onChange={(e) => handlePanelUpdate('due_date', e.target.value)} />
                  </label>
                </div>
              </div>
            )}
            
            {sheetTab === 'comments' && (
              <div className="min-h-[200px]">
                <TaskComments taskId={selectedTask.id} />
              </div>
            )}
          </div>
        </div>
        
      </aside>
    </div>
  );
};

export default TaskDetailModal;
