import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { Button, EmptyRow, Table, TableWrap, Td, Th } from '../../ui';
import { Person, dateLabel } from './adminShared';
import AddAdminModal from './orgs/AddAdminModal';
import { RemoveAdminModal, ResetPasswordModal } from './orgs/OrgModals';

// Company admins: every organization admin in one list, with the same easy add, reset and remove.
export default function AdminsTab({ orgs, onChanged }) {
  const [people, setPeople] = useState([]);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.get('/company-admin/users').then((r) => setPeople(Array.isArray(r.data) ? r.data : [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChanged(); };
  const admins = people.filter((u) => u.role === 'admin');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Admins manage people, teams and settings inside their workspace.</p>
        <Button variant="primary" disabled={!orgs.length} onClick={() => setOpen({ kind: 'add' })}>+ Add admin</Button>
      </div>
      <TableWrap>
        <Table>
          <thead><tr><Th>Admin</Th><Th>Workspace</Th><Th>Since</Th><Th align="right">Actions</Th></tr></thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-subtle">
                <Td className="align-middle"><Person name={a.name} email={a.email} id={a.id} /></Td>
                <Td className="align-middle text-muted">{a.org_name || '—'}</Td>
                <Td className="align-middle text-muted">{dateLabel(a.created_at)}</Td>
                <Td className="align-middle text-right">
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpen({ kind: 'reset', person: a })}>Reset password</Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpen({ kind: 'remove', person: a })} aria-label={`Remove ${a.name} as admin`}>Remove</Button>
                  </span>
                </Td>
              </tr>
            ))}
            {!admins.length && <EmptyRow colSpan={4}>No workspace admins yet. Use “+ Add admin”.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
      {open?.kind === 'add' && <AddAdminModal orgs={orgs} people={people} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.kind === 'reset' && <ResetPasswordModal person={open.person} onClose={() => setOpen(null)} />}
      {open?.kind === 'remove' && <RemoveAdminModal person={open.person} onClose={() => setOpen(null)} onDone={changed} />}
    </div>
  );
}
