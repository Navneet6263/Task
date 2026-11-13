import React, { useCallback, useEffect, useState } from 'react';
import api, { setAccessRole } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, EmptyRow, Input, Modal, Segmented, Select, Table, TableWrap, Td, Th } from '../../ui';
import { Person, ROLE_LABEL, ROLE_TONE, dateLabel, errorOf, lastSeen } from './adminShared';
import LeadTeamsModal from '../TeamManagement/LeadTeamsModal';
import { ResetPasswordModal } from './orgs/OrgModals';

const ROLES = [['', 'Everyone'], ['admin', 'Admins'], ['manager', 'Managers'], ['person', 'Members']];
const PAGE = 50;

// People in the organization(s): search, filter by role, change roles, remove accounts.
export default function UsersTab({ isCompanyAdmin, orgs, initialOrg = '', selfId, onChanged }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [org, setOrg] = useState(initialOrg);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [leading, setLeading] = useState(null); // { person, role }: choosing the teams a manager leads
  const [password, setPassword] = useState(null); // the person whose password is being changed

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isCompanyAdmin) {
        const r = await api.get('/company-admin/users', { params: org ? { org_id: org } : {} });
        const all = Array.isArray(r.data) ? r.data : r.data?.data || [];
        const needle = query.toLowerCase();
        const shown = all.filter((u) => (!role || u.role === role) && (!needle || `${u.name} ${u.email} ${u.employee_id || ''}`.toLowerCase().includes(needle)));
        setRows(shown); setTotal(shown.length);
      } else {
        const r = await api.get('/admin/users', { params: { page, limit: PAGE, ...(query ? { q: query } : {}), ...(role ? { role } : {}) } });
        setRows(r.data.data || []); setTotal(r.data.pagination?.total || 0);
      }
    } catch (err) { notify(errorOf(err, 'Could not load people.')); }
    finally { setLoading(false); }
  }, [isCompanyAdmin, org, query, role, page]);
  useEffect(() => { load(); }, [load]);

  const saveRole = async (person, next, leadTeamIds) => {
    await setAccessRole(isCompanyAdmin, person.id, next, leadTeamIds);
    notify(next === person.role ? `Teams for ${person.name} saved.` : `${person.name} is now ${ROLE_LABEL[next].toLowerCase()}.`, 'success');
    setLeading(null); load(); onChanged();
  };
  // Making someone a manager or admin asks which teams they lead; making them a member ends their leads.
  const changeRole = async (person, next) => {
    if (next !== 'person' && person.role === 'person') { setLeading({ person, role: next }); return; }
    const leads = (person.leads || []).map((t) => t.name).join(', ');
    if (next === 'person' && leads && !window.confirm(`${person.name} will stop leading ${leads}. Continue?`)) return;
    try { await saveRole(person, next); }
    catch (err) { notify(errorOf(err, 'Could not change the role.')); }
  };
  const remove = async () => {
    const person = confirm;
    try {
      await api.delete(isCompanyAdmin ? `/company-admin/users/${person.id}` : `/admin/users/${person.id}`);
      notify(`${person.name} was removed.`, 'success'); setConfirm(null); load(); onChanged();
    } catch (err) { notify(errorOf(err, 'Could not remove this person.')); }
  };
  const pages = isCompanyAdmin ? 1 : Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search people" placeholder="Search name, email or employee ID" className="min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented label="Role" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={ROLES} />
        {isCompanyAdmin && orgs.length > 1 && (
          <Select aria-label="Workspace" className="!w-auto" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">All workspaces</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        )}
      </div>
      <p className="text-xs text-muted">{loading ? 'Loading…' : `${total} ${total === 1 ? 'person' : 'people'}`}. Admins manage everything, managers lead the teams you give them, members work on tasks.</p>
      <TableWrap>
        <Table>
          <thead><tr><Th>Person</Th>{isCompanyAdmin && <Th>Workspace</Th>}<Th>Role</Th><Th>Leads</Th><Th>Employee ID</Th><Th>Joined</Th>{!isCompanyAdmin && <Th>Last active</Th>}<Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {rows.map((person) => {
              const self = Number(person.id) === Number(selfId);
              return (
                <tr key={person.id} className="group hover:bg-subtle">
                  <Td className="align-middle"><Person name={person.name} email={person.email} id={person.id} /></Td>
                  {isCompanyAdmin && <Td className="align-middle text-muted">{person.org_name || '—'}</Td>}
                  <Td className="align-middle">
                    {self ? <span className="flex items-center gap-2"><Chip tone={ROLE_TONE[person.role]}>{ROLE_LABEL[person.role] || person.role}</Chip><span className="text-xs text-muted">You</span></span> : (
                      <Select aria-label={`Role of ${person.name}`} className="!w-auto py-1 text-xs" value={person.role} onChange={(e) => changeRole(person, e.target.value)}>
                        <option value="person">Member</option><option value="manager">Manager</option><option value="admin">Admin</option>
                      </Select>
                    )}
                  </Td>
                  <Td className="align-middle">
                    <span className="flex flex-wrap items-center gap-1">
                      {(person.leads || []).map((t) => <Chip key={t.id} tone="ok">{t.name}</Chip>)}
                      {!self && person.role !== 'person' && <Button size="sm" variant="ghost" onClick={() => setLeading({ person, role: person.role })}>{person.leads?.length ? 'Change' : '+ Team'}</Button>}
                      {person.role === 'person' && <span className="text-xs text-muted">—</span>}
                    </span>
                  </Td>
                  <Td className="align-middle font-mono text-xs">{person.employee_id || '—'}</Td>
                  <Td className="whitespace-nowrap align-middle text-muted">{dateLabel(person.created_at)}</Td>
                  {!isCompanyAdmin && <Td className={`whitespace-nowrap align-middle ${lastSeen(person.last_active) === 'Online now' ? 'font-semibold text-accent' : 'text-muted'}`}>{lastSeen(person.last_active)}</Td>}
                  <Td align="right" className="whitespace-nowrap align-middle">{!self && (
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPassword(person)} aria-label={`Change ${person.name}’s password`}>Password</Button>
                      <Button size="sm" variant="danger" className="opacity-60 group-hover:opacity-100" onClick={() => setConfirm(person)}>Remove</Button>
                    </span>
                  )}</Td>
                </tr>
              );
            })}
            {!loading && !rows.length && <EmptyRow colSpan={8}>No one matches these filters.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="font-mono text-xs text-muted">{page} / {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {password && <ResetPasswordModal person={password} endpoint={isCompanyAdmin ? `/company-admin/users/${password.id}/reset-password` : `/admin/users/${password.id}/reset-password`} onClose={() => setPassword(null)} />}
      {leading && <LeadTeamsModal person={leading.person} role={leading.role} onClose={() => setLeading(null)} onSave={(ids) => saveRole(leading.person, leading.role, ids)} />}
      {confirm && (
        <Modal title={`Remove ${confirm.name}?`} onClose={() => setConfirm(null)}
          footer={<><span className="flex-1" /><Button onClick={() => setConfirm(null)}>Keep</Button><Button variant="danger" className="!border-danger/40" onClick={remove}>Remove account</Button></>}>
          <p className="text-sm">{confirm.name} ({confirm.email}) will no longer be able to sign in. Their tasks and history stay in place.</p>
        </Modal>
      )}
    </div>
  );
}
