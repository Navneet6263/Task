import React, { useState } from 'react';
import { teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, FieldError, Input, Modal, Select } from '../../ui';
import { TEAM_TYPES, errorOf } from './shared';

// Create a team, or rename / retype an existing one.
export default function TeamFormModal({ team, onClose, onSaved }) {
  const [name, setName] = useState(team?.name || '');
  const [type, setType] = useState(team?.type || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim()) { setError('Give the team a name.'); return; }
    setSaving(true);
    try {
      const response = team ? await teams.update(team.id, { name: name.trim(), type }) : await teams.create({ name: name.trim(), type });
      notify(team ? 'Team updated.' : `Team "${name.trim()}" created. You are its reporting manager.`, 'success');
      onSaved(team ? team.id : response.data.id);
    } catch (err) { setError(errorOf(err, 'Could not save the team.')); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={team ? 'Edit team' : 'Create a team'} subtitle={team ? undefined : 'Group people who work together. You can add members right after.'} onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : team ? 'Save changes' : 'Create team'}</Button></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
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
      </form>
    </Modal>
  );
}
