import React, { useState } from 'react';
import { tasks } from '../../services/api';
import { notify } from '../../services/feedback';

const BulkTaskActions = ({ selectedIds, onDelete, onClear, rows = [], members = [], onUpdated }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState('status'), [value, setValue] = useState('');
  const [error, setError] = useState('');
  const count = selectedIds.length;
  if (!count) return null;

  const updateSelected = async () => {
    if (!value || busy || !window.confirm(`Update ${field.replaceAll('_', ' ')} for ${count} selected tasks?`)) return;
    setBusy(true); setError('');
    const failures = [];
    for (const id of selectedIds) {
      const row = rows.find(item => item.id === id);
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
    try {
      await onDelete?.(selectedIds);
      onClear();
      setConfirming(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete selected tasks.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-[14px] border border-red-300 bg-gradient-to-br from-red-100 to-red-50 px-4 py-2.5">
      <span className="text-sm font-bold text-red-700">{count} task{count === 1 ? '' : 's'} selected</span>
      <select disabled={busy} aria-label="Bulk field" value={field} onChange={e => { setField(e.target.value); setValue(''); }} className="rounded-lg border p-2 text-sm"><option value="status">Status</option><option value="priority">Priority</option><option value="assigned_to">Assignee</option></select>
      <select disabled={busy} aria-label="Bulk value" value={value} onChange={e => setValue(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="">Choose value</option>{(field === 'status' ? ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'].map(v => [v, v.replaceAll('_', ' ')]) : field === 'priority' ? ['HIGH', 'MEDIUM', 'LOW'].map(v => [v, v]) : [['0', 'Unassigned'], ...members.map(m => [String(m.id), m.name])]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <button type="button" disabled={busy || !value} onClick={updateSelected} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Working...' : 'Apply update'}</button>
      {error && <p role="alert" className="w-full text-sm text-red-800">{error}</p>}
      {confirming ? (
        <>
          <span className="text-[13px] font-semibold text-red-900">Delete the selected tasks?</span>
          <button type="button" disabled={busy} onClick={removeSelected} className="rounded-[10px] bg-red-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy ? 'Deleting...' : 'Yes, delete'}</button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-[10px] border border-slate-300 bg-slate-100 px-4 py-2 text-[13px] font-semibold text-slate-600">Cancel</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-[10px] bg-red-600 px-4 py-2 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]">Delete selected</button>
      )}
      <button type="button" onClick={onClear} title="Deselect all" className="ml-auto border-0 bg-transparent text-lg text-slate-400 hover:text-slate-700">×</button>
    </div>
  );
};

export default BulkTaskActions;
