import React, { useState } from 'react';
import api from '../../services/api';
export default function RecurrenceControl({ task, enabled, disabled, onUpdate }) {
  const [interval, setInterval] = useState(task.repeat_interval || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <section className="border-t pt-3 text-sm"><h4 className="font-semibold">Repeat after completion</h4>
    <p className="my-1 text-xs text-slate-500">Creates one open successor after completion. Dates advance from the later of the due date or completion day. Checklist and workflow reset.</p>
    {!enabled && <p className="my-2 text-xs text-amber-700">Recurring worker is not enabled on this server. Ask your administrator before relying on automatic repeats.</p>}
    <div className="flex gap-2"><select disabled={disabled || busy} aria-label="Repeat interval" value={interval} onChange={e => setInterval(e.target.value)} className="rounded-lg border p-2"><option value="">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select><button disabled={disabled || busy} className="rounded-lg border px-3 py-2" onClick={async () => { setBusy(true); setError(''); try { const result = await api.put(`/task-recurrence/${task.id}`, { interval, version: task.version }); onUpdate({ ...task, repeat_interval: interval || null, version: result.data.version }); } catch (err) { setError(err.response?.data?.error || 'Could not save recurrence.'); } finally { setBusy(false); } }}>Save repeat</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
