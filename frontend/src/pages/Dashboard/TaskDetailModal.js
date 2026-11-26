import React, { useEffect, useRef, useState } from 'react';
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
import TaskExtrasPanel from '../../components/taskExtras/TaskExtrasPanel';
import TaskHistory from '../../components/taskExtras/TaskHistory';
import BugStageBar from '../../components/bugs/BugStageBar';
import useBugTracking from '../../components/bugs/useBugTracking';
import { announceTaskExtrasChange, useTaskMeta } from '../../components/taskExtras/taskExtrasStore';
import { FlagIcon, ExpandIcon, ShareIcon } from '../../components/shell/icons';
import { taskExtras, tasks as tasksApi } from '../../services/api';
import { SendBackModal, SentBackBanner, canSendBack } from '../../components/tasks/SendBack';
import TaskReminders from '../../components/tasks/TaskReminders';
import TaskPicture from '../../components/tasks/TaskPicture';
import { HandOverModal, canHandOver } from '../../components/tasks/HandOver';
import { rememberTask } from '../../services/recent';
import { notify } from '../../services/feedback';
import { Button, Chip, Select, Tabs } from '../../ui';
import { ISSUE_TONE } from './TaskDetailSummary';
import { IconButton, InlineDescription, InlineTitle, MoreMenu, WatchButton } from './TaskDetailParts';
import { STATUS_OPTIONS, STATUS_LABEL, dateLabel, dateTimeLabel, toInputDate, Inp,
  BugDetailSec, FeatureDetailSec, EnhDetailSec, StoryDetailSec, TaskClassSec, BugEditFields, FeatureEditFields, EnhEditFields, StoryEditFields, TaskEditFields } from './TaskDetailFields';

