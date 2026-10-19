import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../services/api';
import { notify } from '../../services/feedback';
import { Modal, StatusChip, FieldError, cls, fmtDate, fmtHours, errorOf, fieldsOf } from './shared';

function LockBanner({ entry, isAdmin, onRequest }) {
  const pending = entry.unlock_requests?.find((request) => request.status === 'PENDING');
  const base = 'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm';
  if (entry.status === 'DRAFT') return <div className={`${base} bg-slate-100 text-slate-700`}>Draft. The {entry.lock_days}-day edit window starts when it is submitted.</div>;
  if (entry.lock.unlocked_until) return <div className={`${base} bg-blue-50 text-blue-900`}>Unlocked by admin until <b>{fmtDate(entry.lock.unlocked_until)}</b>. Make your changes before then.</div>;
  if (entry.lock.locked && isAdmin) return <div className={`${base} bg-blue-50 text-blue-900`}>Locked for the team since {fmtDate(entry.lock.editable_until)}. You can still edit it as admin.</div>;
  if (entry.lock.locked) {
    return (
      <div className={`${base} bg-amber-50 text-amber-900`}>
        <span><b>Locked.</b> The edit window closed on <b>{fmtDate(entry.lock.editable_until)}</b>. Talk to your admin to make changes.</span>
        {pending ? <span className="text-xs">Unlock request sent on {fmtDate(pending.created_on)}. Waiting for admin.</span>
          : entry.can_request_unlock && <button type="button" className={cls.small} onClick={onRequest}>Request unlock</button>}
      </div>
    );
  }
  return <div className={`${base} bg-emerald-50 text-emerald-900`}>Editable until <b>{fmtDate(entry.lock.editable_until)}</b> ({entry.lock_days} days after submission).</div>;
}

