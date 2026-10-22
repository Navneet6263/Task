import React, { useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, EmptyState, Input } from '../../ui';
import { errorOf } from './adminShared';

const copy = async (code) => {
  try { await navigator.clipboard.writeText(code); notify(`Copied ${code}.`, 'success'); }
  catch { window.prompt('Copy this company code', code); }
};

// Company admins: every organization they own, with a quick create form.
export default function OrganizationsTab({ orgs, canCreate, onChanged, onViewUsers }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await api.post('/company-admin/organizations', { name: name.trim() }); notify(`Organization "${name.trim()}" created.`, 'success'); setName(''); onChanged(); }
    catch (err) { notify(errorOf(err, 'Could not create the organization.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <Card className="p-4">
          <form onSubmit={create} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1"><span className="text-xs font-medium text-muted">New organization</span>
              <Input placeholder="e.g. Acme India Pvt Ltd" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Create organization</Button>
          </form>
          <p className="mt-2 text-xs text-muted">Each organization gets its own users, teams, tasks and a company code that people use to join it.</p>
        </Card>
      )}
      {!orgs.length && <EmptyState title="No organizations yet">Create your first organization above.</EmptyState>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orgs.map((org) => (
          <Card key={org.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate font-semibold">{org.name}</p><p className="text-xs text-muted">Organization #{org.id}</p></div>
              {org.company_code && (
                <button type="button" onClick={() => copy(org.company_code)} title="Copy company code" className="shrink-0 rounded-md border border-dashed border-accent/60 bg-accent-soft px-2 py-1 font-mono text-xs font-semibold text-accent">{org.company_code}</button>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[['Users', org.user_count], ['Teams', org.team_count], ['Admins', org.admin_count]].filter(([, v]) => v !== undefined).map(([label, value]) => (
                <div key={label} className="rounded-md bg-subtle py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt><dd className="font-mono text-lg font-semibold">{value || 0}</dd></div>
              ))}
            </dl>
            {onViewUsers && <Button size="sm" onClick={() => onViewUsers(org.id)}>View people</Button>}
          </Card>
        ))}
      </div>
    </div>
  );
}
