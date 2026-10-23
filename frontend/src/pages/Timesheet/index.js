import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { timesheet } from '../../services/api';
import { Button, CountBadge, ErrorText, Loading, PageHeader, Tabs } from '../../ui';
import { errorOf } from './format';
import EntriesTab from './entries/EntriesTab';
import EntryFormModal from './entries/EntryFormModal';
import EntryDetailModal from './entries/EntryDetailModal';
import ReportsTab from './reports/ReportsTab';
import SetupTab from './setup/SetupTab';
import UnlockRequestsModal from './setup/UnlockRequestsModal';

export default function Timesheet() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('entries');
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState(null); // {} to add, { entry } to edit
  const [detailId, setDetailId] = useState(null);
  const [showUnlocks, setShowUnlocks] = useState(false);
  const [params, setParams] = useSearchParams();

  const loadConfig = useCallback(async () => {
    try { setConfig((await timesheet.config()).data); setError(''); }
    catch (err) { setError(errorOf(err, 'Could not load the timesheet.')); }
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);
  // Opened from a task ("Log timesheet"): start a new entry with that task already picked.
  const taskParam = params.get('task');
  useEffect(() => {
    if (!taskParam || !config) return;
    const next = new URLSearchParams(params); next.delete('task'); setParams(next, { replace: true });
    timesheet.tasks({ id: taskParam }).then((r) => { if (r.data?.[0]) { setTab('entries'); setForm({ task: r.data[0] }); } }).catch(() => {});
  }, [taskParam, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const refreshAll = useCallback(() => { refresh(); loadConfig(); }, [refresh, loadConfig]);

  if (error) return <><PageHeader title="Timesheet" /><ErrorText>{error}</ErrorText></>;
  if (!config) return <Loading>Loading timesheet...</Loading>;

  const { permissions } = config;
  const tabs = [['entries', 'Entries'],
    ...(permissions.view_reports ? [['reports', 'Reports']] : []),
    ...(permissions.setup ? [['setup', 'Setup']] : [])];

  const onSaved = (id, mode) => {
    refresh();
    if (mode === 'new') return;
    setForm(null);
    if (mode === 'edit') setDetailId(id);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Timesheet"
        subtitle="Client work and the time each person spent on it."
        actions={tab === 'entries' && <Button variant="primary" onClick={() => setForm({})}>+ Add Timesheet</Button>}
      />
      <Tabs
        tabs={tabs} value={tab} onChange={setTab} label="Timesheet sections"
        aside={permissions.approve_unlocks && (
          <Button size="sm" onClick={() => setShowUnlocks(true)}>Unlock requests <CountBadge count={config.pending_unlocks} /></Button>
        )}
      />

      {tab === 'entries' && <EntriesTab config={config} refreshKey={refreshKey} onOpen={setDetailId} />}
      {tab === 'reports' && <ReportsTab config={config} />}
      {tab === 'setup' && <SetupTab config={config} onChanged={loadConfig} />}

      {form && <EntryFormModal key={form.entry?.id || form.task?.id || 'new'} config={config} entry={form.entry} initialTask={form.task} onClose={() => setForm(null)} onSaved={onSaved} onClientAdded={loadConfig} />}
      {detailId && !form && (
        <EntryDetailModal id={detailId} config={config} onClose={() => setDetailId(null)} onChanged={refreshAll} onEdit={(entry) => setForm({ entry })} />
      )}
      {showUnlocks && <UnlockRequestsModal config={config} onClose={() => setShowUnlocks(false)} onChanged={refreshAll} />}
    </div>
  );
}
