import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { timesheet } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, buttonClass, CountBadge, ErrorText, Loading, PageHeader, Tabs } from '../../ui';
import { errorOf } from './format';
import EntriesTab from './entries/EntriesTab';
import EntryFormModal from './entries/EntryFormModal';
import EntryDetailModal from './entries/EntryDetailModal';
import ReportsTab from './reports/ReportsTab';
import TeamWeekTab from './week/TeamWeekTab';
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
  const [entriesPreset, setEntriesPreset] = useState(null); // opened from a number in the team week
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
  // Opened from "Add Timesheet" in the log-out window: start a new entry right away.
  const addParam = params.get('add');
  useEffect(() => {
    if (addParam !== '1' || !config) return;
    const next = new URLSearchParams(params); next.delete('add'); setParams(next, { replace: true });
    setTab('entries'); setForm({});
  }, [addParam, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const refreshAll = useCallback(() => { refresh(); loadConfig(); }, [refresh, loadConfig]);

  if (error) return <><PageHeader title="Timesheet" /><ErrorText>{error}</ErrorText></>;
  if (!config) return <Loading>Loading timesheet...</Loading>;

  const { permissions } = config;
  const tabs = [['entries', 'Entries'],
    ...(permissions.view_reports ? [['week', 'Team week'], ['reports', 'Reports']] : []),
    ...(permissions.setup ? [['setup', 'Setup']] : [])];

  const onSaved = (id, mode) => {
    refresh();
    if (mode === 'new') return;
    setForm(null);
    if (mode === 'edit') setDetailId(id);
  };
  // "Edit" on a draft in the list: load the whole entry (the list leaves some fields out), then open the form.
  const editEntry = async (id) => {
    try { setForm({ entry: (await timesheet.entry(id)).data }); }
    catch (err) { notify(errorOf(err, 'Could not open this entry.')); }
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Timesheet"
        subtitle="Client work and the time each person spent on it."
        actions={tab === 'entries' && <>
          <Link to="/bulk-upload?type=entries" className={buttonClass()} title="Add many timesheet entries from a sheet">Upload sheet</Link>
          <Button variant="primary" onClick={() => setForm({})}>+ Add Timesheet</Button>
        </>}
      />
      <Tabs
        tabs={tabs} value={tab} onChange={setTab} label="Timesheet sections"
        aside={permissions.approve_unlocks && (
          <Button size="sm" onClick={() => setShowUnlocks(true)}>Unlock requests <CountBadge count={config.pending_unlocks} /></Button>
        )}
      />

      {tab === 'entries' && <EntriesTab key={entriesPreset?.at || 'entries'} config={config} refreshKey={refreshKey} onOpen={setDetailId} onEdit={editEntry} preset={entriesPreset} />}
      {tab === 'week' && <TeamWeekTab config={config} refreshKey={refreshKey} onDrill={(preset) => { setEntriesPreset({ ...preset, at: Date.now() }); setTab('entries'); }} />}
      {tab === 'reports' && <ReportsTab config={config} />}
      {tab === 'setup' && <SetupTab config={config} onChanged={loadConfig} />}

      {form && <EntryFormModal key={form.entry?.id || form.task?.id || 'new'} config={config} entry={form.entry} initialTask={form.task} onClose={() => setForm(null)} onSaved={onSaved} onClientAdded={loadConfig} onFormChanged={loadConfig} />}
      {detailId && !form && (
        <EntryDetailModal id={detailId} config={config} onClose={() => setDetailId(null)} onChanged={refreshAll} onEdit={(entry) => setForm({ entry })} />
      )}
      {showUnlocks && <UnlockRequestsModal config={config} onClose={() => setShowUnlocks(false)} onChanged={refreshAll} />}
    </div>
  );
}
