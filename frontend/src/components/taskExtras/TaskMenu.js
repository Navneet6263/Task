import React, { useEffect, useRef, useState } from 'react';
import { taskExtras, tasks } from '../../services/api';
import { notify } from '../../services/feedback';
import { useReloadSummaries, useTaskMeta } from './taskExtrasStore';

const STATUSES = [['TODO', 'To Do'], ['IN_PROGRESS', 'In Progress'], ['PENDING', 'Pending'], ['DONE', 'Done']];
const me = () => { try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}'); } catch { return {}; } };
const copy = async (text, done) => {
  try { await navigator.clipboard.writeText(text); notify(done, 'success'); } catch { window.prompt('Copy this', text); }
};

const Item = ({ children, onClick, danger, hint, ...rest }) => (
  <li role="none">
    <button type="button" role="menuitem" onClick={onClick} {...rest}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-subtle ${danger ? 'text-danger' : 'text-ink'}`}>
      <span className="flex-1">{children}</span>{hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  </li>
);

// The "…" menu on a task card or row, like Jira's: status, assign to me, copy link and key, flag, open, delete.
//   flagged: current flag; onStatus(status); onChanged() after a change; onOpen(); onDelete() (optional)
export default function TaskMenu({ task, flagged = false, onStatus, onChanged, onOpen, onDelete, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const root = useRef(null);
  const { keyOf } = useTaskMeta();
  const reload = useReloadSummaries();
  const user = me();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const run = (action) => async () => { setOpen(false); setStatusOpen(false); await action(); };

  const assignToMe = run(async () => {
    try { await tasks.update(task.id, { assigned_to: user.id, version: task.version }); notify(`${keyOf(task.id)} is now yours.`, 'success'); onChanged?.(); }
    catch (err) { notify(err.response?.status === 409 ? 'This task changed. Refresh and try again.' : err.response?.data?.error || 'Could not assign the task.'); }
  });
  const toggleFlag = run(async () => {
    try { await taskExtras.flag(task.id, !flagged); notify(flagged ? 'Flag removed.' : 'Flag added.', 'success'); reload?.(); onChanged?.(); }
    catch (err) { notify(err.response?.data?.error || 'Could not change the flag.'); }
  });
  const link = `${window.location.origin}/dashboard?task=${task.id}`;

  return (
    <div ref={root} className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} role="presentation">
      <button type="button" aria-label={`More actions for ${task.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={`grid h-7 w-7 place-items-center rounded-md border text-muted transition hover:border-accent/50 hover:text-ink ${open ? 'border-accent bg-accent-soft text-accent' : 'border-transparent'}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <ul role="menu" aria-label={`Actions for ${task.title}`}
          className={`absolute top-8 z-40 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <Item aria-expanded={statusOpen} onClick={() => setStatusOpen((v) => !v)} hint={statusOpen ? 'Hide' : 'Show'}>Change status</Item>
          {statusOpen && STATUSES.map(([value, label]) => (
            <li role="none" key={value}>
              <button type="button" role="menuitemradio" aria-checked={task.status === value} disabled={task.status === value} onClick={run(() => onStatus?.(value))}
                className="flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-sm hover:bg-subtle disabled:font-semibold disabled:text-accent">
                {label}
              </button>
            </li>
          ))}
          {Number(task.assigned_to) !== Number(user.id) && <Item onClick={assignToMe}>Assign to me</Item>}
          <li role="separator" className="my-1 border-t border-line" />
          <Item onClick={run(() => copy(link, 'Task link copied.'))}>Copy link</Item>
          <Item onClick={run(() => copy(keyOf(task.id), `${keyOf(task.id)} copied.`))} hint={keyOf(task.id)}>Copy key</Item>
          <li role="separator" className="my-1 border-t border-line" />
          <Item onClick={toggleFlag}>{flagged ? 'Remove flag' : 'Add flag'}</Item>
          {onOpen && <Item onClick={run(onOpen)}>Open task</Item>}
          {onDelete && <><li role="separator" className="my-1 border-t border-line" /><Item danger onClick={run(onDelete)}>Delete</Item></>}
        </ul>
      )}
    </div>
  );
}
