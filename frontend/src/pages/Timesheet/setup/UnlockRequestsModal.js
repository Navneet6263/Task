import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Loading, Modal } from '../../../ui';
import { errorOf, fmtDate } from '../format';

export default function UnlockRequestsModal({ config, onClose, onChanged }) {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await timesheet.unlockRequests(status)).data); }
    catch (err) { notify(errorOf(err, 'Could not load unlock requests.')); setRows([]); }
  }, [status]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const decide = async (id, decision) => {
    setBusy(true);
    try {
      const response = await timesheet.decideUnlock(id, decision);
      notify(decision === 'APPROVED' ? `Unlocked until ${fmtDate(response.data.unlocked_until)}.` : 'Request rejected.', 'success');
      await load(); onChanged();
    } catch (err) { notify(errorOf(err, 'Could not save the decision.')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Unlock requests" subtitle="Approve to reopen a locked entry for a few days." onClose={onClose}>
      <div className="mb-3 flex gap-2">
        {[['PENDING', 'Waiting'], ['ALL', 'History']].map(([value, label]) => (
          <Button key={value} size="sm" variant={status === value ? 'primary' : 'secondary'} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</Button>
        ))}
      </div>
      {!rows && <Loading>Loading requests...</Loading>}
      {rows && !rows.length && <p className="py-6 text-center text-sm text-muted">{status === 'PENDING' ? 'No requests are waiting.' : 'No requests yet.'}</p>}
      <div className="flex flex-col gap-3">
        {rows?.map((row) => (
          <article key={row.id} className="rounded-md border border-line p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <b>{row.client_name} · {row.job_type || 'Draft'}</b>
              <span className="font-mono text-xs text-muted">{fmtDate(row.created_on)}</span>
            </div>
            <p className="mt-1 text-sm">{row.requested_by_name}: “{row.reason}”</p>
            {row.status === 'PENDING' ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(row.id, 'APPROVED')}>Approve (unlock {config.settings.unlock_days} days)</Button>
                <Button size="sm" disabled={busy} onClick={() => decide(row.id, 'REJECTED')}>Reject</Button>
              </div>
            ) : <p className="mt-2 text-xs text-muted">{row.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {row.decided_by_name || 'admin'} on {fmtDate(row.decided_on)}</p>}
          </article>
        ))}
      </div>
    </Modal>
  );
}
