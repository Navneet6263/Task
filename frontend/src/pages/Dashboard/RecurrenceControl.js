import React, { useState } from 'react';
import api from '../../services/api';
import { Button, ErrorText, Select } from '../../ui';

export default function RecurrenceControl({ task, enabled, disabled, onUpdate }) {
  const [interval, setInterval] = useState(task.repeat_interval || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.put(`/task-recurrence/${task.id}`, { interval, version: task.version });
      onUpdate({ ...task, repeat_interval: interval || null, version: result.data.version });
    } catch (err) { setError(err.response?.data?.error || 'Could not save recurrence.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="border-t border-line pt-3 text-sm">
      <h4 className="font-semibold">Repeat after completion</h4>
      <p className="my-1 text-xs text-muted">Creates one open successor after completion. Dates advance from the later of the due date or completion day. Checklist and workflow reset.</p>
      {!enabled && <p className="my-2 text-xs text-warn">Recurring worker is not enabled on this server. Ask your administrator before relying on automatic repeats.</p>}
      <div className="flex gap-2">
        <Select disabled={disabled || busy} aria-label="Repeat interval" className="!w-auto" value={interval} onChange={(event) => setInterval(event.target.value)}>
          <option value="">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
        </Select>
        <Button disabled={disabled || busy} onClick={save}>Save repeat</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
