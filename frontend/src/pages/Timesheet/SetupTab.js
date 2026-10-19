import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../services/api';
import { notify } from '../../services/feedback';
import { FieldError, GROUP_LABELS, cls, errorOf, fieldsOf } from './shared';

export default function SetupTab({ config, onChanged }) {
  const [settings, setSettings] = useState({ lock_days: String(config.settings.lock_days), unlock_days: String(config.settings.unlock_days) });
  const [settingErrors, setSettingErrors] = useState({});
  const [options, setOptions] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOptions((await timesheet.options()).data); }
    catch (err) { notify(errorOf(err, 'Could not load dropdown options.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await timesheet.saveSettings({ lock_days: Number(settings.lock_days), unlock_days: Number(settings.unlock_days) });
      setSettingErrors({}); notify(`Entries now lock ${settings.lock_days} days after submission.`, 'success'); onChanged();
    } catch (err) { setSettingErrors(fieldsOf(err)); notify(errorOf(err, 'Could not save the edit lock.')); }
    finally { setBusy(false); }
  };

  const optionAction = async (fn, success) => {
    setBusy(true);
    try { await fn(); notify(success, 'success'); await load(); onChanged(); return true; }
    catch (err) { notify(errorOf(err, 'Could not change the option.')); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={saveSettings} className={`${cls.card} p-4`}>
        <h3 className="font-semibold">Edit lock</h3>
        <p className="mb-3 text-sm text-slate-500">Admins can always edit. After the window, managers and employees see the entry as locked and can send you an unlock request.</p>
        <div className="flex flex-wrap items-start gap-6">
          <label className="text-sm text-slate-700">Team can edit for
            <span className="mt-1 flex items-center gap-2"><input type="number" min="1" max="365" className={`${cls.input} w-24`} value={settings.lock_days} onChange={(event) => setSettings({ ...settings, lock_days: event.target.value })} /> days after submission</span>
            <FieldError text={settingErrors.lock_days} />
          </label>
          <label className="text-sm text-slate-700">An approved unlock lasts
            <span className="mt-1 flex items-center gap-2"><input type="number" min="1" max="90" className={`${cls.input} w-24`} value={settings.unlock_days} onChange={(event) => setSettings({ ...settings, unlock_days: event.target.value })} /> days</span>
            <FieldError text={settingErrors.unlock_days} />
          </label>
        </div>
        <button type="submit" className={`${cls.primary} mt-3`} disabled={busy}>Save edit lock</button>
      </form>

      <section className={`${cls.card} p-4`}>
        <h3 className="font-semibold">Dropdown options</h3>
        <p className="mb-3 text-sm text-slate-500">These fill the dropdowns in the timesheet form. Removing an option hides it from the form; entries that already use it keep their value.</p>
        {!options && <p role="status" className="text-sm text-slate-500">Loading options...</p>}
        {options && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Object.entries(GROUP_LABELS).map(([group, label]) => (
            <div key={group} className="rounded-lg border border-slate-200 p-3">
              <h4 className="mb-2 text-sm font-semibold">{label}</h4>
              <div className="mb-2 flex flex-wrap gap-2">
                {options[group].map((option) => (
                  <span key={option.id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${option.is_active ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300 text-slate-400 line-through'}`}>
                    {option.label}
                    <button type="button" disabled={busy} aria-label={`${option.is_active ? 'Remove' : 'Restore'} ${option.label}`} className="rounded px-1 text-xs text-slate-500 hover:bg-slate-200"
                      onClick={() => optionAction(() => timesheet.setOptionActive(option.id, !option.is_active), option.is_active ? `Removed "${option.label}".` : `Restored "${option.label}".`)}>
                      {option.is_active ? '×' : 'Restore'}
                    </button>
                  </span>
                ))}
                {!options[group].length && <span className="text-sm text-slate-400">No options yet.</span>}
              </div>
              <form className="flex gap-2" onSubmit={async (event) => {
                event.preventDefault();
                const value = (drafts[group] || '').trim();
                if (!value) return;
                if (await optionAction(() => timesheet.addOption({ option_group: group, label: value }), `"${value}" added to ${label}.`)) setDrafts({ ...drafts, [group]: '' });
              }}>
                <input aria-label={`New ${label} option`} maxLength={120} className={cls.input} placeholder={`New ${label} option`} value={drafts[group] || ''} onChange={(event) => setDrafts({ ...drafts, [group]: event.target.value })} />
                <button type="submit" className={cls.button} disabled={busy}>Add</button>
              </form>
            </div>
          ))}
        </div>}
      </section>
    </div>
  );
}
