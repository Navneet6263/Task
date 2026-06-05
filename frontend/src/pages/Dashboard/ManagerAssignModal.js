import React from 'react';
import TaskSetupSection from './TaskComposer/TaskSetupSection';

const ManagerAssignModal = ({ 
  showMgrModal, 
  setShowMgrModal, 
  mgrForm, 
  setMgrForm, 
  updateMgrFormField, 
  handleManagerAssign, 
  orgUsers,
  availableTaskOptions,
  mgrTaskCategories 
}) => {
  if (!showMgrModal) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4 sm:p-6" onClick={() => setShowMgrModal(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" />

      {/* Modal Container */}
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-50/95 backdrop-blur-xl rounded-[32px] shadow-[0_32px_80px_-12px_rgba(15,23,42,0.4)] border border-white/40 overflow-hidden animate-[dsv2Slide_0.3s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600 px-8 py-6 text-white shrink-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay" />
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-white opacity-10 rounded-full blur-3xl" />
          
          <div className="relative flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-white/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/20">Manager Action</span>
              </div>
              <h3 className="font-display text-3xl font-extrabold tracking-tight">Assign Task</h3>
              <p className="text-blue-100 mt-1 text-sm font-medium">Delegate work to organization members directly</p>
            </div>
            
            <button 
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              onClick={() => setShowMgrModal(false)}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form Content */}
        <form className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar" onSubmit={handleManagerAssign}>
          <div className="flex flex-col gap-8">
            
            {/* Top Row: Title & Basics */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Task Title <span className="text-red-400">*</span></label>
                <input
                  className="h-12 rounded-2xl border border-slate-200 bg-white text-slate-900 text-sm px-4 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  placeholder="What needs to be done?"
                  value={mgrForm.title}
                  onChange={(e) => updateMgrFormField('title', e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Description</label>
                <textarea
                  className="min-h-[100px] resize-y rounded-2xl border border-slate-200 bg-white text-slate-900 text-sm px-4 py-3 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  placeholder="Provide context, instructions, or goals..."
                  value={mgrForm.description}
                  onChange={(e) => updateMgrFormField('description', e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Assignee <span className="text-red-400">*</span></label>
                <select
                  className="h-[42px] rounded-xl border border-slate-200 bg-white text-slate-900 text-sm px-3 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  value={mgrForm.assigned_to}
                  onChange={(e) => updateMgrFormField('assigned_to', e.target.value)}
                  required
                >
                  <option value="">Select organizational member...</option>
                  {orgUsers.map((orgUser) => (
                    <option key={orgUser.id} value={orgUser.id}>{orgUser.name} ({orgUser.role})</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Priority</label>
                <select
                  className="h-[42px] rounded-xl border border-slate-200 bg-white text-slate-900 text-sm px-3 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  value={mgrForm.priority}
                  onChange={(e) => updateMgrFormField('priority', e.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Issue Type</label>
                <div className="flex bg-slate-200/60 p-1 rounded-xl">
                  {['task', 'bug', 'feature', 'enhancement', 'story'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`flex-1 h-8 rounded-lg text-xs font-extrabold capitalize transition-all ${mgrForm.issue_type === t ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => updateMgrFormField('issue_type', t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Due Date</label>
                <input
                  type="date"
                  className="h-[42px] rounded-xl border border-slate-200 bg-white text-slate-900 text-sm px-3 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                  value={mgrForm.due_date}
                  onChange={(e) => updateMgrFormField('due_date', e.target.value)}
                />
              </div>
            </section>

            {/* Smart Setup Section (Reused from TaskComposer) */}
            <div className="bg-white rounded-3xl p-1 shadow-sm border border-slate-100">
              <TaskSetupSection 
                taskForm={mgrForm} 
                updateTaskFormField={updateMgrFormField} 
                availableTaskOptions={availableTaskOptions} 
                createTaskCategories={mgrTaskCategories} 
              />
            </div>
            
          </div>
        </form>

        {/* Footer Actions */}
        <div className="bg-white px-8 py-5 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            className="px-6 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={() => setShowMgrModal(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleManagerAssign}
            className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold shadow-[0_8px_16px_rgba(79,70,229,0.25)] hover:shadow-[0_12px_20px_rgba(79,70,229,0.35)] transition-all cursor-pointer transform hover:-translate-y-0.5"
          >
            Assign Task Now
          </button>
        </div>

      </div>
    </div>
  );
};

export default ManagerAssignModal;
