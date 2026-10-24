import React from 'react';
import TaskComments from '../../components/TaskComments';
import useDialog from '../../components/useDialog';
import useTaskDraft from './useTaskDraft';
import TaskWorkflowPanel from './TaskWorkflowPanel';
import useTaskMetadata from './useTaskMetadata';
import useTaskFormLayout from '../../components/taskForm/useTaskFormLayout';
import { CustomFieldsDetail, CustomFieldsEdit } from './TaskCustomFields';
import TaskTimeLog from './TaskTimeLog';
import ClientPicker from '../../components/clients/ClientPicker';
import AgentPicker from '../../components/clients/AgentPicker';
import TimesheetLink from './TimesheetLink';
import { notify } from '../../services/feedback';
import { Button, Chip, Tabs } from '../../ui';
import TaskDetailSummary, { ISSUE_TONE } from './TaskDetailSummary';
import { PRIORITY_TONE, STATUS_TONE, statusLabel } from './tones';
import { STATUS_OPTIONS, STATUS_LABEL, dateLabel, dateTimeLabel, toInputDate, val, Row, Sec, Sel, Inp, Txt,
  BugDetailSec, FeatureDetailSec, EnhDetailSec, StoryDetailSec, TaskClassSec, BugEditFields, FeatureEditFields, EnhEditFields, StoryEditFields, TaskEditFields } from './TaskDetailFields';

