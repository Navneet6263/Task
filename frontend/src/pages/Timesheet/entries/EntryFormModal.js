import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, FormRow, Input, Modal, Select, Textarea } from '../../../ui';
import { errorOf, fieldsOf } from '../format';
import TaskPicker from './TaskPicker';

const REQUIRED = ['client_id', 'job_type', 'work_type', 'date_worked', 'agent_id', 'period_type', 'period_ended', 'registration_status', 'count_type', 'count_number'];
const FIELDS = [...REQUIRED, 'description', 'hours', 'task_id'];

const blank = (config) => ({
  ...Object.fromEntries(FIELDS.map((key) => [key, ''])),
  date_worked: config.today,
  agent_id: config.permissions.log_for_others ? '' : String(config.user_id),
});
const fromEntry = (entry) => Object.fromEntries(FIELDS.map((key) => [key, entry[key] === null || entry[key] === undefined ? '' : String(entry[key])]));

// Mirrors the client's "Add Timesheet" screen field for field.
export default function EntryFormModal({ config, entry, initialTask, onClose, onSaved, onClientAdded }) {
  const isEdit = Boolean(entry);
  const [form, setForm] = useState(() => (isEdit ? fromEntry(entry) : blank(config)));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const [added, setAdded] = useState([]);
  const [newClient, setNewClient] = useState(null); // null = closed, string = name being typed
  const [addingClient, setAddingClient] = useState(false);
  const [task, setTask] = useState(() => (entry?.task_id ? { id: entry.task_id, title: entry.task_title, status: entry.task_status } : null));

  // Keep an already saved value selectable even if an admin has since switched that option off.
  const optionsFor = (group) => {
    const labels = (config.options[group] || []).map((option) => option.label);
    return form[group] && !labels.includes(form[group]) ? [form[group], ...labels] : labels;
  };
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

  // Managers and admins can add a missing client without leaving the form.
  const addClient = async () => {
    const name = String(newClient || '').trim();
    if (!name) return;
    setAddingClient(true);
    try {
      const { data } = await timesheet.createClient(name);
      setAdded((prev) => [...prev, data]);
      setForm((prev) => ({ ...prev, client_id: String(data.id) }));
      setNewClient(null);
      notify(`${name} added and selected.`, 'success');
      onClientAdded?.();
    } catch (error) { notify(errorOf(error, 'Could not add the client.')); }
    finally { setAddingClient(false); }
  };

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

  const row = (key, label, required, control, hint) => (
    <FormRow label={label} htmlFor={`ts-${key}`} required={required} error={errors[key]} hint={hint}>{control}</FormRow>
  );
  const select = (key, list, placeholder = 'Select', disabled = false) => (
    <Select id={`ts-${key}`} value={form[key]} onChange={set(key)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {list.map((item) => (typeof item === 'string' ? <option key={item} value={item}>{item}</option> : <option key={item.id} value={item.id}>{item.name}</option>))}
    </Select>
  );

  const canAddClient = config.permissions.manage_clients;
  const clientControl = (
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

  const footer = isEdit
    ? <><Button variant="primary" disabled={saving} onClick={() => save('edit')}>Save changes</Button><Button onClick={onClose}>Cancel</Button></>
    : <>
        <Button variant="primary" disabled={saving} onClick={() => save('submit')}>Submit</Button>
        <Button variant="primary" disabled={saving} onClick={() => save('new')}>Submit and New</Button>
        <Button disabled={saving} onClick={() => save('draft')}>Save Draft</Button>
        <Button onClick={onClose}>Cancel</Button>
      </>;
  const canPickAgent = config.permissions.log_for_others;

  return (
    <Modal title={isEdit ? 'Edit Timesheet' : 'Add Timesheet'} onClose={onClose} footer={footer} size="lg">
      <p className="mb-4 border-b border-line pb-3 text-sm font-semibold">Job Configuration Details</p>
      {row('task_id', 'Task', false, <TaskPicker id="ts-task_id" value={task} onPick={pickTask} />,
        task ? null : 'Pick the task your manager created. Client, agent and description fill in for you.')}
      {row('client_id', 'Client', true, clientControl,
        canAddClient ? 'Client names used on tasks appear here automatically.' : 'Client names used on tasks appear here automatically. Still missing? Ask your manager or admin to add it.')}
      {row('job_type', 'Job Type', true, select('job_type', optionsFor('job_type')))}
      {row('work_type', 'Work Type', true, select('work_type', optionsFor('work_type')))}
      {row('date_worked', 'Date worked', true, <Input id="ts-date_worked" type="date" max={config.today} value={form.date_worked} onChange={set('date_worked')} />)}
      {row('agent_id', 'Agent', true, select('agent_id', config.users.map((user) => ({ id: String(user.id), name: user.name })), 'Select', !canPickAgent),
        canPickAgent ? null : 'Your entries are logged under your own name.')}
      {row('period_type', 'Period Type', true, select('period_type', optionsFor('period_type')))}
      {row('period_ended', 'Period Ended', true, <Input id="ts-period_ended" type="date" value={form.period_ended} onChange={set('period_ended')} />)}
      {row('registration_status', 'Registration Status', true, select('registration_status', optionsFor('registration_status')))}
      {row('description', 'Description', false, <Textarea id="ts-description" rows={3} maxLength={2000} value={form.description} onChange={set('description')} />)}
      {row('count_type', 'Count Type', true, select('count_type', optionsFor('count_type')))}
      {row('count_number', 'Count number', true, <Input id="ts-count_number" type="number" min="0" step="1" value={form.count_number} onChange={set('count_number')} />)}
      {isEdit
        ? row('hours', 'Hours worked', false, <p className="text-sm text-muted sm:pt-2">Hours are kept in the time log on the entry, so each person adds their own.</p>)
        : row('hours', 'Hours worked', true, <Input id="ts-hours" type="number" min="0.25" max="24" step="0.25" placeholder="e.g. 2.5" value={form.hours} onChange={set('hours')} />)}
    </Modal>
  );
}
