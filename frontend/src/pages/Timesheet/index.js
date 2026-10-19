import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../services/api';
import { cls, errorOf } from './shared';
import EntriesTab from './EntriesTab';
import EntryFormModal from './EntryFormModal';
import EntryDetailModal from './EntryDetailModal';
import ClientsTab from './ClientsTab';
import ReportsTab from './ReportsTab';
import SetupTab from './SetupTab';
import UnlockRequestsModal from './UnlockRequestsModal';

export default function Timesheet() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('entries');
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState(null); // { entry } for edit, {} for add
  const [detailId, setDetailId] = useState(null);
  const [showUnlocks, setShowUnlocks] = useState(false);

  const loadConfig = useCallback(async () => {
    try { setConfig((await timesheet.config()).data); setError(''); }
    catch (err) { setError(errorOf(err, 'Could not load the timesheet.')); }
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const refreshAll = useCallback(() => { refresh(); loadConfig(); }, [refresh, loadConfig]);

  if (error) {
    return <div className="p-6"><h1 className="text-2xl font-semibold">Timesheet</h1><p role="alert" className="mt-3 text-slate-600">{error}</p></div>;
  }
  if (!config) return <p role="status" className="p-6 text-slate-500">Loading timesheet...</p>;

  const { permissions } = config;
  const tabs = [['entries', 'Entries'],
    ...(permissions.manage_clients ? [['clients', 'Clients']] : []),
    ...(permissions.view_reports ? [['reports', 'Reports']] : []),
    ...(permissions.setup ? [['setup', 'Setup']] : [])];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Timesheet</h1>
          <p className="text-sm text-slate-500">Client work and the time each person spent on it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.approve_unlocks && (
            <button type="button" className={cls.button} onClick={() => setShowUnlocks(true)}>
              Unlock requests{config.pending_unlocks > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{config.pending_unlocks}</span>}
            </button>
          )}
          {tab === 'entries' && <button type="button" className={cls.primary} onClick={() => setForm({})}>+ Add Timesheet</button>}
        </div>
      </header>

      <nav role="tablist" aria-label="Timesheet sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'entries' && <EntriesTab config={config} refreshKey={refreshKey} onOpen={setDetailId} />}
      {tab === 'clients' && <ClientsTab onChanged={loadConfig} />}
      {tab === 'reports' && <ReportsTab config={config} />}
      {tab === 'setup' && <SetupTab config={config} onChanged={loadConfig} />}

      {form && (
        <EntryFormModal
          key={form.entry?.id || 'new'}
          config={config}
          entry={form.entry}
          onClose={() => setForm(null)}
          onSaved={(id, mode) => {
            refresh();
            if (mode === 'new') return;
            setForm(null);
            if (mode === 'edit') setDetailId(id);
          }}
        />
      )}
      {detailId && !form && (
        <EntryDetailModal
          id={detailId}
          config={config}
          onClose={() => setDetailId(null)}
          onChanged={refreshAll}
          onEdit={(entry) => setForm({ entry })}
        />
      )}
      {showUnlocks && <UnlockRequestsModal config={config} onClose={() => setShowUnlocks(false)} onChanged={refreshAll} />}
    </div>
  );
}