/* ── Main component ─────────────────────────────────────────── */
const TaskDetailModal = ({ selectedTask: task, sheetTab, setSheetTab, setSelectedTask, handleDelete, handleApproveDelete, handleRejectDelete, onSaved }) => {
  const metadata = useTaskMetadata(task);
  const members = metadata.members, availableTaskOptions = metadata.options;
  const editor = useTaskDraft(task, setSelectedTask, onSaved);
  const layout = useTaskFormLayout()?.layout || null;
  const t = editor.draft;
  const type = t.issue_type || 'task';
  const up = editor.update;
  const dialogRef = useDialog(true, editor.close);
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isCreator = t.assigned_by === user.id;

  const copyLink = async () => {
    const link = `${window.location.origin}/dashboard?task=${t.id}`;
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(link); notify('Task link copied', 'success'); }
    catch { window.prompt('Copy this task link', link); }
  };
  const tabs = [['details', 'Details'], ['edit', 'Edit'], ['comments', 'Comments', t.total_comments > 0 && <span className="rounded-full bg-subtle px-2 font-mono text-[10px] text-muted">{t.total_comments}</span>]];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" onClick={editor.close}>
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Task ${t.id}`} tabIndex={-1}
        className="task-detail-dialog relative grid h-[min(88vh,780px)] w-[min(1080px,98vw)] grid-cols-[340px_1fr] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop"
        onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={editor.close} title="Close" aria-label="Close task"
          className="absolute right-3 top-3 z-50 grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>

        <TaskDetailSummary task={t} type={type} isCreator={isCreator} handleDelete={handleDelete} handleApproveDelete={handleApproveDelete} handleRejectDelete={handleRejectDelete} />

        {/* RIGHT */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="px-6 pr-14 pt-2"><Tabs tabs={tabs} value={sheetTab} onChange={setSheetTab} label="Task sections" /></div>
          <div className="-mt-4 flex flex-wrap items-center gap-2 border-b border-line px-6 py-2.5">
            <span role="status" className={`mr-auto text-sm ${editor.dirty ? 'font-medium text-warn' : 'text-muted'}`}>{editor.saving ? 'Saving...' : editor.dirty ? 'Unsaved changes' : editor.message || 'Up to date'}</span>
            <Button size="sm" variant="primary" disabled={!editor.dirty || editor.saving} onClick={editor.save}>Save changes</Button>
            <Button size="sm" disabled={editor.saving} onClick={editor.reload}>Reload latest</Button>
            <Button size="sm" onClick={copyLink}>Copy link</Button>
            <TimesheetLink taskId={t.id} />
            {editor.error && <p role="alert" className="w-full text-sm text-danger">{editor.error}</p>}
            {metadata.error && <p role="alert" className="w-full text-sm text-danger">{metadata.error}</p>}
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">

            {/* DETAILS TAB */}
            {sheetTab === 'details' && (
              <div className="flex flex-col gap-4">
                <Sec title="Task Overview">
                  <Row label="Issue Type"><Chip tone={ISSUE_TONE[type] || 'neutral'}>{type.toUpperCase()}</Chip></Row>
                  <Row label="Status"><Chip tone={STATUS_TONE[t.status] || 'neutral'}>{statusLabel(t.status)}</Chip></Row>
                  <Row label="Priority"><Chip tone={PRIORITY_TONE[t.priority] || 'warn'}>{t.priority || 'MEDIUM'}</Chip></Row>
                  <Row label="Assignee">{val(t.assigned_to_name)}</Row>
                  <Row label="Created By">{val(t.created_by_name || t.assigned_by_name)}</Row>
                  {t.agent_name && <Row label="Agent">{t.agent_name}</Row>}
                  {t.client_name && <Row label="Client Name">{t.client_name}</Row>}
                </Sec>

                {layout && <CustomFieldsDetail layout={layout} task={t} />}
                {layout?.settings?.time_tracking && <TaskTimeLog key={task.id} task={task} members={members} />}

                <TaskWorkflowPanel key={`${task.id}:${task.version}`} task={task} members={members} disabled={editor.dirty || editor.saving} onUpdate={updated => { setSelectedTask(updated); onSaved?.(); }} />

                <Sec title="Timeline">
                  <Row label="Created At">{dateTimeLabel(t.created_at)}</Row>
                  <Row label="Assigned Date">{dateLabel(t.assigned_date)}</Row>
                  <Row label="Start Date">{dateLabel(t.start_date)}</Row>
                  <Row label="Due Date">{dateLabel(t.due_date)}</Row>
                </Sec>

                {type === 'bug'         && <BugDetailSec t={t} />}
                {type === 'feature'     && <FeatureDetailSec t={t} />}
                {type === 'enhancement' && <EnhDetailSec t={t} />}
                {type === 'story'       && <StoryDetailSec t={t} />}
                {(type === 'task' || !type) && <TaskClassSec t={t} />}
              </div>
            )}

            {/* EDIT TAB */}
            {sheetTab === 'edit' && (
              <fieldset disabled={editor.saving} className="flex flex-col gap-3.5">
                <Inp label="Title" value={t.title || ''} onChange={e => up('title', e.target.value)} />
                <Txt label="Description" value={t.description || ''} onChange={e => up('description', e.target.value)} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Sel label="Status" value={t.status} onChange={e => up('status', e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </Sel>
                  <Sel label="Priority" value={t.priority} onChange={e => up('priority', e.target.value)}>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </Sel>
                </div>

                <Sel label="Assignee" value={t.assigned_to || ''} onChange={e => up('assigned_to', e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Sel>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1"><label htmlFor="edit-agent" className="text-xs font-medium text-muted">Agent</label>
                    <AgentPicker id="edit-agent" value={t.agent_firm_id || ''} onChange={value => up('agent_firm_id', value)} /></div>
                  <div className="flex flex-col gap-1"><label htmlFor="edit-client" className="text-xs font-medium text-muted">Client Name</label>
                    <ClientPicker id="edit-client" value={t.client_name || ''} onChange={value => up('client_name', value)} agentId={t.agent_firm_id || null} /></div>
                </div>
                {layout && <CustomFieldsEdit layout={layout} task={t} up={up} />}

                {/* Issue-type specific edit fields */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {type === 'bug'         && <BugEditFields      t={t} up={up} />}
                  {type === 'feature'     && <FeatureEditFields   t={t} up={up} />}
                  {type === 'enhancement' && <EnhEditFields       t={t} up={up} />}
                  {type === 'story'       && <StoryEditFields     t={t} up={up} />}
                  {(type === 'task' || !type) && <TaskEditFields  t={t} up={up} opts={availableTaskOptions} cats={(availableTaskOptions.categories || []).filter(option => !option.parent_value || option.parent_value === t.task_type)} />}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Inp label="Assigned Date" type="date" value={toInputDate(t.assigned_date)} onChange={e => up('assigned_date', e.target.value)} />
                  <Inp label="Start Date" type="date" value={toInputDate(t.start_date)} onChange={e => up('start_date', e.target.value)} />
                  <Inp label="End Date" type="date" value={toInputDate(t.due_date)} onChange={e => up('due_date', e.target.value)} />
                </div>
              </fieldset>
            )}

            {sheetTab === 'comments' && (
              <div className="min-h-[200px]"><TaskComments taskId={t.id} members={members} /></div>
            )}
          </div>
        </div>

      </aside>
    </div>
  );
};

export default TaskDetailModal;
