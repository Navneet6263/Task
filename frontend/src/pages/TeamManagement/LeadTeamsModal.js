import React, { useEffect, useState } from 'react';
import { teams } from '../../services/api';
import { Button, Modal } from '../../ui';
import { errorOf } from './shared';

const ROLE_NAME = { admin: 'an admin', manager: 'a manager', person: 'a member' };

// Pick the teams someone will lead, when making them a manager or admin, or later from the People list.
export default function LeadTeamsModal({ person, role, onClose, onSave }) {
  const [all, setAll] = useState(null);
  const [picked, setPicked] = useState(() => new Set((person.leads || []).map((t) => Number(t.id))));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    teams.getAll()
      .then((r) => setAll(r.data.filter((t) => !person.org_id || Number(t.org_id) === Number(person.org_id))))
      .catch((err) => { setError(errorOf(err, 'Could not load teams.')); setAll([]); });
  }, [person.org_id]);

  const toggle = (id) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave([...picked]); }
    catch (err) { setError(errorOf(err, 'Could not save.')); setSaving(false); }
  };
  const changing = role !== person.role;

  return (
    <Modal title={changing ? `Make ${person.name} ${ROLE_NAME[role]}` : `Teams ${person.name} leads`}
      subtitle="Tick the teams they will lead. Each team has one leader, so ticking a team replaces its current leader."
      onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving || all === null} onClick={save}>{saving ? 'Saving…' : changing ? 'Save role and teams' : 'Save teams'}</Button></>}>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {all === null && <p role="status" className="text-sm text-muted">Loading teams…</p>}
      {all?.length === 0 && !error && <p className="text-sm text-muted">This organization has no teams yet. Create one in Teams first.</p>}
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {(all || []).map((team) => (
          <li key={team.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={picked.has(Number(team.id))} onChange={() => toggle(Number(team.id))} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{team.name}</span><span className="block text-xs text-muted">{team.type || 'General'} · {team.member_count || 0} members</span></span>
            </label>
          </li>
        ))}
      </ul>
      {changing && <p className="mt-3 text-xs text-muted">You can leave every box empty and choose teams later.</p>}
    </Modal>
  );
}
