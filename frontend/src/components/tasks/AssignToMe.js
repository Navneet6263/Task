import React, { useState } from 'react';
import { tasks as tasksApi } from '../../services/api';
import { notify } from '../../services/feedback';

const me = () => { try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}'); } catch { return {}; } };

// Shown when the task is open and not already yours.
export const canTake = (task) => Boolean(task) && Boolean(me().id) && task.status !== 'DONE' && Number(task.assigned_to) !== Number(me().id);

// "Assign to me" in one click, right on the card or row (it used to sit inside the "…" menu).
// The server still checks that you are in the task's team.
export default function AssignToMe({ task, onDone, className = '' }) {
  const [busy, setBusy] = useState(false);
  if (!canTake(task)) return null;
  const take = async (event) => {
    event.stopPropagation();
    setBusy(true);
    try {
      await tasksApi.update(task.id, { assigned_to: me().id, version: task.version });
      notify(`"${task.title}" is now yours.`, 'success');
      onDone?.();
    } catch (err) {
      notify(err.response?.status === 409 ? 'This task changed just now. Refresh and try again.' : err.response?.data?.error || 'Could not assign the task to you.');
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={take} onMouseDown={(e) => e.stopPropagation()} disabled={busy} draggable={false}
      className={`shrink-0 rounded-md border border-accent/40 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-60 ${className}`}>
      {busy ? 'Assigning…' : 'Assign to me'}
    </button>
  );
}
