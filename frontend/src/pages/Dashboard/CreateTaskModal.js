import React, { useEffect, useState } from 'react';
import WorkflowSection from './TaskComposer/WorkflowSection';
import TaskSetupSection from './TaskComposer/TaskSetupSection';
import OwnershipSection from './TaskComposer/OwnershipSection';
import ReferenceSection from './TaskComposer/ReferenceSection';
import TaskSummary from './TaskComposer/TaskSummary';
import TaskTypeRail from './TaskComposer/TaskTypeRail';
import TemplatePicker from './TaskComposer/TemplatePicker';
import CustomComposer, { missingFields } from './TaskComposer/CustomComposer';
import useDialog from '../../components/useDialog';
import useTaskFormLayout from '../../components/taskForm/useTaskFormLayout';
import { writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import { Button, Chip } from '../../ui';

const CreateTaskModal = ({
  showTaskModal, setShowTaskModal,
  taskForm, updateTaskFormField, handleReferenceImageChange,
  handleCreateTask, selectedTeam, members,
  availableTaskOptions, createTaskCategories,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [draftStored, setDraftStored] = useState(true);
  const [errors, setErrors] = useState({});
  const formState = useTaskFormLayout();
  const layout = formState?.layout || null;
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');

  const close = () => {
    if (submitting) return;
    const stored = writePreference(`draft:${selectedTeam?.id}`, taskForm);
    const typed = taskForm.title || taskForm.description || Object.values(taskForm.custom_fields || {}).some(Boolean);
    if (!typed || window.confirm(stored ? 'Close this form? Your personal draft is saved on this browser.' : 'Storage is unavailable. Closing could lose your draft. Continue?')) setShowTaskModal(false);
  };
  const dialogRef = useDialog(showTaskModal, close);

  useEffect(() => {
    if (!showTaskModal) return undefined;
    const timer = setTimeout(() => setDraftStored(writePreference(`draft:${selectedTeam?.id}`, taskForm)), 250);
    return () => clearTimeout(timer);
  }, [showTaskModal, selectedTeam?.id, taskForm]);
  useEffect(() => {
    if (!showTaskModal) setErrors({});
  }, [showTaskModal, layout]);

  if (!showTaskModal) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (layout) {
      const missing = missingFields(layout, taskForm);
      setErrors(missing);
      if (Object.keys(missing).length) { notify(`Fill in ${Object.keys(missing).length === 1 ? Object.values(missing)[0].replace(' is required', '') : `${Object.keys(missing).length} required fields`} first.`); return; }
    }
    setSubmitting(true);
    try { await handleCreateTask(event); setErrors({}); } finally { setSubmitting(false); }
  };

  const titleRequired = !layout || layout.fields.some((f) => f.key === 'title' && !f.hidden);
  const canSubmit = !submitting && (!titleRequired || taskForm.title.trim());
  const submitLabel = layout?.settings?.submit_label || 'Create task';
  const ctx = {
    idPrefix: 'compose', members, me: user.id, onImage: handleReferenceImageChange, taskOptions: availableTaskOptions,
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-3 motion-safe:animate-fade-in sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-task-heading"
        className={`flex h-[min(94vh,960px)] flex-col overflow-hidden rounded-xl border border-line bg-canvas text-ink shadow-pop ${layout ? 'w-[min(880px,94vw)]' : 'w-[min(1240px,94vw)]'}`}>
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3.5 sm:px-6">
          <div>
            <h3 id="create-task-heading" className="text-lg font-semibold">{layout ? layout.name : 'Create a task'}</h3>
            <p className="hidden text-sm text-muted sm:block">{layout ? 'Fields marked * are required.' : 'Clear ownership, clear outcome, no unnecessary fields.'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:inline"><Chip tone="ok">{selectedTeam?.name || 'Current team'}</Chip></span>
            <button type="button" onClick={close} aria-label="Close create task" className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>
          </div>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate={Boolean(layout)}>
          {layout ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-5 sm:p-6">
                <p className="mb-5 border-b border-line pb-3 text-sm font-semibold">Details</p>
                <CustomComposer layout={layout} form={taskForm} update={updateTaskFormField} ctx={ctx} errors={errors} />
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[190px_minmax(0,1fr)_285px] lg:overflow-hidden">
              <TaskTypeRail value={taskForm.issue_type} onChange={(value) => updateTaskFormField('issue_type', value)} />
              <main className="flex flex-col gap-4 p-4 sm:p-5 lg:overflow-y-auto">
                <TemplatePicker key={selectedTeam?.id} teamId={selectedTeam?.id} form={taskForm} onApply={updateTaskFormField} />
                <WorkflowSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} />
                <OwnershipSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} members={members} />
                <TaskSetupSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} availableTaskOptions={availableTaskOptions} createTaskCategories={createTaskCategories} />
                <ReferenceSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} handleReferenceImageChange={handleReferenceImageChange} />
              </main>
              <TaskSummary taskForm={taskForm} selectedTeam={selectedTeam} members={members} />
            </div>
          )}

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 sm:px-6">
            <span className="hidden items-center gap-2 text-xs text-muted sm:flex">
              <i className={`h-2 w-2 rounded-full ${draftStored ? 'bg-accent' : 'bg-warn'}`} />
              {draftStored ? 'Personal draft saved on this browser' : 'Draft could not be stored — keep this form open'}
            </span>
            <div className="ml-auto flex gap-2">
              <Button onClick={close}>Cancel</Button>
              <Button type="submit" name="submitAction" value="create-another" className="hidden sm:inline-flex" disabled={!canSubmit}>{layout ? `${submitLabel} and new` : <>Create &amp; add another</>}</Button>
              <Button type="submit" variant="primary" name="submitAction" value="create" disabled={!canSubmit}>{submitting ? (layout ? 'Saving...' : 'Creating...') : submitLabel}</Button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default CreateTaskModal;
