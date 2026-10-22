import React, { useCallback, useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Card, Input, Loading } from '../../../ui';
import { GROUP_LABELS, errorOf } from '../format';
import LockSettingsCard from './LockSettingsCard';

function OptionGroup({ group, label, options, busy, onToggle, onAdd }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="rounded-md border border-line p-3">
      <h4 className="mb-2 text-sm font-semibold">{label}</h4>
      <div className="mb-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <span key={option.id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${option.is_active ? 'border-line bg-subtle' : 'border-dashed border-line text-muted line-through'}`}>
            {option.label}
            <button type="button" disabled={busy} onClick={() => onToggle(option)}
              aria-label={`${option.is_active ? 'Remove' : 'Restore'} ${option.label}`}
              className={`rounded px-1 text-xs no-underline ${option.is_active ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-accent hover:bg-accent-soft'}`}>
              {option.is_active ? '×' : 'Restore'}
            </button>
          </span>
        ))}
        {!options.length && <span className="text-sm text-muted">No options yet.</span>}
      </div>
      <form className="flex gap-2" onSubmit={async (event) => {
        event.preventDefault();
        if (draft.trim() && await onAdd(group, draft.trim(), label)) setDraft('');
      }}>
        <Input aria-label={`New ${label} option`} maxLength={120} placeholder={`New ${label} option`} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Button type="submit" disabled={busy}>Add</Button>
      </form>
    </div>
  );
}

export default function SetupTab({ config, onChanged }) {
  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOptions((await timesheet.options()).data); }
    catch (err) { notify(errorOf(err, 'Could not load dropdown options.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, success) => {
    setBusy(true);
    try { await fn(); notify(success, 'success'); await load(); onChanged(); return true; }
    catch (err) { notify(errorOf(err, 'Could not change the option.')); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <LockSettingsCard settings={config.settings} onSaved={onChanged} />
      <Card className="p-4">
        <h3 className="text-[15px] font-semibold">Dropdown options</h3>
        <p className="mb-3 text-sm text-muted">These fill the dropdowns in the timesheet form. Removing an option hides it from the form; entries that already use it keep their value.</p>
        {!options ? <Loading>Loading options...</Loading> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Object.entries(GROUP_LABELS).map(([group, label]) => (
              <OptionGroup key={group} group={group} label={label} options={options[group]} busy={busy}
                onToggle={(option) => run(() => timesheet.setOptionActive(option.id, !option.is_active), option.is_active ? `Removed "${option.label}".` : `Restored "${option.label}".`)}
                onAdd={(key, value, name) => run(() => timesheet.addOption({ option_group: key, label: value }), `"${value}" added to ${name}.`)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
