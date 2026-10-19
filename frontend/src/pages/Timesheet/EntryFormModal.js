import React, { useMemo, useState } from 'react';
import { timesheet } from '../../services/api';
import { notify } from '../../services/feedback';
import { Modal, FieldError, cls, errorOf, fieldsOf } from './shared';

const REQUIRED = ['client_id', 'job_type', 'work_type', 'date_worked', 'agent_id', 'period_type', 'period_ended', 'registration_status', 'count_type', 'count_number'];

const blank = (config) => ({
  client_id: '', job_type: '', work_type: '', date_worked: config.today, agent_id: config.permissions.log_for_others ? '' : String(config.user_id),
  period_type: '', period_ended: '', registration_status: '', description: '', count_type: '', count_number: '', hours: '',
});
const fromEntry = (entry) => Object.fromEntries(Object.entries(blank({ today: '', permissions: {}, user_id: '' }))
  .map(([key]) => [key, entry[key] === null || entry[key] === undefined ? '' : String(entry[key])]));

// Mirrors the client's "Add Timesheet" screen field for field.
export default function EntryFormModal({ config, entry, onClose, onSaved }) {
  const isEdit = Boolean(entry);
  const [form, setForm] = useState(() => (isEdit ? fromEntry(entry) : blank(config)));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  // Keep an already saved value selectable even if an admin has since switched that option off.
  const optionsFor = (group) => {
    const labels = (config.options[group] || []).map((option) => option.label);
    return form[group] && !labels.includes(form[group]) ? [form[group], ...labels] : labels;
  };
  const clients = useMemo(() => {
    const list = config.clients.map((client) => ({ id: String(client.id), name: client.name }));
    if (isEdit && !list.some((client) => client.id === String(entry.client_id))) list.unshift({ id: String(entry.client_id), name: entry.client_name });
    return list;
  }, [config.clients, entry, isEdit]);

  const check = (mode) => {
    const required = mode === 'draft' ? ['client_id'] : [...REQUIRED, ...(isEdit ? [] : ['hours'])];
    const next = {};
    required.forEach((key) => { if (!String(form[key] ?? '').trim()) next[key] = 'This field is required.'; });
    if (form.hours && !(Number(form.hours) > 0 && Number(form.hours) <= 24)) next.hours = 'Hours must be more than 0 and at most 24.';
    if (form.date_worked && form.date_worked > config.today) next.date_worked = 'Date worked cannot be in the future.';
    setErrors(next);
    return !Object.keys(next).length;
  };

  const save = async (mode) => {
    if (!check(mode)) return;
    setSaving(true);
    try {
      if (isEdit) {
        await timesheet.update(entry.id, { ...form, version: entry.version });
        notify('Changes saved.', 'success');
        onSaved(entry.id, 'edit');
      } else {
        const response = await timesheet.create({ ...form, mode: mode === 'draft' ? 'draft' : 'submit' });
        notify(mode === 'draft' ? 'Saved as draft. It is not in reports until you submit it.' : 'Timesheet submitted.', 'success');
        if (mode === 'new') { setForm({ ...blank(config), date_worked: form.date_worked }); setErrors({}); onSaved(response.data.id, 'new'); }
        else onSaved(response.data.id, mode);
      }
    } catch (error) {
      setErrors(fieldsOf(error));
      notify(errorOf(error, 'Could not save the timesheet.'));
    } finally { setSaving(false); }
  };

  const row = (key, label, required, control, hint) => (
    <div className="mb-3 grid grid-cols-1 gap-1 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
      <label htmlFor={`ts-${key}`} className="pt-2 text-sm text-slate-700">{label}{required && <span className="ml-0.5 text-red-600">*</span>}</label>
      <div>{control}{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}<FieldError text={errors[key]} /></div>
    </div>
  );
  const select = (key, list, placeholder = 'Select', disabled = false) => (
    <select id={`ts-${key}`} className={cls.input} value={form[key]} onChange={set(key)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {list.map((item) => (typeof item === 'string' ? <option key={item} value={item}>{item}</option> : <option key={item.id} value={item.id}>{item.name}</option>))}
    </select>
  );

  const footer = isEdit
    ? <><button type="button" className={cls.primary} disabled={saving} onClick={() => save('edit')}>Save changes</button><button type="button" className={cls.button} onClick={onClose}>Cancel</button></>
    : <>
        <button type="button" className={cls.primary} disabled={saving} onClick={() => save('submit')}>Submit</button>
        <button type="button" className={cls.primary} disabled={saving} onClick={() => save('new')}>Submit and New</button>
        <button type="button" className={cls.button} disabled={saving} onClick={() => save('draft')}>Save Draft</button>
        <button type="button" className={cls.button} onClick={onClose}>Cancel</button>
      </>;

  return (
    <Modal title={isEdit ? 'Edit Timesheet' : 'Add Timesheet'} onClose={onClose} footer={footer} wide>
      <p className="mb-4 border-b pb-3 text-sm font-semibold text-slate-800">Job Configuration Details</p>
      {row('client_id', 'Client', true, select('client_id', clients, '-Select-'), config.permissions.manage_clients ? null : 'Client missing from the list? Ask your manager to add it.')}
      {row('job_type', 'Job Type', true, select('job_type', optionsFor('job_type')))}
      {row('work_type', 'Work Type', true, select('work_type', optionsFor('work_type')))}
      {row('date_worked', 'Date worked', true, <input id="ts-date_worked" type="date" max={config.today} className={cls.input} value={form.date_worked} onChange={set('date_worked')} />)}
      {row('agent_id', 'Agent', true, select('agent_id', config.users.map((user) => ({ id: String(user.id), name: user.name })), 'Select', !config.permissions.log_for_others),
        config.permissions.log_for_others ? null : 'Your entries are logged under your own name.')}
      {row('period_type', 'Period Type', true, select('period_type', optionsFor('period_type')))}
      {row('period_ended', 'Period Ended', true, <input id="ts-period_ended" type="date" className={cls.input} value={form.period_ended} onChange={set('period_ended')} />)}
      {row('registration_status', 'Registration Status', true, select('registration_status', optionsFor('registration_status')))}
      {row('description', 'Description', false, <textarea id="ts-description" rows={3} maxLength={2000} className={cls.input} value={form.description} onChange={set('description')} />)}
      {row('count_type', 'Count Type', true, select('count_type', optionsFor('count_type')))}
      {row('count_number', 'Count number', true, <input id="ts-count_number" type="number" min="0" step="1" className={cls.input} value={form.count_number} onChange={set('count_number')} />)}
      {isEdit
        ? row('hours', 'Hours worked', false, <p className="pt-2 text-sm text-slate-500">Hours are kept in the time log on the entry, so each person adds their own.</p>)
        : row('hours', 'Hours worked', true, <input id="ts-hours" type="number" min="0.25" max="24" step="0.25" placeholder="e.g. 2.5" className={cls.input} value={form.hours} onChange={set('hours')} />)}
    </Modal>
  );
}
