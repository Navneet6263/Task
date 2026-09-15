import React from 'react';
import TaskComments from '../../components/TaskComments';
import useDialog from '../../components/useDialog';
import useTaskDraft from './useTaskDraft';
import TaskWorkflowPanel from './TaskWorkflowPanel';
import useTaskMetadata from './useTaskMetadata';
import { notify } from '../../services/feedback';
import { STATUS_OPTIONS, STATUS_LABEL, dateLabel, dateTimeLabel, toInputDate, val, Row, Sec, Sel, Inp, Txt,
  BugDetailSec, FeatureDetailSec, EnhDetailSec, StoryDetailSec, TaskClassSec, BugEditFields, FeatureEditFields, EnhEditFields, StoryEditFields, TaskEditFields } from './TaskDetailFields';

/* ── Main component ─────────────────────────────────────────── */
const TaskDetailModal = ({ selectedTask: task, sheetTab, setSheetTab, setSelectedTask, handleDelete, handleApproveDelete, handleRejectDelete, onSaved }) => {
  const metadata = useTaskMetadata(task);
  const members = metadata.members, availableTaskOptions = metadata.options;
  const editor = useTaskDraft(task, setSelectedTask, onSaved);
  const t = editor.draft;
  const type = t.issue_type || 'task';
  const up = editor.update;
  const dialogRef = useDialog(true, editor.close);
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isCreator = t.assigned_by === user.id;

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-[90] p-4" onClick={editor.close}>
        <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Task ${t.id}`} tabIndex={-1} className="task-detail-dialog relative grid grid-cols-[360px_1fr] w-[min(1080px,98vw)] h-[min(88vh,780px)] rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.32)] overflow-hidden animate-[dsv2Slide_0.22s_cubic-bezier(.22,.68,0,1.2)]" onClick={e => e.stopPropagation()}>

          {/* ── Close button — absolute top-right corner ── */}
          <button
            className="absolute top-4 right-4 z-50 bg-white/90 backdrop-blur border border-slate-200 text-slate-500 w-9 h-9 rounded-full text-[15px] cursor-pointer flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-200 shadow-md transition-all duration-200"
            type="button"
            onClick={editor.close}
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

        {/* LEFT */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8] px-6 py-7 flex flex-col gap-4 overflow-y-auto text-white">
          <div className="flex items-center">
            <div className="text-[11px] font-extrabold tracking-wider text-[#93c5fd] bg-white/[0.08] border border-white/[0.12] rounded-full px-3 py-1">TASK-{t.id}</div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <span className={`text-[10px] font-extrabold rounded-full px-2 py-0.5 ${type === 'bug' ? 'bg-red-100 text-red-700' : type === 'story' ? 'bg-purple-100 text-purple-700' : type === 'feature' ? 'bg-emerald-100 text-emerald-700' : type === 'enhancement' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{type.toUpperCase()}</span>
            {t.manager_assigned && <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">MGR</span>}
            <span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${t.priority === 'HIGH' ? 'bg-red-100/15 text-[#fca5a5]' : t.priority === 'LOW' ? 'bg-green-100/15 text-[#6ee7b7]' : 'bg-amber-100/15 text-[#fde68a]'}`}>{t.priority || 'MEDIUM'}</span>
          </div>

          <h2 className="font-display text-[22px] font-extrabold text-white leading-tight m-0">{t.title}</h2>
          <p className="text-sm text-[#94a3b8] leading-relaxed">{t.description || 'No description provided.'}</p>

          <div className="flex flex-col gap-1.5">
            <span className={`inline-flex text-[11px] font-extrabold rounded-full px-2.5 py-1 w-fit ${t.status === 'DONE' ? 'bg-green-100/15 text-[#6ee7b7]' : t.status === 'IN_PROGRESS' ? 'bg-sky-100/15 text-[#7dd3fc]' : t.status === 'PENDING' ? 'bg-amber-100/15 text-[#fde68a]' : 'bg-blue-100/15 text-[#93c5fd]'}`}>{STATUS_LABEL[t.status] || t.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[{ label: 'Assignee', value: t.assigned_to_name || 'Unassigned' }, { label: 'Due Date', value: dateLabel(t.due_date) }, { label: 'Start Date', value: dateLabel(t.start_date) }, { label: 'Client', value: val(t.client_name) }].map((item, i) => (
              <div key={i} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2.5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wider">{item.label}</span>
                <strong className="text-sm text-white font-bold overflow-hidden text-ellipsis whitespace-nowrap">{item.value}</strong>
              </div>
            ))}
          </div>

          {t.reference_image && (
            <div className="rounded-2xl overflow-hidden border border-white/[0.12]">
              <span className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider px-2.5 py-2 pb-1">Reference Image</span>
              <img src={t.reference_image} alt="reference" className="w-full block max-h-[200px] object-cover" />
            </div>
          )}

          {t.delete_requested_by ? (
            <div className="mt-auto flex flex-col gap-2 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
              <span className="text-xs text-[#fca5a5] font-semibold text-center">Delete requested by {t.delete_requested_by_name || 'User'}</span>
              {isCreator ? (
                <div className="flex gap-2">
                  <button type="button" className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer" onClick={() => handleApproveDelete(t.id)}>Approve</button>
                  <button type="button" className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer" onClick={() => handleRejectDelete(t.id)}>Reject</button>
                </div>
              ) : (
                <span className="text-[10px] text-center text-[#fca5a5]/70">Pending approval...</span>
              )}
            </div>
          ) : (
            <button type="button" className="mt-auto border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] text-[#fca5a5] rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[rgba(239,68,68,0.22)]" onClick={() => handleDelete(t.id)}>Delete Task</button>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex flex-col bg-[#f8faff] overflow-hidden">
          <div className="flex gap-0 border-b-2 border-gray-200 bg-white px-6">
            {['details', 'edit', 'comments'].map(tab => (
              <button key={tab} type="button"
                className={`px-4 py-3.5 text-sm font-bold border-b-[3px] mb-[-2px] cursor-pointer capitalize whitespace-nowrap bg-none ${sheetTab === tab ? 'text-[#1e40af] border-[#2f5dff]' : 'text-gray-500 border-transparent hover:text-[#2f5dff]'}`}
                onClick={() => setSheetTab(tab)}>
                {tab === 'details' ? 'Details' : tab === 'edit' ? 'Edit' : (
                  <span className="flex items-center gap-1.5">
                    Comments {t.total_comments > 0 && <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">{t.total_comments}</span>}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="border-b bg-white px-6 py-3 flex flex-wrap items-center gap-2">
            <span role="status" className="text-sm text-slate-600">{editor.saving ? 'Saving...' : editor.dirty ? 'Unsaved changes' : editor.message || 'Up to date'}</span>
            <button type="button" disabled={!editor.dirty || editor.saving} onClick={editor.save} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">Save changes</button>
            <button type="button" disabled={editor.saving} onClick={editor.reload} className="rounded-lg border px-3 py-2 text-sm">Reload latest</button>
            <button type="button" onClick={async () => { const link = `${window.location.origin}/dashboard?task=${t.id}`; try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(link); notify('Task link copied', 'success'); } catch { window.prompt('Copy this task link', link); } }} className="rounded-lg border px-3 py-2 text-sm">Copy link</button>
            {editor.error && <p role="alert" className="w-full text-sm text-red-700">{editor.error}</p>}
            {metadata.error && <p role="alert" className="w-full text-sm text-red-700">{metadata.error}</p>}
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">

            {/* DETAILS TAB */}
            {sheetTab === 'details' && (
              <div className="flex flex-col gap-4">
                <Sec title="Task Overview">
                  <Row label="Issue Type"><span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${type === 'bug' ? 'bg-red-100 text-red-700' : type === 'story' ? 'bg-purple-100 text-purple-700' : type === 'feature' ? 'bg-emerald-100 text-emerald-700' : type === 'enhancement' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{type.toUpperCase()}</span></Row>
                  <Row label="Status"><span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${t.status === 'DONE' ? 'bg-green-100 text-green-700' : t.status === 'IN_PROGRESS' ? 'bg-sky-100 text-sky-700' : t.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{STATUS_LABEL[t.status] || t.status}</span></Row>
                  <Row label="Priority"><span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${t.priority === 'HIGH' ? 'bg-red-100 text-red-700' : t.priority === 'LOW' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>{t.priority || 'MEDIUM'}</span></Row>
                  <Row label="Assignee">{val(t.assigned_to_name)}</Row>
                  <Row label="Created By">{val(t.created_by_name || t.assigned_by_name)}</Row>
                  {t.client_name && <Row label="Client Name">{t.client_name}</Row>}
                </Sec>

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
                <div className="grid grid-cols-2 gap-3">
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

                <Inp label="Client Name" value={t.client_name || ''} onChange={e => up('client_name', e.target.value)} placeholder="Client or project name" />

                {/* Issue-type specific edit fields */}
                <div className="grid grid-cols-3 gap-3">
                  {type === 'bug'         && <BugEditFields      t={t} up={up} />}
                  {type === 'feature'     && <FeatureEditFields   t={t} up={up} />}
                  {type === 'enhancement' && <EnhEditFields       t={t} up={up} />}
                  {type === 'story'       && <StoryEditFields     t={t} up={up} />}
                  {(type === 'task' || !type) && <TaskEditFields  t={t} up={up} opts={availableTaskOptions} cats={(availableTaskOptions.categories || []).filter(option => !option.parent_value || option.parent_value === t.task_type)} />}
                </div>

                <div className="grid grid-cols-3 gap-3">
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
