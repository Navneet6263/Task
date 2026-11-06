import React, { useEffect, useMemo, useState } from 'react';
import api, { teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, FieldError, Input, Modal, Select } from '../../ui';
import { Avatar, TEAM_TYPES, errorOf } from './shared';

const ROLE_NAME = { admin: 'Admin', manager: 'Manager', person: 'Member' };

// Admins building a new team: which organization, who leads it, and who is in it, in one step.
function PeoplePicker({ admin, orgId, setOrgId, leaderId, setLeaderId, members, setMembers }) {
  const [orgs, setOrgs] = useState([]);
  const [people, setPeople] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get(admin.isCompanyAdmin ? '/company-admin/organizations' : '/admin/organizations')
      .then((r) => { const list = Array.isArray(r.data) ? r.data : []; setOrgs(list); if (list.length) setOrgId((id) => id || String(list[0].id)); })
      .catch(() => setOrgs([]));
  }, [admin.isCompanyAdmin, setOrgId]);
  useEffect(() => {
    if (!orgId) return;
    setPeople(null);
    teams.people(orgId).then((r) => setPeople(r.data)).catch(() => setPeople([]));
  }, [orgId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people || []).filter((p) => !q || `${p.name} ${p.email} ${p.employee_id || ''}`.toLowerCase().includes(q));
  }, [people, query]);
  const toggle = (id) => setMembers((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const leader = (people || []).find((p) => String(p.id) === String(leaderId));

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      {orgs.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Organization</span>
          <Select value={orgId} onChange={(e) => { setOrgId(e.target.value); setLeaderId(''); setMembers(new Set()); }}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Team leader <span className="font-normal">(optional)</span></span>
        <Select value={leaderId} onChange={(e) => { setLeaderId(e.target.value); setMembers((prev) => { const next = new Set(prev); next.delete(Number(e.target.value)); return next; }); }}>
          <option value="">You lead it for now</option>
          {(people || []).map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE_NAME[p.role] || p.role}</option>)}
        </Select>
        <span className="text-xs text-muted">{leader?.role === 'person' ? `${leader.name} becomes a manager so they can run the team.` : 'The leader manages the team and sees its work.'}</span>
      </label>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">Members · {members.size} picked</span>
          {members.size > 0 && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setMembers(new Set())}>Clear</button>}
        </div>
        <Input aria-label="Search people" placeholder="Search name, email or employee ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-line p-1">
          {people === null && <li role="status" className="px-2 py-3 text-sm text-muted">Loading people…</li>}
          {people && !shown.length && <li className="px-2 py-3 text-center text-sm text-muted">No one matches.</li>}
          {shown.filter((p) => String(p.id) !== String(leaderId)).map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-subtle">
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={members.has(Number(p.id))} onChange={() => toggle(Number(p.id))} />
                <Avatar name={p.name} id={p.id} size="h-7 w-7 text-[10px]" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-xs text-muted">{p.email}</span></span>
                <span className="text-[11px] text-muted">{ROLE_NAME[p.role] || p.role}</span>
              </label>
            </li>
          ))}
        </ul>
        <span className="text-xs text-muted">You can add or remove people any time later.</span>
      </div>
    </div>
  );
}

// Create a team, or rename / retype an existing one.
export default function TeamFormModal({ team, admin, onClose, onSaved }) {
  const [name, setName] = useState(team?.name || '');
  const [type, setType] = useState(team?.type || '');
  const [orgId, setOrgId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [members, setMembers] = useState(() => new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const building = !team && Boolean(admin);

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim()) { setError('Give the team a name.'); return; }
    setSaving(true);
    try {
      const extra = building ? { ...(orgId ? { org_id: Number(orgId) } : {}), ...(leaderId ? { leader_id: Number(leaderId) } : {}), member_ids: [...members] } : {};
      const response = team ? await teams.update(team.id, { name: name.trim(), type }) : await teams.create({ name: name.trim(), type, ...extra });
      notify(team ? 'Team updated.' : `Team "${name.trim()}" created${leaderId ? '' : '. You are its reporting manager'}.`, 'success');
      onSaved(team ? team.id : response.data.id);
    } catch (err) { setError(errorOf(err, 'Could not save the team.')); }
    finally { setSaving(false); }
  };

  return (
    <Modal size={building ? 'md' : 'sm'} title={team ? 'Edit team' : 'Create a team'} subtitle={team ? undefined : building ? 'Name it, choose who leads it and who is in it.' : 'Group people who work together. You can add members right after.'} onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : team ? 'Save changes' : 'Create team'}</Button></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className={`grid grid-cols-1 gap-4 ${building ? 'sm:grid-cols-2' : ''}`}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Team name</span>
            <Input autoFocus maxLength={255} placeholder="e.g. Mobile App Squad" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldError text={error} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Team type <span className="font-normal">(optional)</span></span>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">General</option>
              {TEAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              {type && !TEAM_TYPES.includes(type) && <option value={type}>{type}</option>}
            </Select>
          </label>
        </div>
        {building && <PeoplePicker admin={admin} orgId={orgId} setOrgId={setOrgId} leaderId={leaderId} setLeaderId={setLeaderId} members={members} setMembers={setMembers} />}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}
