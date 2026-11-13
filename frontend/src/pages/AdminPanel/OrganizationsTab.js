import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, EmptyState } from '../../ui';
import { Person } from './adminShared';
import AddAdminModal from './orgs/AddAdminModal';
import { EditOrgModal, NewOrgModal, RemoveAdminModal, ResetPasswordModal } from './orgs/OrgModals';

const copy = async (code) => {
  try { await navigator.clipboard.writeText(code); notify(`Copied ${code}.`, 'success'); }
  catch { window.prompt('Copy this company code', code); }
};

function OrgCard({ org, admins, canManage, canEdit, onEdit, onAddAdmin, onReset, onRemove, onViewUsers }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{org.name}</h3>
          <p className="text-xs text-muted">Task numbers: {String(org.task_prefix || String(org.company_code || '').split('-')[1] || 'TASK').toUpperCase()}-142</p>
        </div>
        {org.company_code && (
          <button type="button" onClick={() => copy(org.company_code)} title="Copy the company code people use to join"
            className="shrink-0 rounded-md border border-dashed border-accent/60 bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">{org.company_code}</button>
        )}
        {canEdit && <Button size="sm" onClick={onEdit}>Edit</Button>}
      </div>
      <dl className={`grid ${org.admin_count !== undefined ? 'grid-cols-3' : 'grid-cols-2'} border-b border-line text-center`}>
        {[['People', org.user_count], ['Teams', org.team_count], ...(org.admin_count !== undefined ? [['Admins', org.admin_count]] : [])].map(([label, value]) => (
          <div key={label} className="border-r border-line px-2 py-2.5 last:border-r-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value || 0}</dd>
          </div>
        ))}
      </dl>
      {canManage && (
        <div className="flex flex-1 flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Admins</p>
            <button type="button" onClick={onAddAdmin} className="text-sm font-semibold text-accent hover:underline">+ Add admin</button>
          </div>
          {admins.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1"><Person name={a.name} email={a.email} id={a.id} /></span>
                  <Button size="sm" variant="ghost" onClick={() => onReset(a)}>Reset password</Button>
                  <Button size="sm" variant="ghost" onClick={() => onRemove(a)} aria-label={`Remove ${a.name} as admin`}>Remove</Button>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-md bg-warn-soft px-3 py-2 text-sm">No admin yet. Add one so someone can manage this workspace’s people and teams.</p>}
        </div>
      )}
      {onViewUsers && <div className="border-t border-line px-4 py-3"><Button size="sm" onClick={() => onViewUsers(org.id)}>View everyone</Button></div>}
    </Card>
  );
}

// Company admins: every organization they own. Create, edit, and look after each one's admins from its card.
// canEdit without canCreate: an organization admin, who may rename only their own organization.
export default function OrganizationsTab({ orgs, canCreate, canEdit = canCreate, onChanged, onViewUsers }) {
  const [people, setPeople] = useState([]);
  const [open, setOpen] = useState(null); // { kind, org?, person? }
  const loadPeople = useCallback(() => {
    if (!canCreate) return;
    api.get('/company-admin/users').then((r) => setPeople(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [canCreate]);
  useEffect(() => { loadPeople(); }, [loadPeople, orgs]);
  const changed = () => { onChanged(); loadPeople(); };
  const close = () => setOpen(null);
  const adminsOf = (org) => people.filter((p) => String(p.org_id) === String(org.id) && p.role === 'admin');

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Each workspace has its own people, teams, tasks and company code. Edit one or look after its admins from its card.</p>
          <Button variant="primary" onClick={() => setOpen({ kind: 'new' })}>+ New workspace</Button>
        </div>
      )}
      {!orgs.length && <EmptyState title="No workspaces yet" action={canCreate && <Button variant="primary" onClick={() => setOpen({ kind: 'new' })}>+ New workspace</Button>}>Create your first workspace and its admin in one step.</EmptyState>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {orgs.map((org) => (
          <OrgCard key={org.id} org={org} admins={adminsOf(org)} canManage={canCreate} canEdit={canEdit} onViewUsers={onViewUsers}
            onEdit={() => setOpen({ kind: 'edit', org })} onAddAdmin={() => setOpen({ kind: 'admin', org })}
            onReset={(person) => setOpen({ kind: 'reset', person })} onRemove={(person) => setOpen({ kind: 'remove', person })} />
        ))}
      </div>
      {open?.kind === 'new' && <NewOrgModal onClose={close} onDone={changed} />}
      {open?.kind === 'edit' && <EditOrgModal org={open.org} endpoint={canCreate ? undefined : '/admin/organization'} onClose={close} onDone={changed} />}
      {open?.kind === 'admin' && <AddAdminModal orgs={orgs} orgId={open.org.id} people={people} onClose={close} onDone={changed} />}
      {open?.kind === 'reset' && <ResetPasswordModal person={open.person} onClose={close} />}
      {open?.kind === 'remove' && <RemoveAdminModal person={open.person} onClose={close} onDone={changed} />}
    </div>
  );
}
