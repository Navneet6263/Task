import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, FormRow, Input, Modal, Select, Textarea } from '../../../ui';
import LayoutField from '../../Dashboard/TaskComposer/LayoutField';
import { errorOf, fieldsOf } from '../format';
import TaskPicker from './TaskPicker';

const CORE = ['task_id', 'client_id', 'job_type', 'work_type', 'date_worked', 'agent_id', 'period_type', 'period_ended', 'registration_status', 'description', 'count_type', 'count_number', 'hours'];

const blank = (config) => ({
  ...Object.fromEntries(CORE.map((key) => [key, ''])),
  date_worked: config.today,
  agent_id: config.permissions.log_for_others ? '' : String(config.user_id),
  custom_fields: {},
});
const fromEntry = (entry) => {
  let custom = {};
  try { custom = typeof entry.custom_fields === 'string' ? JSON.parse(entry.custom_fields) || {} : entry.custom_fields || {}; } catch { custom = {}; }
  return { ...Object.fromEntries(CORE.map((key) => [key, entry[key] === null || entry[key] === undefined ? '' : String(entry[key])])), custom_fields: custom };
};
const emptyValue = (field, value) => (field.type === 'checkbox' ? !(value === true || value === 'true') : value === undefined || value === null || String(value).trim() === '');

