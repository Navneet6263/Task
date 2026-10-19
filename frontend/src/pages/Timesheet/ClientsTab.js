import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../services/api';
import { notify } from '../../services/feedback';
import { FieldError, cls, fmtHours, errorOf } from './shared';

export default function ClientsTab({ onChanged }) {
  const [clients, setClients] = useState(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setClients((await timesheet.clients()).data); }
    catch (err) { notify(errorOf(err, 'Could not load clients.')); setClients([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, success) => {
    setBusy(true);
    try { await fn(); notify(success, 'success'); await load(); onChanged(); return true; }
    catch (err) { notify(errorOf(err, 'Could not save the client.')); return false; }
    finally { setBusy(false); }
  };

  const add = async (event) => {
    event.preventDefault();
    if (!name.trim()) { setNameError('Type the client name first.'); return; }
    setNameError('');
    if (await run(() => timesheet.createClient(name.trim()), `${name.trim()} added. It now shows in the timesheet form.`)) setName('');
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={add} className={`${cls.card} h-fit p-4`}>
        <h3 className="mb-2 font-semibold">Add a client</h3>
        <label htmlFor="ts-client-name" className="sr-only">Client name</label>
        <input id="ts-client-name" maxLength={255} className={cls.input} placeholder="Client name, e.g. Riverside Motors" value={name} onChange={(event) => setName(event.target.value)} />
        <FieldError text={nameError} />
        <button type="submit" className={`${cls.primary} mt-3`} disabled={busy}>Add client</button>
        <p className="mt-3 text-xs text-slate-500">Only managers and admins see this tab. Employees pick from this list and cannot type a new client name.</p>
      </form>
      <div className={`${cls.card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr><th className={cls.th}>Client</th><th className={`${cls.th} text-right`}>Entries</th><th className={`${cls.th} text-right`}>Hours</th><th className={cls.th}>Status</th><th className={cls.th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!clients && <tr><td colSpan={5} className="p-6 text-center text-slate-500" role="status">Loading clients...</td></tr>}
            {clients?.map((client) => (
              <tr key={client.id} className="border-t">
                <td className={cls.td}>
                  {editing?.id === client.id
                    ? <input aria-label="New client name" autoFocus maxLength={255} className={cls.input} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                    : <span className="font-medium">{client.name}</span>}
                </td>
                <td className={`${cls.td} text-right tabular-nums`}>{client.entry_count}</td>
                <td className={`${cls.td} text-right tabular-nums`}>{fmtHours(client.total_hours)}</td>
                <td className={cls.td}>{client.is_active ? <span className="text-emerald-700">Active</span> : <span className="text-slate-500">Inactive</span>}</td>
                <td className={`${cls.td} whitespace-nowrap text-right`}>
                  {editing?.id === client.id ? <>
                    <button type="button" className={cls.small} disabled={busy || !editing.name.trim()} onClick={async () => { if (await run(() => timesheet.updateClient(client.id, { name: editing.name.trim() }), 'Client renamed.')) setEditing(null); }}>Save</button>{' '}
                    <button type="button" className={cls.small} onClick={() => setEditing(null)}>Cancel</button>
                  </> : <>
                    <button type="button" className={cls.small} onClick={() => setEditing({ id: client.id, name: client.name })}>Rename</button>{' '}
                    <button type="button" className={cls.small} disabled={busy} onClick={() => run(() => timesheet.updateClient(client.id, { is_active: !client.is_active }), client.is_active ? `${client.name} deactivated.` : `${client.name} activated.`)}>
                      {client.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </>}
                </td>
              </tr>
            ))}
            {clients && !clients.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No clients yet. Add the first one on the left.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
