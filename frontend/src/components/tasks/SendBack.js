import React, { useEffect, useState } from 'react';
import { tasks as tasksApi } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, FieldError, Modal, Textarea } from '../../ui';

// "Send back": the person a task is assigned to returns it with a reason when it is not their work.
// It goes to whoever assigned it (or the team leader); the reason lands in the comments and the history.

const MIN = 5;
const MAX = 500;
// Common reasons fill the box in one click; the person can still change the words.
const QUICK = [
  'This is not my work.',
  'This belongs to another team.',
  'I need more details before I can start.',
  'Someone else is already doing this.',
];

const me = () => { try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}'); } catch { return {}; } };

// Who may see the button: only the current assignee, and not on a finished task.
// A bug with bug tracking on uses "Give back" in its bug bar instead.
export const canSendBack = (task, { bugFlowOn = false } = {}) => Boolean(task)
  && Number(task.assigned_to) === Number(me().id)
  && task.status !== 'DONE'
  && !(bugFlowOn && task.issue_type === 'bug');

// The task is still with the person it was sent back to.
export const isSentBack = (task) => Boolean(task?.returned_to) && Number(task.returned_to) === Number(task.assigned_to);

export function SendBackModal({ task, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let live = true;
    tasksApi.sendBackInfo(task.id)
      .then((r) => { if (live) setInfo(r.data); })
      .catch(() => { if (live) setInfo({ allowed: true }); });
    return () => { live = false; };
  }, [task.id]);

  const text = reason.trim();
  const submit = async (event) => {
    event?.preventDefault();
    if (text.length < MIN) { setError('Write why you are sending it back, so they know what to do with it.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await tasksApi.sendBack(task.id, text, task.version);
      notify(data.message || 'Task sent back.', 'success');
      onDone?.(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the task back. Try again.');
    } finally { setBusy(false); }
  };

  const blocked = info && info.allowed === false;
  return (
    <Modal title="Send this task back" subtitle={task.title} onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || blocked || text.length < MIN}>{busy ? 'Sending…' : 'Send back'}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {blocked ? info.reason
            : info?.to ? <>It goes back to <strong className="text-ink">{info.to.name}</strong>, with your reason as a comment. You will no longer be the assignee.</>
              : 'It goes back to the person who gave it to you, with your reason as a comment.'}
        </p>
        {!blocked && <>
          <div className="flex flex-wrap gap-1.5" aria-label="Common reasons">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => { setReason(q); setError(''); }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reason === q ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent/50 hover:text-ink'}`}>{q}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Why are you sending it back?
            <Textarea aria-label="Reason for sending back" rows={3} maxLength={MAX} autoFocus value={reason}
              placeholder="For example: this is a payroll task, I work on VAT."
              onChange={(e) => { setReason(e.target.value); setError(''); }} />
          </label>
          <p className="text-right text-[11px] text-muted">{text.length}/{MAX}</p>
          <FieldError text={error} />
        </>}
      </form>
    </Modal>
  );
}

// Shown in the task window while the task sits with the person it was sent back to.
export function SentBackBanner({ task }) {
  if (!isSentBack(task)) return null;
  const when = task.returned_at ? new Date(task.returned_at) : null;
  return (
    <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-sm" role="status">
      <p className="font-semibold text-warn">
        Sent back by {task.returned_by_name || 'the assignee'}
        {when && !Number.isNaN(when.getTime()) ? <span className="font-normal"> · {when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span> : null}
      </p>
      {task.returned_reason && <p className="mt-0.5 text-ink">{task.returned_reason}</p>}
      <p className="mt-1 text-xs text-muted">Assign it to the right person, or keep it.</p>
    </div>
  );
}

// The small "Sent back" tag on a card or row.
export function SentBackTag({ task }) {
  if (!isSentBack(task)) return null;
  return (
    <span title={`Sent back by ${task.returned_by_name || 'the assignee'}${task.returned_reason ? `: ${task.returned_reason}` : ''}`}
      className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-px text-[10px] font-bold text-warn">↩ Sent back</span>
  );
}