// The "Add Timesheet" form, built from the organization's customised form
// (Settings → Form designer → Timesheet form): labels, order, required fields and extra questions.
export default function EntryFormModal({ config, entry, initialTask, onClose, onSaved, onClientAdded }) {
  const isEdit = Boolean(entry);
  const layout = config.form;
  const visible = layout.fields.filter((f) => !f.hidden);
  const [form, setForm] = useState(() => (isEdit ? fromEntry(entry) : blank(config)));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState([]);
  const [newClient, setNewClient] = useState(null); // null = closed, string = name being typed
  const [addingClient, setAddingClient] = useState(false);
  const [task, setTask] = useState(() => (entry?.task_id ? { id: entry.task_id, title: entry.task_title, status: entry.task_status } : null));
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const setCustom = (key, value) => setForm((prev) => ({ ...prev, custom_fields: { ...(prev.custom_fields || {}), [key]: value } }));

  const clients = useMemo(() => {
    const list = [...config.clients, ...added.filter((a) => !config.clients.some((c) => c.id === a.id))]
      .map((client) => ({ id: String(client.id), name: client.name })).sort((a, b) => a.name.localeCompare(b.name));
    if (isEdit && !list.some((client) => client.id === String(entry.client_id))) list.unshift({ id: String(entry.client_id), name: entry.client_name });
    return list;
  }, [config.clients, added, entry, isEdit]);

  // Picking a task fills in what we already know: its client, who it is assigned to, and a description.
  const pickTask = (picked) => {
    setTask(picked);
    setForm((prev) => {
      if (!picked) return { ...prev, task_id: '' };
      const next = { ...prev, task_id: String(picked.id) };
      const match = picked.client_name && clients.find((c) => c.name.toLowerCase() === String(picked.client_name).trim().toLowerCase());
      if (match) next.client_id = match.id;
      if (config.permissions.log_for_others && picked.assigned_to) next.agent_id = String(picked.assigned_to);
      if (!prev.description) next.description = picked.title;
      return next;
    });
  };
  useEffect(() => { if (initialTask && !isEdit) pickTask(initialTask); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Managers and admins can add a missing client without leaving the form. It goes into Settings → Clients.
  const addClient = async () => {
    const name = String(newClient || '').trim();
    if (!name) return;
    setAddingClient(true);
    try {
      const { data } = await timesheet.createClient(name);
      setAdded((prev) => [...prev, data]);
      setForm((prev) => ({ ...prev, client_id: String(data.id) }));
      setNewClient(null);
      notify(`${data.name} added to your client list and selected.`, 'success');
      onClientAdded?.();
    } catch (error) { notify(errorOf(error, 'Could not add the client.')); }
    finally { setAddingClient(false); }
  };

  const check = (mode) => {
    const next = {};
    const need = mode === 'draft' ? visible.filter((f) => f.key === 'client_id') : visible.filter((f) => f.required && (f.key !== 'hours' || !isEdit));
    need.forEach((f) => {
      const value = f.kind === 'custom' ? form.custom_fields?.[f.key] : form[f.key];
      if (emptyValue(f, value)) next[f.key] = 'This field is required.';
    });
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
        return;
      }
      const response = await timesheet.create({ ...form, mode: mode === 'draft' ? 'draft' : 'submit' });
      notify(mode === 'draft' ? 'Saved as draft. It is not in reports until you submit it.' : 'Timesheet submitted.', 'success');
      if (mode === 'new') { setForm({ ...blank(config), date_worked: form.date_worked, task_id: form.task_id, client_id: form.client_id }); setErrors({}); }
      onSaved(response.data.id, mode);
    } catch (error) {
      setErrors(fieldsOf(error));
      notify(errorOf(error, 'Could not save the timesheet.'));
    } finally { setSaving(false); }
  };

  const select = (key, list, placeholder = 'Select', disabled = false) => (
    <Select id={`ts-${key}`} value={form[key]} onChange={set(key)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {list.map((item) => (typeof item === 'string' ? <option key={item} value={item}>{item}</option> : <option key={item.id} value={item.id}>{item.name}</option>))}
    </Select>
  );
  // Keep an already saved value selectable even if it has since been removed from the list.
  const optionsFor = (field) => (form[field.key] && !(field.options || []).includes(form[field.key]) ? [form[field.key], ...(field.options || [])] : field.options || []);
  const canAddClient = config.permissions.manage_clients;
  const canPickAgent = config.permissions.log_for_others;

  const control = (field) => {
    const { key } = field;
    if (field.kind === 'custom') {
      return <LayoutField field={field} value={form.custom_fields?.[key]} onChange={(value) => setCustom(key, value)} ctx={{ idPrefix: 'ts' }} />;
    }
    switch (key) {
      case 'task_id': return <TaskPicker id="ts-task_id" value={task} onPick={pickTask} />;
      case 'client_id': return (
        <>
          {select('client_id', clients, '-Select-')}
          {canAddClient && (newClient === null
            ? <button type="button" className="mt-1.5 text-xs font-semibold text-accent hover:underline" onClick={() => setNewClient('')}>+ New client</button>
            : (
              <div className="mt-2 flex gap-2">
                <Input aria-label="New client name" autoFocus maxLength={255} placeholder="Client name" value={newClient}
                  onChange={(event) => setNewClient(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addClient(); } }} />
                <Button size="sm" variant="primary" disabled={addingClient || !newClient.trim()} onClick={addClient}>{addingClient ? 'Adding…' : 'Add'}</Button>
                <Button size="sm" onClick={() => setNewClient(null)}>Cancel</Button>
              </div>
            ))}
        </>
      );
      case 'date_worked': return <Input id="ts-date_worked" type="date" max={config.today} value={form.date_worked} onChange={set('date_worked')} />;
      case 'period_ended': return <Input id="ts-period_ended" type="date" value={form.period_ended} onChange={set('period_ended')} />;
      case 'agent_id': return select('agent_id', config.users.map((user) => ({ id: String(user.id), name: user.name })), 'Select', !canPickAgent);
      case 'description': return <Textarea id="ts-description" rows={3} maxLength={2000} value={form.description} onChange={set('description')} />;
      case 'count_number': return <Input id="ts-count_number" type="number" min="0" step="1" value={form.count_number} onChange={set('count_number')} />;
      case 'hours': return isEdit
        ? <p className="text-sm text-muted sm:pt-2">Hours are kept in the time log on the entry, so each person adds their own.</p>
        : <Input id="ts-hours" type="number" min="0.25" max="24" step="0.25" placeholder="e.g. 2.5" value={form.hours} onChange={set('hours')} />;
      default: return field.type === 'dropdown'
        ? select(key, optionsFor(field))
        : <Input id={`ts-${key}`} maxLength={120} value={form[key]} onChange={set(key)} />;
    }
  };
  const hint = (field) => {
    if (field.help) return field.help;
    if (field.key === 'task_id' && !task) return 'Pick the task your manager created. Client, agent and description fill in for you.';
    if (field.key === 'client_id') return canAddClient ? 'This is your list from Settings → Clients.' : 'Client missing? Ask your manager or admin to add it in Settings → Clients.';
    if (field.key === 'agent_id' && !canPickAgent) return 'Your entries are logged under your own name.';
    return null;
  };

  const footer = isEdit
    ? <><Button variant="primary" disabled={saving} onClick={() => save('edit')}>Save changes</Button><Button onClick={onClose}>Cancel</Button></>
    : <>
        <Button variant="primary" disabled={saving} onClick={() => save('submit')}>Submit</Button>
        <Button variant="primary" disabled={saving} onClick={() => save('new')}>Submit and New</Button>
        <Button disabled={saving} onClick={() => save('draft')}>Save Draft</Button>
        <Button onClick={onClose}>Cancel</Button>
      </>;

  return (
    <Modal title={isEdit ? `Edit ${layout.name || 'Timesheet'}` : `Add ${layout.name || 'Timesheet'}`} onClose={onClose} footer={footer} size="lg">
      <p className="mb-4 border-b border-line pb-3 text-sm font-semibold">Job Configuration Details</p>
      {visible.map((field) => (
        <FormRow key={field.key} label={field.type === 'checkbox' ? '' : field.label} htmlFor={`ts-${field.key}`}
          required={field.required && !(field.key === 'hours' && isEdit)} error={errors[field.key]} hint={hint(field)}>
          {control(field)}
        </FormRow>
      ))}
    </Modal>
  );
}
