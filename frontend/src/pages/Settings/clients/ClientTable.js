import React, { useState } from 'react';
import { Button, Chip, EmptyRow, Input, Switch, Table, TableWrap, Td, Th } from '../../../ui';

const fmtHours = (h) => (Number(h) ? `${Number(h).toLocaleString('en-IN', { maximumFractionDigits: 1 })} h` : '—');
const fmtDate = (v) => { const d = new Date(v); return v && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// The client list with inline rename and an on/off switch per client.
export default function ClientTable({ rows, busyId, onRename, onToggle, emptyText }) {
  const [editing, setEditing] = useState(null);
  const save = async (client) => { if (await onRename(client, editing.name)) setEditing(null); };

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr><Th>Client</Th><Th align="right">Tasks</Th><Th align="right">Hours</Th><Th>Last task</Th><Th align="center">Active</Th><Th><span className="sr-only">Actions</span></Th></tr>
        </thead>
        <tbody>
          {rows.map((client, i) => {
            const isEditing = editing?.id === client.id;
            return (
              <tr key={client.id} className={`border-t border-line transition-colors hover:bg-subtle/60 motion-safe:animate-fade-in ${client.is_active ? '' : 'opacity-60'}`} style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}>
                <Td>
                  {isEditing ? (
                    <div className="flex flex-col gap-1">
                      <Input aria-label={`New name for ${client.name}`} autoFocus maxLength={255} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(client); if (e.key === 'Escape') setEditing(null); }} />
                      {client.task_count > 0 && <span className="text-xs text-muted">Also renames it on {client.task_count} {client.task_count === 1 ? 'task' : 'tasks'}.</span>}
                    </div>
                  ) : (
                    <span className="flex items-center gap-2.5">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${client.is_active ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>{initials(client.name)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{client.name}</span>
                        <span className="block text-xs text-muted">{client.source === 'task' ? 'Found on tasks' : `Added ${fmtDate(client.created_at)}`}</span>
                      </span>
                      {!client.is_active && <Chip>Off</Chip>}
                    </span>
                  )}
                </Td>
                <Td align="right" mono>{client.task_count ? <>{client.task_count}{client.open_tasks > 0 && <span className="block text-[11px] font-sans text-muted">{client.open_tasks} open</span>}</> : '—'}</Td>
                <Td align="right" mono>{fmtHours(client.hours)}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(client.last_used)}</Td>
                <Td align="center"><span className="inline-flex"><Switch checked={client.is_active} disabled={busyId === client.id} onChange={() => onToggle(client)} label={`${client.name} active`} /></span></Td>
                <Td align="right" className="whitespace-nowrap">
                  {isEditing ? (
                    <><Button size="sm" variant="primary" disabled={busyId === client.id || !editing.name.trim()} onClick={() => save(client)}>Save</Button>{' '}
                      <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button></>
                  ) : <Button size="sm" variant="ghost" onClick={() => setEditing({ id: client.id, name: client.name })}>Rename</Button>}
                </Td>
              </tr>
            );
          })}
          {!rows.length && <EmptyRow colSpan={6}>{emptyText}</EmptyRow>}
        </tbody>
      </Table>
    </TableWrap>
  );
}