const QUICK_REPLIES = ['Can I get more info…?', 'Status update…', 'Thanks…'];
const typing = (el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || el?.isContentEditable;

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

/* The task window, Jira-style: what the task is on the left (title, description, subtasks, links, activity),
   its details on the right. Status, assignee, priority and dates save as soon as they change. */
const TaskDetailModal = ({ selectedTask: task, sheetTab, setSheetTab, setSelectedTask, handleDelete, handleApproveDelete, handleRejectDelete, onSaved }) => {
  const metadata = useTaskMetadata(task);
  const members = metadata.members, availableTaskOptions = metadata.options;
  const editor = useTaskDraft(task, setSelectedTask, onSaved);
  const layout = useTaskFormLayout()?.layout || null;
  const bugFlowOn = useBugTracking() === true;
  const t = editor.draft;
  const type = t.issue_type || 'task';
  const up = editor.update;
  // Send back and Set reminder open a window on top: Escape closes that one only, not the task too.
  const [sendingBack, setSendingBack] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [handingOver, setHandingOver] = useState(false);
  const dialogRef = useDialog(true, () => { if (!sendingBack && !reminderOpen && !pictureOpen && !handingOver) editor.close(); });
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isCreator = t.assigned_by === user.id;
  const { keyOf } = useTaskMeta();
  const [expanded, setExpanded] = useState(false);
  const [activity, setActivity] = useState('comments');
  const [moreOpen, setMoreOpen] = useState(sheetTab === 'edit');
  const flagged = t.flagged === true || t.flagged === 1;

  useEffect(() => { rememberTask(task); }, [task]);
  // Quick fields save at once: change the draft, then save on the next render.
  const pending = useRef(false);
  const commit = (field, value) => { pending.current = true; up(field, value); };
  useEffect(() => {
    if (pending.current && editor.dirty && !editor.saving) { pending.current = false; editor.save(); }
  }, [editor.draft, editor.dirty, editor.saving]); // eslint-disable-line react-hooks/exhaustive-deps
  // "M" jumps to the comment box, like Jira.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'm' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault(); setActivity('comments');
      setTimeout(() => document.querySelector('[aria-label="New comment"]')?.focus(), 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // "I" takes the task, like Jira's "assign to me" key. The latest state is read through a ref.
  const takeRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'i' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (takeRef.current) { e.preventDefault(); takeRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Subtasks, links and the parent open in this same window.
  const openTask = async (id) => {
    if (editor.dirty && !window.confirm('You have unsaved changes. Open the other task anyway?')) return;
    try { const { data } = await tasksApi.getDetail(id); setSelectedTask(data); setSheetTab('details'); }
    catch (err) { notify(err.response?.data?.error || 'Could not open that task.'); }
  };
  const copy = async (text, done) => {
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); notify(done, 'success'); }
    catch { window.prompt('Copy this', text); }
  };
  const copyLink = () => copy(`${window.location.origin}/dashboard?task=${t.id}`, 'Task link copied');
  const copyKey = () => copy(keyOf(t.id), `${keyOf(t.id)} copied`);
  const toggleFlag = async () => {
    try {
      await taskExtras.flag(t.id, !flagged);
      setSelectedTask((prev) => (prev?.id === t.id ? { ...prev, flagged: !flagged } : prev));
      announceTaskExtrasChange(); onSaved?.();
      notify(flagged ? 'Flag removed.' : 'Flag added.', 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not change the flag.'); }
  };
  const meInTeam = members.some((m) => Number(m.id) === Number(user.id));
  const canTake = meInTeam && Number(t.assigned_to) !== Number(user.id) && t.status !== 'DONE';
  takeRef.current = canTake && !editor.saving && !sendingBack && !reminderOpen ? () => commit('assigned_to', user.id) : null;
  const tabs = [['comments', 'Comments', t.total_comments > 0 && <span className="rounded-full bg-subtle px-2 text-[10px] text-muted">{t.total_comments}</span>], ['history', 'History'],
    ...(layout?.settings?.time_tracking ? [['worklog', 'Work log']] : []), ['checklist', 'Checklist & review']];
  const saveState = editor.saving ? 'Saving…' : editor.dirty && !pending.current ? 'Unsaved changes' : editor.message === 'Saved' ? 'Saved' : '';

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-2 sm:p-4" onClick={editor.close}>
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Task ${keyOf(t.id)}`} tabIndex={-1}
        className={`task-detail-dialog relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop ${expanded ? 'h-[96vh] w-[98vw]' : 'h-[min(90vh,860px)] w-[min(1200px,98vw)]'}`}
        onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
            {t.parent_task_id ? <>
              <button type="button" onClick={() => openTask(t.parent_task_id)} className="font-medium text-muted hover:text-accent hover:underline" title="Open the parent task">{keyOf(t.parent_task_id)}</button>
              <span aria-hidden="true" className="text-muted">/</span>
            </> : null}
            <Chip tone={ISSUE_TONE[type] || 'neutral'}>{type === 'enhancement' ? 'IMPROVEMENT' : type.toUpperCase()}</Chip>
            <button type="button" onClick={copyKey} title="Copy task key" className="font-semibold text-accent hover:underline">{keyOf(t.id)}</button>
            {flagged && <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger"><FlagIcon />Flagged</span>}
            {saveState && <span role="status" className={`ml-1 text-xs ${saveState === 'Unsaved changes' ? 'font-medium text-warn' : 'text-muted'}`}>{saveState}</span>}
          </nav>
          <div className="flex items-center gap-1.5">
            {canTake && <Button size="sm" variant="primary" disabled={editor.saving} title="Assign to me (shortcut: I)" onClick={() => commit('assigned_to', user.id)}>Assign to me</Button>}
            <WatchButton taskId={t.id} />
            <IconButton label="Share: copy the link to this task" onClick={copyLink}><ShareIcon size={15} /></IconButton>
            <MoreMenu items={[
              { label: 'Copy key', run: copyKey },
              { label: 'Copy link', run: copyLink },
              { label: flagged ? 'Remove flag' : 'Add flag', run: toggleFlag },
              '-',
              { label: 'Reload latest', run: editor.reload },
              ...(!t.delete_requested_by ? ['-', { label: 'Delete task', danger: true, run: () => handleDelete(t.id) }] : []),
            ]} />
            <IconButton label={expanded ? 'Smaller window' : 'Bigger window'} onClick={() => setExpanded((v) => !v)}><ExpandIcon size={15} shrink={expanded} /></IconButton>
            <IconButton label="Close task" onClick={editor.close}><span className="text-lg leading-none">&times;</span></IconButton>
          </div>
          {(editor.error || metadata.error) && (
            <p role="alert" className="flex w-full flex-wrap items-center gap-2 text-sm text-danger">
              {editor.error || metadata.error}
              {editor.error && <button type="button" onClick={editor.reload} className="font-semibold underline">Reload latest</button>}
            </p>
          )}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
          {/* LEFT: the work itself */}
          {/* Children never shrink: this column scrolls, and shrinking squashed the title box and image to thin lines. */}
          <main className="flex min-w-0 flex-col gap-5 px-6 py-5 lg:overflow-y-auto [&>*]:shrink-0">
            <InlineTitle value={t.title} disabled={editor.saving} onSave={(value) => commit('title', value)} />
            <section>
              <h3 className="mb-1 text-[15px] font-semibold">Description</h3>
              <InlineDescription value={t.description} disabled={editor.saving} onSave={(value) => commit('description', value)} />
            </section>

            <SentBackBanner task={t} />

            {t.delete_requested_by ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm">
                <span className="flex-1 font-medium text-danger">Delete requested by {t.delete_requested_by_name || 'someone'}.</span>
                {isCreator ? <>
                  <Button size="sm" variant="danger" className="!border-danger/40" onClick={() => handleApproveDelete(t.id)}>Approve</Button>
                  <Button size="sm" onClick={() => handleRejectDelete(t.id)}>Reject</Button>
                </> : <span className="text-xs text-danger">Waiting for approval</span>}
              </div>
            ) : null}

            <TaskPicture value={t.reference_image} disabled={editor.saving} onOpenChange={setPictureOpen} onChange={(value) => commit('reference_image', value)} />

            <TaskExtrasPanel key={`extras-${task.id}`} task={task} members={members} onOpenTask={openTask} onChanged={onSaved} />

            {layout && <CustomFieldsDetail layout={layout} task={t} />}
            {type === 'bug' && <BugDetailSec t={t} />}
            {type === 'feature' && <FeatureDetailSec t={t} />}
            {type === 'enhancement' && <EnhDetailSec t={t} />}
            {type === 'story' && <StoryDetailSec t={t} />}

            <section className="flex flex-col gap-3">
              <h3 className="text-[15px] font-semibold">Activity</h3>
              <Tabs tabs={tabs} value={activity} onChange={setActivity} label="Activity" />
              {activity === 'comments' && <TaskComments taskId={t.id} members={members} quickReplies={QUICK_REPLIES} />}
              {activity === 'history' && <TaskHistory key={`${t.id}:${t.version}`} taskId={t.id} members={members} />}
              {activity === 'worklog' && <TaskTimeLog key={task.id} task={task} members={members} />}
              {activity === 'checklist' && (
                <TaskWorkflowPanel key={`${task.id}:${task.version}`} task={task} members={members} disabled={editor.dirty || editor.saving}
                  onUpdate={(updated) => { setSelectedTask(updated); onSaved?.(); }} />
              )}
              {activity === 'comments' && <p className="text-xs text-muted"><span className="font-semibold">Tip:</span> press <kbd className="rounded border border-line bg-subtle px-1">M</kbd> to comment.</p>}
            </section>
          </main>

          {/* RIGHT: details */}
          <aside className="flex flex-col gap-4 border-t border-line bg-subtle/40 px-5 py-5 lg:overflow-y-auto lg:border-l lg:border-t-0 [&>*]:shrink-0">
            {/* With bug tracking on, a bug moves by its stage buttons instead of the status list. */}
            {bugFlowOn && type === 'bug' ? <>
              <BugStageBar task={t} onChanged={() => { editor.reload(); onSaved?.(); }} />
              <TimesheetLink taskId={t.id} />
            </> : (
              <div className="flex flex-wrap items-center gap-2">
                <Select aria-label="Status" className="!w-auto font-semibold" value={t.status} disabled={editor.saving} onChange={(e) => commit('status', e.target.value)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
                <TimesheetLink taskId={t.id} />
              </div>
            )}

            <section className="rounded-lg border border-line bg-surface px-4 py-3">
              <h3 className="mb-1 text-[15px] font-semibold">Details</h3>
              <DetailRow label="Assignee">
                <Select aria-label="Assignee" value={t.assigned_to || ''} disabled={editor.saving} onChange={(e) => commit('assigned_to', e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                {meInTeam && Number(t.assigned_to) !== Number(user.id) && (
                  <button type="button" onClick={() => commit('assigned_to', user.id)} className="mt-1 text-sm font-semibold text-accent hover:underline">Assign to me</button>
                )}
                {canSendBack(t, { bugFlowOn }) && !editor.dirty && (
                  <button type="button" onClick={() => setSendingBack(true)} className="mt-1 block text-sm font-semibold text-warn hover:underline">Not yours? Send it back</button>
                )}
                {canHandOver(t, members) && !(bugFlowOn && type === 'bug') && !editor.dirty && (
                  <button type="button" onClick={() => setHandingOver(true)} className="mt-1 block text-sm font-semibold text-info hover:underline">Hand over to another team</button>
                )}
              </DetailRow>
              <DetailRow label="Priority">
                <Select aria-label="Priority" value={t.priority || 'MEDIUM'} disabled={editor.saving} onChange={(e) => commit('priority', e.target.value)}>
                  <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
                </Select>
              </DetailRow>
              <DetailRow label="Start date">
                <input type="date" aria-label="Start date" className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={toInputDate(t.start_date)} disabled={editor.saving}
                  onChange={(e) => commit('start_date', e.target.value)} />
              </DetailRow>
              <DetailRow label="Due date">
                <input type="date" aria-label="Due date" className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={toInputDate(t.due_date)} disabled={editor.saving}
                  onChange={(e) => commit('due_date', e.target.value)} />
              </DetailRow>
              {(t.client_name || t.agent_name) && <DetailRow label="Client">{t.client_name || '—'}{t.agent_name ? <span className="block text-xs text-muted">via {t.agent_name}</span> : null}</DetailRow>}
              <DetailRow label="Reporter">{t.created_by_name || t.assigned_by_name || '—'}</DetailRow>
              <DetailRow label="Created"><span className="text-muted">{dateTimeLabel(t.created_at)}</span></DetailRow>
              {t.updated_at && <DetailRow label="Updated"><span className="text-muted">{dateLabel(t.updated_at)}</span></DetailRow>}
            </section>

            <TaskReminders key={`reminders-${t.id}`} task={t} onOpenChange={setReminderOpen} />

            <section className="rounded-lg border border-line bg-surface">
              <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="text-[15px] font-semibold">More details</span>
                <span aria-hidden="true" className={`text-muted transition ${moreOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {moreOpen && (
                <fieldset disabled={editor.saving} className="flex flex-col gap-3 border-t border-line px-4 py-3">
                  <div className="flex flex-col gap-1"><label htmlFor="edit-agent" className="text-xs font-medium text-muted">Agent</label>
                    <AgentPicker id="edit-agent" value={t.agent_firm_id || ''} onChange={(value) => up('agent_firm_id', value)} /></div>
                  <div className="flex flex-col gap-1"><label htmlFor="edit-client" className="text-xs font-medium text-muted">Client</label>
                    <ClientPicker id="edit-client" value={t.client_name || ''} onChange={(value) => up('client_name', value)} agentId={t.agent_firm_id || null} /></div>
                  <Inp label="Assigned date" type="date" value={toInputDate(t.assigned_date)} onChange={(e) => up('assigned_date', e.target.value)} />
                  {layout && <CustomFieldsEdit layout={layout} task={t} up={up} />}
                  <div className="grid grid-cols-1 gap-3">
                    {type === 'bug' && <BugEditFields t={t} up={up} />}
                    {type === 'feature' && <FeatureEditFields t={t} up={up} />}
                    {type === 'enhancement' && <EnhEditFields t={t} up={up} />}
                    {type === 'story' && <StoryEditFields t={t} up={up} />}
                    {(type === 'task' || !type) && <TaskEditFields t={t} up={up} opts={availableTaskOptions} cats={(availableTaskOptions.categories || []).filter((option) => !option.parent_value || option.parent_value === t.task_type)} />}
                  </div>
                  {(type === 'task' || !type) && <TaskClassSec t={t} />}
                </fieldset>
              )}
              {editor.dirty && !pending.current && (
                <div className="flex items-center gap-2 border-t border-line px-4 py-3">
                  <span className="flex-1 text-xs font-medium text-warn">Unsaved changes</span>
                  <Button size="sm" onClick={editor.reload}>Discard</Button>
                  <Button size="sm" variant="primary" disabled={editor.saving} onClick={editor.save}>{editor.saving ? 'Saving…' : 'Save'}</Button>
                </div>
              )}
            </section>
          </aside>
        </div>
        {handingOver && (
          <HandOverModal task={t} onClose={() => setHandingOver(false)}
            onDone={() => { onSaved?.(); setSelectedTask(null); }} />
        )}
        {sendingBack && (
          <SendBackModal task={t} onClose={() => setSendingBack(false)} onDone={() => { editor.reload(); onSaved?.(); }} />
        )}
      </aside>
    </div>
  );
};

export default TaskDetailModal;
