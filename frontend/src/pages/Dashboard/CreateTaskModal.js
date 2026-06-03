import React from 'react';

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CreateTaskModal = ({ 
  showTaskModal, 
  setShowTaskModal, 
  taskForm, 
  updateTaskFormField, 
  handleReferenceImageChange,
  handleCreateTask,
  selectedTeam,
  members,
  availableTaskOptions,
  createTaskCategories
}) => {
  if (!showTaskModal) return null;

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-[90] p-4" onClick={() => setShowTaskModal(false)}>
      <div className="w-[min(1180px,98vw)] h-[min(92vh,940px)] overflow-auto rounded-3xl bg-gradient-to-b from-[#fcfdff] via-[#f4f8ff] to-white border border-[#dbe7ff] shadow-[0_24px_60px_rgba(15,23,42,0.28)] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="uppercase tracking-wider text-[11px] font-bold opacity-90">Task Composer</p>
            <h3 className="font-display text-2xl">Create a detailed task</h3>
            <p className="mt-1.5 max-w-[660px] text-sm text-gray-500">Open the form wide, set dates clearly, and attach one small reference image.</p>
          </div>
          <button type="button" className="h-[38px] border border-gray-300 rounded-xl bg-white text-gray-700 text-sm font-bold px-3.5 cursor-pointer" onClick={() => setShowTaskModal(false)}>Close</button>
        </div>
        
        <form className="flex flex-col gap-5" onSubmit={handleCreateTask}>
          <div className="grid grid-cols-[1.55fr_0.9fr] gap-5 items-start">
            <div className="flex flex-col gap-4">
              {/* Workflow Section */}
              <section className="rounded-2xl border border-[#dbe7ff] bg-white/[0.92] shadow-[0_12px_32px_rgba(148,163,184,0.12)] px-5 py-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2.5">
                  <div>
                    <h4 className="text-lg font-display">Workflow</h4>
                    <p className="mt-1 text-xs text-gray-500">Select how this item should move in the workspace.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-1.5">
                  {[['task', 'Task'], ['bug', 'Bug'], ['story', 'Story']].map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      className={`border h-[34px] rounded-lg text-xs font-bold cursor-pointer ${
                        taskForm.issue_type === type 
                          ? 'border-[#2f5dff] text-[#1e40af] bg-[rgba(47,93,255,0.08)]' 
                          : 'border-gray-300 bg-white text-gray-700'
                      }`}
                      onClick={() => updateTaskFormField('issue_type', type)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-gray-600">Task Title</span>
                  <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" placeholder="Write a clear task title" value={taskForm.title} onChange={(e) => updateTaskFormField('title', e.target.value)} required />
                </label>
                
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-gray-600">Description</span>
                  <textarea className="min-h-[84px] resize-y rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5 py-2.5" placeholder="Explain expected output, dependencies, and delivery details" value={taskForm.description} onChange={(e) => updateTaskFormField('description', e.target.value)} />
                </label>
              </section>
              
              {/* Task Setup */}
              <section className="rounded-2xl border border-[#dbe7ff] bg-white/[0.92] shadow-[0_12px_32px_rgba(148,163,184,0.12)] px-5 py-5 flex flex-col gap-3">
                <div>
                  <h4 className="text-lg font-display">Task Setup</h4>
                  <p className="mt-1 text-xs text-gray-500">These dropdowns are controlled from Settings by admin and manager.</p>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Task Type</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={taskForm.task_type} onChange={(e) => updateTaskFormField('task_type', e.target.value)}>
                      <option value="">Select task type</option>
                      {availableTaskOptions.task_types.map((option) => (
                        <option key={option.id || option.label} value={option.label}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Product / Module</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={taskForm.product} onChange={(e) => updateTaskFormField('product', e.target.value)}>
                      <option value="">Select product/module</option>
                      {availableTaskOptions.products.map((option) => (
                        <option key={option.id || option.label} value={option.label}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Category</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={taskForm.category} onChange={(e) => updateTaskFormField('category', e.target.value)}>
                      <option value="">Select category</option>
                      {createTaskCategories.map((option) => (
                        <option key={option.id || `${option.label}-${option.parent_value || 'general'}`} value={option.label}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              
              {/* Ownership & Dates */}
              <section className="rounded-2xl border border-[#dbe7ff] bg-white/[0.92] shadow-[0_12px_32px_rgba(148,163,184,0.12)] px-5 py-5 flex flex-col gap-3">
                <div>
                  <h4 className="text-lg font-display">Ownership & Dates</h4>
                  <p className="mt-1 text-xs text-gray-500">Assigned date, start date, and end date stay visible for delivery tracking.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Priority</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={taskForm.priority} onChange={(e) => updateTaskFormField('priority', e.target.value)}>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </label>
                  
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Assignee</span>
                    <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={taskForm.assigned_to} onChange={(e) => updateTaskFormField('assigned_to', e.target.value)}>
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Assigned Date</span>
                    <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" type="date" value={taskForm.assigned_date} onChange={(e) => updateTaskFormField('assigned_date', e.target.value)} />
                  </label>
                  
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">Start Date</span>
                    <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" type="date" value={taskForm.start_date} onChange={(e) => updateTaskFormField('start_date', e.target.value)} />
                  </label>
                  
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-600">End Date</span>
                    <input className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" type="date" value={taskForm.due_date} onChange={(e) => updateTaskFormField('due_date', e.target.value)} />
                  </label>
                </div>
              </section>
              
              {/* Reference Image */}
              <section className="rounded-2xl border border-[#dbe7ff] bg-white/[0.92] shadow-[0_12px_32px_rgba(148,163,184,0.12)] px-5 py-5 flex flex-col gap-3">
                <div>
                  <h4 className="text-lg font-display">Reference Image</h4>
                  <p className="mt-1 text-xs text-gray-500">Add one small screenshot or mockup so the assignee understands the task quickly.</p>
                </div>
                
                <label className="rounded-2xl border border-dashed border-[#93c5fd] bg-gradient-to-b from-[#f8fbff] to-[#eef6ff] px-3.5 py-3.5 flex flex-col gap-2">
                  <span className="text-xs font-bold text-gray-600">Upload Image</span>
                  <input className="h-auto px-2.5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-800 text-sm" type="file" accept="image/*" onChange={handleReferenceImageChange} />
                  <small className="text-[11px] text-gray-500">Use PNG, JPG, or WEBP under 450KB.</small>
                </label>
                
                {taskForm.reference_image && (
                  <div className="rounded-2xl border border-[#dbeafe] bg-white px-3 py-3 flex flex-col gap-2.5">
                    <img src={taskForm.reference_image} alt="Task reference preview" className="w-full rounded-2xl border border-[#dbe7ff] object-cover max-h-[280px]" />
                    <button type="button" className="h-[38px] border border-gray-300 rounded-xl bg-white text-gray-700 text-sm font-bold px-3.5 cursor-pointer" onClick={() => updateTaskFormField('reference_image', '')}>
                      Remove Image
                    </button>
                  </div>
                )}
              </section>
            </div>
            
            {/* Sidebar */}
            <aside className="flex flex-col gap-4">
              <section className="rounded-2xl border border-[#dbe7ff] bg-white/[0.92] shadow-[0_12px_32px_rgba(148,163,184,0.12)] px-5 py-5">
                <div>
                  <h4 className="text-lg font-display">Live Summary</h4>
                  <p className="mt-1 text-xs text-gray-500 mb-3">Everything here gets saved with the task.</p>
                </div>
                
                <div className="grid gap-2.5">
                  {[
                    { label: 'Team', value: selectedTeam?.name || 'No team selected' },
                    { label: 'Workflow', value: taskForm.issue_type.toUpperCase() },
                    { label: 'Task Type', value: taskForm.task_type || 'Not selected' },
                    { label: 'Product', value: taskForm.product || 'Not selected' },
                    { label: 'Category', value: taskForm.category || 'Not selected' },
                    { label: 'Assignee', value: members.find((member) => Number(member.id) === Number(taskForm.assigned_to))?.name || 'Unassigned' },
                    { label: 'End Date', value: dateLabel(taskForm.due_date) },
                  ].map((item, i) => (
                    <div key={i} className="rounded-2xl border border-[#e4ecff] bg-white px-3 py-3 flex items-center justify-between gap-2.5">
                      <span className="text-xs text-gray-500">{item.label}</span>
                      <strong className="text-xs text-gray-900 text-right">{item.value}</strong>
                    </div>
                  ))}
                </div>
                
                <div className="rounded-2xl bg-gradient-to-br from-[#e0f2fe] to-[#dbeafe] px-3.5 py-3.5 mt-3">
                  <p className="text-sm font-bold text-[#1e3a8a]">Admins and managers can customize these fields from Settings.</p>
                </div>
              </section>
            </aside>
          </div>
          
          <div className="flex justify-end gap-2">
            <button type="button" className="h-[38px] border border-gray-300 rounded-xl bg-white text-gray-700 text-sm font-bold px-3.5 cursor-pointer" onClick={() => setShowTaskModal(false)}>Cancel</button>
            <button type="submit" className="h-[38px] border border-white rounded-xl bg-white text-[#1e40af] text-sm font-bold px-3.5 cursor-pointer">Create Task</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTaskModal;