export default function EntryDetailModal({ id, config, onClose, onChanged, onEdit }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState({ user_id: String(config.user_id), work_date: config.today, hours: '', note: '' });
  const [logErrors, setLogErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try { setEntry((await timesheet.entry(id)).data); setError(''); }
    catch (err) { setError(errorOf(err, 'Could not load this entry.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, success) => {
    setBusy(true);
    try { await fn(); if (success) notify(success, 'success'); await load(); onChanged(); return true; }
    catch (err) { notify(errorOf(err, 'Could not complete that action.')); return false; }
    finally { setBusy(false); }
  };

  const addLog = async (event) => {
    event.preventDefault();
    const hours = Number(log.hours);
    if (!(hours > 0 && hours <= 24)) { setLogErrors({ hours: 'Hours must be more than 0 and at most 24.' }); return; }
    setBusy(true);
    try {
      await timesheet.addLog(id, { ...log, user_id: config.permissions.log_for_others ? log.user_id : config.user_id });
      notify(`${fmtHours(hours)} h added.`, 'success');
      setLog((prev) => ({ ...prev, hours: '', note: '' })); setLogErrors({});
      await load(); onChanged();
    } catch (err) { setLogErrors(fieldsOf(err)); notify(errorOf(err, 'Could not add time.')); }
    finally { setBusy(false); }
  };

  const sendUnlock = async () => {
    if (!reason.trim()) { setReasonError('Write a short reason so the admin knows what will change.'); return; }
    if (await act(() => timesheet.requestUnlock(id, reason.trim()), 'Unlock request sent to admin.')) { setUnlockOpen(false); setReason(''); }
  };

  if (error) return <Modal title="Timesheet entry" onClose={onClose}><p role="alert" className="text-red-700">{error}</p></Modal>;
  if (!entry) return <Modal title="Timesheet entry" onClose={onClose}><p role="status" className="text-slate-500">Loading entry...</p></Modal>;

  const field = (label, value) => <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-sm text-slate-900">{value || '—'}</dd></div>;
  const footer = <>
    {entry.can_edit && <button type="button" className={cls.button} onClick={() => onEdit(entry)}>Edit details</button>}
    {entry.status === 'DRAFT' && entry.can_edit && <button type="button" className={cls.primary} disabled={busy} onClick={() => act(() => timesheet.submit(id), 'Submitted.')}>Submit draft</button>}
    {entry.can_delete && (confirmDelete
      ? <span className="flex items-center gap-2 text-sm">Delete this entry?
          <button type="button" className={cls.danger} disabled={busy} onClick={async () => { if (await act(() => timesheet.remove(id), 'Entry deleted.')) onClose(); }}>Yes, delete</button>
          <button type="button" className={cls.small} onClick={() => setConfirmDelete(false)}>No</button></span>
      : <button type="button" className={cls.danger} onClick={() => setConfirmDelete(true)}>Delete</button>)}
    <span className="flex-1" />
    <button type="button" className={cls.button} onClick={onClose}>Close</button>
  </>;

  return (
    <Modal title={`${entry.client_name} · ${entry.job_type || 'Draft'}`} onClose={onClose} footer={footer} wide>
      <LockBanner entry={entry} isAdmin={config.permissions.bypass_lock} onRequest={() => setUnlockOpen(true)} />
      {unlockOpen && (
        <div className="mb-4 rounded-lg border border-amber-200 p-4">
          <label htmlFor="ts-unlock-reason" className={cls.label}>Why do you need to change it?</label>
          <textarea id="ts-unlock-reason" rows={3} maxLength={1000} className={`${cls.input} mt-1`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Client sent extra invoices, count needs updating" />
          <FieldError text={reasonError} />
          <div className="mt-2 flex gap-2"><button type="button" className={cls.primary} disabled={busy} onClick={sendUnlock}>Send to admin</button><button type="button" className={cls.button} onClick={() => setUnlockOpen(false)}>Cancel</button></div>
        </div>
      )}
      <dl className="mb-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
        {field('Client', entry.client_name)}{field('Job Type', entry.job_type)}{field('Work Type', entry.work_type)}
        {field('Date worked', fmtDate(entry.date_worked))}{field('Agent', entry.agent_name)}{field('Period', entry.period_type && `${entry.period_type} · ended ${fmtDate(entry.period_ended)}`)}
        {field('Registration Status', entry.registration_status)}{field('Count', entry.count_type && `${entry.count_number ?? '—'} ${entry.count_type}`)}
        {field('Status', <StatusChip entry={entry} />)}
      </dl>
      {entry.description && <p className="mb-5 text-sm text-slate-700"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>{entry.description}</p>}
      <section className={cls.card}>
        <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-semibold">Who spent how much time</h3><span className="text-sm"><b>{fmtHours(entry.total_hours)}</b> hours total</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr><th className={cls.th}>Person</th><th className={cls.th}>Date</th><th className={`${cls.th} text-right`}>Hours</th><th className={cls.th}>Note</th><th className={cls.th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {entry.logs.map((row) => <tr key={row.id} className="border-t">
              <td className={cls.td}>{row.user_name}</td><td className={cls.td}>{fmtDate(row.work_date)}</td><td className={`${cls.td} text-right tabular-nums`}>{fmtHours(row.hours)}</td>
              <td className={cls.td}>{row.note || <span className="text-slate-400">—</span>}</td>
              <td className={`${cls.td} text-right`}>{row.can_remove && <button type="button" className={cls.danger} disabled={busy} onClick={() => act(() => timesheet.removeLog(id, row.id), 'Time removed.')}>Remove</button>}</td>
            </tr>)}
            {!entry.logs.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">No time logged yet.</td></tr>}
            <tr className="border-t bg-slate-50 font-semibold"><td className={cls.td}>Total</td><td /><td className={`${cls.td} text-right tabular-nums`}>{fmtHours(entry.total_hours)}</td><td colSpan={2} /></tr>
          </tbody>
        </table></div>
        <div className="border-t p-4">
          {entry.can_log ? (
            <form onSubmit={addLog} className="grid grid-cols-2 gap-2 md:grid-cols-[1.3fr_1fr_0.7fr_1.6fr_auto]">
              <select aria-label="Person" className={cls.input} value={log.user_id} disabled={!config.permissions.log_for_others} onChange={(event) => setLog({ ...log, user_id: event.target.value })}>
                {config.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <input aria-label="Date" type="date" max={config.today} className={cls.input} value={log.work_date} onChange={(event) => setLog({ ...log, work_date: event.target.value })} />
              <input aria-label="Hours" type="number" min="0.25" max="24" step="0.25" placeholder="Hours" className={cls.input} value={log.hours} onChange={(event) => setLog({ ...log, hours: event.target.value })} />
              <input aria-label="Note" maxLength={500} placeholder="What was done (optional)" className={cls.input} value={log.note} onChange={(event) => setLog({ ...log, note: event.target.value })} />
              <button type="submit" className={cls.primary} disabled={busy}>+ Add Time</button>
              <div className="col-span-2 md:col-span-5"><FieldError text={logErrors.hours || logErrors.work_date || logErrors.user_id || logErrors.note} /></div>
            </form>
          ) : <p className="text-sm text-slate-500">Adding time is closed because this entry is locked.</p>}
        </div>
      </section>
    </Modal>
  );
}
