import React, { useState } from 'react';
import { tasks } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Select } from '../../ui';

const valueOptions = (field, members) => {
  if (field === 'status') return ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'].map((v) => [v, v.replaceAll('_', ' ')]);
  if (field === 'priority') return ['HIGH', 'MEDIUM', 'LOW'].map((v) => [v, v]);
  return [['0', 'Unassigned'], ...members.map((m) => [String(m.id), m.name])];
};

const BulkTaskActions = ({ selectedIds, onDelete, onClear, rows = [], members = [], onUpdated }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState('status');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const count = selectedIds.length;
  if (!count) return null;

  const updateSelected = async () => {
    if (!value || busy || !window.confirm(`Update ${field.replaceAll('_', ' ')} for ${count} selected tasks?`)) return;
    setBusy(true); setError('');
    const failures = [];
    for (const id of selectedIds) {
      const row = rows.find((item) => item.id === id);
      try {
        if (!row) throw new Error('Task is no longer on this page');
        await tasks.update(id, { [field]: field === 'assigned_to' ? Number(value) || null : value, version: row.version });
      } catch (err) { failures.push(`#${id}: ${err.response?.data?.error || err.message}`); }
    }
    setBusy(false);
    if (failures.length) { const message = `${count - failures.length} updated; ${failures.length} failed. ${failures.join(' · ')}`; setError(message); notify(message); }
    else { notify(`${count} tasks updated`, 'success'); onClear(); }
    await onUpdated?.();
  };

  const removeSelected = async () => {
    setBusy(true);
    try { await onDelete?.(selectedIds); onClear(); setConfirming(false); }
    catch (err) { setError(err.response?.data?.error || 'Could not delete selected tasks.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2">
      <span className="mr-1 text-sm font-semibold">{count} task{count === 1 ? '' : 's'} selected</span>
      <Select disabled={busy} aria-label="Bulk field" className="!w-auto py-1.5" value={field} onChange={(event) => { setField(event.target.value); setValue(''); }}>
        <option value="status">Status</option><option value="priority">Priority</option><option value="assigned_to">Assignee</option>
      </Select>
      <Select disabled={busy} aria-label="Bulk value" className="!w-auto py-1.5" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="">Choose value</option>
        {valueOptions(field, members).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
      <Button size="sm" variant="primary" disabled={busy || !value} onClick={updateSelected}>{busy ? 'Working...' : 'Apply update'}</Button>
      {confirming ? (
        <>
          <span className="text-sm font-medium text-danger">Delete the selected tasks?</span>
          <Button size="sm" variant="danger" className="!border-danger/40" disabled={busy} onClick={removeSelected}>{busy ? 'Deleting...' : 'Yes, delete'}</Button>
          <Button size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>Delete selected</Button>}
      <button type="button" onClick={onClear} title="Deselect all" aria-label="Deselect all" className="ml-auto px-1 text-lg text-muted hover:text-ink">×</button>
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
};

export default BulkTaskActions;
