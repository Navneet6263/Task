import React, { useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Card, CardHeader, EmptyRow, FieldError, Input, Select, Table, Td, Th } from '../../../ui';
import { errorOf, fieldsOf, fmtDate, fmtHours } from '../format';

// "Who spent how much time" table plus the Add Time form.
export default function TimeLogSection({ entry, config, busy, onRemove, onAdded }) {
  const [log, setLog] = useState({ user_id: String(config.user_id), work_date: config.today, hours: '', note: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const canPickPerson = config.permissions.log_for_others;

  const add = async (event) => {
    event.preventDefault();
    const hours = Number(log.hours);
    if (!(hours > 0 && hours <= 24)) { setErrors({ hours: 'Hours must be more than 0 and at most 24.' }); return; }
    setSaving(true);
    try {
      await timesheet.addLog(entry.id, { ...log, user_id: canPickPerson ? log.user_id : config.user_id });
      notify(`${fmtHours(hours)} h added.`, 'success');
      setLog((prev) => ({ ...prev, hours: '', note: '' })); setErrors({});
      onAdded();
    } catch (err) { setErrors(fieldsOf(err)); notify(errorOf(err, 'Could not add time.')); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader title="Who spent how much time" aside={<><b className="font-mono text-ink">{fmtHours(entry.total_hours)}</b> hours total</>} />
      <div className="overflow-x-auto">
        <Table>
          <thead><tr><Th>Person</Th><Th>Date</Th><Th align="right">Hours</Th><Th>Note</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {entry.logs.map((row) => (
              <tr key={row.id}>
                <Td>{row.user_name}</Td><Td mono>{fmtDate(row.work_date)}</Td><Td align="right" mono>{fmtHours(row.hours)}</Td>
                <Td>{row.note || <span className="text-muted">—</span>}</Td>
                <Td align="right">{row.can_remove && <Button variant="danger" size="sm" disabled={busy} onClick={() => onRemove(row.id)}>Remove</Button>}</Td>
              </tr>
            ))}
            {!entry.logs.length && <EmptyRow colSpan={5}>No time logged yet.</EmptyRow>}
            <tr className="bg-subtle font-semibold">
              <Td>Total</Td><Td /><Td align="right" mono>{fmtHours(entry.total_hours)}</Td><Td /><Td />
            </tr>
          </tbody>
        </Table>
      </div>
      <div className="border-t border-line p-4">
        {entry.can_log ? (
          <form onSubmit={add} className="grid grid-cols-2 gap-2 md:grid-cols-[1.3fr_1fr_0.7fr_1.6fr_auto]">
            <Select aria-label="Person" value={log.user_id} disabled={!canPickPerson} onChange={(event) => setLog({ ...log, user_id: event.target.value })}>
              {config.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
            <Input aria-label="Date" type="date" max={config.today} value={log.work_date} onChange={(event) => setLog({ ...log, work_date: event.target.value })} />
            <Input aria-label="Hours" type="number" min="0.25" max="24" step="0.25" placeholder="Hours" value={log.hours} onChange={(event) => setLog({ ...log, hours: event.target.value })} />
            <Input aria-label="Note" maxLength={500} placeholder="What was done (optional)" value={log.note} onChange={(event) => setLog({ ...log, note: event.target.value })} />
            <Button type="submit" variant="primary" disabled={saving || busy}>+ Add Time</Button>
            <div className="col-span-2 md:col-span-5"><FieldError text={errors.hours || errors.work_date || errors.user_id || errors.note} /></div>
          </form>
        ) : <p className="text-sm text-muted">Adding time is closed because this entry is locked.</p>}
      </div>
    </Card>
  );
}
