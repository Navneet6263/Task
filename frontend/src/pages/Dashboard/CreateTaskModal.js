import React, { useEffect, useState } from 'react';
import WorkflowSection from './TaskComposer/WorkflowSection';
import TaskSetupSection from './TaskComposer/TaskSetupSection';
import OwnershipSection from './TaskComposer/OwnershipSection';
import ReferenceSection from './TaskComposer/ReferenceSection';
import TaskSummary from './TaskComposer/TaskSummary';
import TaskTypeRail from './TaskComposer/TaskTypeRail';
import TemplatePicker from './TaskComposer/TemplatePicker';
import useDialog from '../../components/useDialog';
import { writePreference } from '../../services/preferences';

const CreateTaskModal = ({
  showTaskModal, setShowTaskModal,
  taskForm, updateTaskFormField, handleReferenceImageChange,
  handleCreateTask, selectedTeam, members,
  availableTaskOptions, createTaskCategories,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const [draftStored, setDraftStored] = useState(true);
  const close = () => {
    if (submitting) return;
    const stored = writePreference(`draft:${selectedTeam?.id}`, taskForm);
    if (!(taskForm.title || taskForm.description) || window.confirm(stored ? 'Close this form? Your personal draft is saved on this browser.' : 'Storage is unavailable. Closing could lose your draft. Continue?')) setShowTaskModal(false);
  };
  const dialogRef = useDialog(showTaskModal, close);

  useEffect(() => {
    if (!showTaskModal) return undefined;
    const timer = setTimeout(() => setDraftStored(writePreference(`draft:${selectedTeam?.id}`, taskForm)), 250);
    return () => clearTimeout(timer);
  }, [showTaskModal, selectedTeam?.id, taskForm]);

  if (!showTaskModal) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try { await handleCreateTask(event); } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-3 backdrop-blur-[3px] sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-task-heading" className="flex h-[min(94vh,960px)] w-[min(1240px,94vw)] max-h-[960px] flex-col overflow-hidden rounded-[28px] border border-white/90 bg-gradient-to-br from-[#f9fbff] via-[#f5f7ff] to-[#eef4ff] shadow-[0_32px_90px_rgba(15,23,42,0.34)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-indigo-100 bg-gradient-to-r from-white via-indigo-50/80 to-blue-50/90 px-5 py-4 sm:px-7">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-indigo-600">Task Composer</p><h3 id="create-task-heading" className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-[23px]">Create a focused task</h3><p className="mt-0.5 hidden text-xs text-slate-500 sm:block">Clear ownership, clear outcome, no unnecessary fields.</p></div>
          <div className="flex items-center gap-2"><span className="hidden rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-700 md:inline">{selectedTeam?.name || 'Current team'}</span><button type="button" onClick={close} aria-label="Close create task" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-slate-300 hover:text-slate-900">×</button></div>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[190px_minmax(0,1fr)_285px] lg:overflow-hidden">
            <TaskTypeRail value={taskForm.issue_type} onChange={(value) => updateTaskFormField('issue_type', value)} />
            <main className="flex flex-col gap-4 bg-gradient-to-b from-white/35 to-blue-50/45 p-4 sm:p-5 lg:overflow-y-auto">
              <TemplatePicker key={selectedTeam?.id} teamId={selectedTeam?.id} form={taskForm} onApply={updateTaskFormField} />
              <WorkflowSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} />
              <OwnershipSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} members={members} />
              <TaskSetupSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} availableTaskOptions={availableTaskOptions} createTaskCategories={createTaskCategories} />
              <ReferenceSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} handleReferenceImageChange={handleReferenceImageChange} />
            </main>
            <TaskSummary taskForm={taskForm} selectedTeam={selectedTeam} members={members} />
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-indigo-100 bg-gradient-to-r from-white to-indigo-50/60 px-5 py-3.5 sm:px-7">
            <span className="hidden items-center gap-2 text-[10px] font-semibold text-slate-400 sm:flex"><i className="h-2 w-2 rounded-full bg-emerald-500" />{draftStored ? 'Personal draft saved on this browser' : 'Draft could not be stored — keep this form open'}</span>
            <div className="ml-auto flex gap-2"><button type="button" onClick={close} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" name="submitAction" value="create-another" disabled={submitting || !taskForm.title.trim()} className="hidden h-10 rounded-xl border border-indigo-200 bg-white px-4 text-xs font-bold text-indigo-700 disabled:opacity-40 sm:block">Create & add another</button><button type="submit" name="submitAction" value="create" disabled={submitting || !taskForm.title.trim()} className="h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-700 px-5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(79,70,229,0.28)] disabled:opacity-40">{submitting ? 'Creating...' : 'Create task →'}</button></div>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default CreateTaskModal;
