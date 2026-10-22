import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, ErrorText, FieldError, Loading, Modal, Textarea } from '../../../ui';
import { errorOf, fmtDate } from '../format';
import StatusChip from './StatusChip';
import LockBanner from './LockBanner';
import TimeLogSection from './TimeLogSection';

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children || '—'}</dd>
    </div>
  );
}

export default function EntryDetailModal({ id, config, onClose, onChanged, onEdit }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState('');
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

  const sendUnlock = async () => {
    if (!reason.trim()) { setReasonError('Write a short reason so the admin knows what will change.'); return; }
    if (await act(() => timesheet.requestUnlock(id, reason.trim()), 'Unlock request sent to admin.')) { setUnlockOpen(false); setReason(''); }
  };

  if (error) return <Modal title="Timesheet entry" onClose={onClose}><ErrorText>{error}</ErrorText></Modal>;
  if (!entry) return <Modal title="Timesheet entry" onClose={onClose}><Loading>Loading entry...</Loading></Modal>;

  const footer = <>
    {entry.can_edit && <Button onClick={() => onEdit(entry)}>Edit details</Button>}
    {entry.status === 'DRAFT' && entry.can_edit && <Button variant="primary" disabled={busy} onClick={() => act(() => timesheet.submit(id), 'Submitted.')}>Submit draft</Button>}
    {entry.can_delete && (confirmDelete
      ? <span className="flex items-center gap-2 text-sm">Delete this entry?
          <Button variant="danger" size="sm" disabled={busy} onClick={async () => { if (await act(() => timesheet.remove(id), 'Entry deleted.')) onClose(); }}>Yes, delete</Button>
          <Button size="sm" onClick={() => setConfirmDelete(false)}>No</Button></span>
      : <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>)}
    <span className="flex-1" />
    <Button onClick={onClose}>Close</Button>
  </>;

  return (
    <Modal title={`${entry.client_name} · ${entry.job_type || 'Draft'}`} subtitle={`Created by ${entry.created_by_name || '—'}`} onClose={onClose} footer={footer} size="lg">
      <LockBanner entry={entry} isAdmin={config.permissions.bypass_lock} onRequest={() => setUnlockOpen(true)} />
      {unlockOpen && (
        <div className="mb-4 rounded-md border border-warn/40 p-4">
          <label htmlFor="ts-unlock-reason" className="text-xs font-medium text-muted">Why do you need to change it?</label>
          <Textarea id="ts-unlock-reason" rows={3} maxLength={1000} className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Client sent extra invoices, count needs updating" />
          <FieldError text={reasonError} />
          <div className="mt-2 flex gap-2"><Button variant="primary" disabled={busy} onClick={sendUnlock}>Send to admin</Button><Button onClick={() => setUnlockOpen(false)}>Cancel</Button></div>
        </div>
      )}
      <dl className="mb-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Detail label="Client">{entry.client_name}</Detail>
        <Detail label="Task">{entry.task_id ? <a className="font-medium text-accent hover:underline" href={`/dashboard?task=${entry.task_id}`}>#{entry.task_id} · {entry.task_title}</a> : 'Not linked'}</Detail>
        <Detail label="Job Type">{entry.job_type}</Detail>
        <Detail label="Work Type">{entry.work_type}</Detail>
        <Detail label="Date worked"><span className="font-mono">{fmtDate(entry.date_worked)}</span></Detail>
        <Detail label="Agent">{entry.agent_name}</Detail>
        <Detail label="Period">{entry.period_type && <>{entry.period_type} · ended <span className="font-mono">{fmtDate(entry.period_ended)}</span></>}</Detail>
        <Detail label="Registration Status">{entry.registration_status}</Detail>
        <Detail label="Count">{entry.count_type && <><span className="font-mono">{entry.count_number ?? '—'}</span> {entry.count_type}</>}</Detail>
        <Detail label="Status"><StatusChip entry={entry} /></Detail>
      </dl>
      {entry.description && <div className="mb-5"><Detail label="Description">{entry.description}</Detail></div>}
      <TimeLogSection entry={entry} config={config} busy={busy} onRemove={(logId) => act(() => timesheet.removeLog(id, logId), 'Time removed.')}
        onAdded={async () => { await load(); onChanged(); }} />
    </Modal>
  );
}
