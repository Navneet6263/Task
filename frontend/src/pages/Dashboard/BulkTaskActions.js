import React, { useState } from 'react';

const BulkTaskActions = ({ selectedIds, onDelete, onClear }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = selectedIds.length;
  if (!count) return null;

  const removeSelected = async () => {
    setBusy(true);
    try {
      await onDelete?.(selectedIds);
      onClear();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-[14px] border border-red-300 bg-gradient-to-br from-red-100 to-red-50 px-4 py-2.5">
      <span className="text-sm font-bold text-red-700">{count} task{count === 1 ? '' : 's'} selected</span>
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
