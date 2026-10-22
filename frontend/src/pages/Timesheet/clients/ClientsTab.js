import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Card, Chip, EmptyRow, FieldError, Hint, Input, Table, TableWrap, Td, Th } from '../../../ui';
import { errorOf, fmtHours } from '../format';

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

  const rename = async (client) => {
    if (await run(() => timesheet.updateClient(client.id, { name: editing.name.trim() }), 'Client renamed.')) setEditing(null);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="h-fit p-4">
        <form onSubmit={add}>
          <h3 className="mb-2 text-[15px] font-semibold">Add a client</h3>
          <label htmlFor="ts-client-name" className="sr-only">Client name</label>
          <Input id="ts-client-name" maxLength={255} placeholder="Client name, e.g. Riverside Motors" value={name} onChange={(event) => setName(event.target.value)} />
          <FieldError text={nameError} />
          <Button type="submit" variant="primary" className="mt-3" disabled={busy}>Add client</Button>
          <Hint>Only managers and admins see this tab. Employees pick from this list and cannot type a new client name.</Hint>
          <p className="mt-3 rounded-md bg-subtle px-3 py-2 text-xs text-muted">Client names typed on tasks are added here automatically and marked <strong>From tasks</strong>. Deactivate any you don't want in the timesheet.</p>
        </form>
      </Card>
      <TableWrap>
        <Table>
          <thead><tr><Th>Client</Th><Th align="right">Entries</Th><Th align="right">Hours</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {!clients && <EmptyRow colSpan={5}><span role="status">Loading clients...</span></EmptyRow>}
            {clients?.map((client) => {
              const isEditing = editing?.id === client.id;
              return (
                <tr key={client.id}>
                  <Td>
                    {isEditing
                      ? <Input aria-label="New client name" autoFocus maxLength={255} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                      : <span className="font-semibold">{client.name}{client.source === 'task' && <span className="ml-2 align-middle"><Chip tone="info">From tasks</Chip></span>}</span>}
                  </Td>
                  <Td align="right" mono>{client.entry_count}</Td>
                  <Td align="right" mono>{fmtHours(client.total_hours)}</Td>
                  <Td>{client.is_active ? <Chip tone="ok">Active</Chip> : <Chip>Inactive</Chip>}</Td>
                  <Td align="right" className="whitespace-nowrap">
                    {isEditing ? <>
                      <Button size="sm" variant="primary" disabled={busy || !editing.name.trim()} onClick={() => rename(client)}>Save</Button>{' '}
                      <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    </> : <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: client.id, name: client.name })}>Rename</Button>{' '}
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => run(() => timesheet.updateClient(client.id, { is_active: !client.is_active }), client.is_active ? `${client.name} deactivated.` : `${client.name} activated.`)}>
                        {client.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>}
                  </Td>
                </tr>
              );
            })}
            {clients && !clients.length && <EmptyRow colSpan={5}>No clients yet. Add the first one on the left.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
