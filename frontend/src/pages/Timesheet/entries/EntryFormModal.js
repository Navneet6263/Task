import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, FormRow, Input, Modal, SearchSelect, Select, Textarea } from '../../../ui';
import LayoutField from '../../Dashboard/TaskComposer/LayoutField';
import { errorOf, fieldsOf } from '../format';
import TaskPicker from './TaskPicker';
import { doneByPeople, hasTeam, teamPeople } from '../team';
import AgentPicker from '../../../components/clients/AgentPicker';
import TimesheetFormDesigner from '../../Settings/formDesigner/TimesheetFormDesigner';
import { skippedFor } from '../../Settings/formDesigner/JobTypeRules';
import HoursInput from './HoursInput';

const CORE = ['task_id', 'agent_firm_id', 'client_id', 'job_type', 'work_type', 'date_worked', 'agent_id', 'period_type', 'period_ended', 'registration_status', 'description', 'count_type', 'count_number', 'hours'];

const blank = (config) => ({
  ...Object.fromEntries(CORE.map((key) => [key, ''])),
  date_worked: config.today,
  // The person logged in, unless they cannot be picked at all (a company admin is not in this list).
  agent_id: config.users.some((user) => String(user.id) === String(config.user_id)) ? String(config.user_id) : '',
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
export default function EntryFormModal({ config, entry, initialTask, onClose, onSaved, onClientAdded, onFormChanged }) {
  const isEdit = Boolean(entry);
  // Only admins can change the form right here ("Edit form"); what was typed stays.
  const canDesign = Boolean(config.permissions?.edit_form);
  const [designing, setDesigning] = useState(false);
  const [savedLayout, setSavedLayout] = useState(null);
  useEffect(() => { setSavedLayout(null); }, [config.form]);
  const layout = savedLayout || config.form;
  const visible = layout.fields.filter((f) => !f.hidden);
  const [form, setForm] = useState(() => (isEdit ? fromEntry(entry) : blank(config)));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState([]);
  const [newClient, setNewClient] = useState(null); // null = closed, string = name being typed
  const [addingClient, setAddingClient] = useState(false);
  const [task, setTask] = useState(() => (entry?.task_id ? { id: entry.task_id, title: entry.task_title, status: entry.task_status } : null));
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  // Fields the chosen Job Type does not need (Edit form > "Fields not needed for a job type"): emptied, and
  // greyed out, or hidden when the form's skip_style is 'hide' (Accountrust).
  const skipped = useMemo(() => skippedFor(layout, form.job_type), [layout, form.job_type]);
  const hideSkipped = layout.skip_style === 'hide';
  const skippedList = [...skipped].sort().join(',');
  useEffect(() => {
    if (!skippedList) return;
    setForm((prev) => {
      const next = { ...prev, custom_fields: { ...(prev.custom_fields || {}) } };
      skippedList.split(',').forEach((key) => { if (key in next.custom_fields) delete next.custom_fields[key]; else next[key] = ''; });
      return next;
    });
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !skippedList.split(',').includes(key))));
  }, [skippedList]);
  const setCustom = (key, value) => setForm((prev) => ({ ...prev, custom_fields: { ...(prev.custom_fields || {}), [key]: value } }));

  const clients = useMemo(() => {
    const list = [...config.clients, ...added.filter((a) => !config.clients.some((c) => c.id === a.id))]
      .map((client) => ({ id: String(client.id), name: client.name, agent_id: client.agent_id ? String(client.agent_id) : '' })).sort((a, b) => a.name.localeCompare(b.name));
    if (isEdit && !list.some((client) => client.id === String(entry.client_id))) list.unshift({ id: String(entry.client_id), name: entry.client_name, agent_id: entry.agent_firm_id ? String(entry.agent_firm_id) : '' });
    return list;
  }, [config.clients, added, entry, isEdit]);

  const agentNames = useMemo(() => Object.fromEntries((config.agents || []).map((a) => [String(a.id), a.name])), [config.agents]);
  // Agent first narrows the clients; a client that sits under an agent fills the agent in.
  const agentClients = form.agent_firm_id ? clients.filter((c) => c.agent_id === String(form.agent_firm_id) || c.id === form.client_id) : clients;
  const chooseAgent = (value) => setForm((prev) => {
    const client = clients.find((c) => c.id === prev.client_id);
    return { ...prev, agent_firm_id: value, client_id: value && client?.agent_id && client.agent_id !== value ? '' : prev.client_id };
  });
  const chooseClient = (value) => setForm((prev) => {
    const client = clients.find((c) => c.id === value);
    return { ...prev, client_id: value, agent_firm_id: client?.agent_id || prev.agent_firm_id };
  });

  // Picking a task fills in what we already know: its client and a description. Done by stays as it is.
  const pickTask = (picked) => {
    setTask(picked);
    setForm((prev) => {
      if (!picked) return { ...prev, task_id: '' };
      const next = { ...prev, task_id: String(picked.id) };
      const match = picked.client_name && clients.find((c) => c.name.toLowerCase() === String(picked.client_name).trim().toLowerCase());
      if (match) { next.client_id = match.id; if (match.agent_id) next.agent_firm_id = match.agent_id; }
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
      const { data } = await timesheet.createClient(name, form.agent_firm_id || undefined);
      setAdded((prev) => [...prev, { ...data, agent_id: form.agent_firm_id || null }]);
      setForm((prev) => ({ ...prev, client_id: String(data.id) }));
      setNewClient(null);
      notify(`${data.name} added to your client list and selected.`, 'success');
      onClientAdded?.();
    } catch (error) { notify(errorOf(error, 'Could not add the client.')); }
    finally { setAddingClient(false); }
  };

  const check = (mode) => {
    const next = {};
    const need = mode === 'draft' ? visible.filter((f) => f.key === 'client_id' && !skipped.has(f.key)) : visible.filter((f) => f.required && !skipped.has(f.key) && (f.key !== 'hours' || !isEdit));
    // A draft saved without hours cannot be submitted until they are added here.
    if (mode === 'submit' && needsHours && !(Number(form.hours) > 0)) next.hours = 'Add the hours you worked before submitting.';
    need.forEach((f) => {
      const value = f.kind === 'custom' ? form.custom_fields?.[f.key] : form[f.key];
      if (emptyValue(f, value)) next[f.key] = 'This field is required.';
    });
    if (form.hours && !(Number(form.hours) > 0 && Number(form.hours) <= 24)) next.hours = 'Hours must be more than 0 and at most 24.';
    if (form.date_worked && form.date_worked > config.today) next.date_worked = 'Date worked cannot be in the future.';
    setErrors(next);
    return !Object.keys(next).length;
  };

  const isDraft = isEdit && entry.status === 'DRAFT';
  // Each save raises the entry's version. Keep the latest one, so a second try after a failed submit
  // does not look like someone else's change.
  const [version, setVersion] = useState(entry?.version);
  const [hoursSaved, setHoursSaved] = useState(false);
  const needsHours = isDraft && !Number(entry.total_hours) && !hoursSaved;
  const save = async (mode) => {
    // A draft being saved again only needs a client, like a new draft.
    if (!check(mode === 'edit-submit' ? 'submit' : isDraft && mode === 'edit' ? 'draft' : mode)) return;
    setSaving(true);
    try {
      if (isEdit) {
        // Hours go in only for a draft that has none yet; other entries keep theirs in the time log.
        const withHours = needsHours && Number(form.hours) > 0;
        const response = await timesheet.update(entry.id, { ...form, hours: withHours ? form.hours : '', version });
        if (response?.data?.version) setVersion(response.data.version);
        if (withHours) setHoursSaved(true);
        // A draft can be finished and submitted in one go.
        if (mode === 'edit-submit') await timesheet.submit(entry.id);
        notify(mode === 'edit-submit' ? 'Saved and submitted.' : 'Changes saved.', 'success');
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
  // Only admins fill for others: the whole company, narrowed to their own people in one click.
  const [everyone, setEveryone] = useState(true);
  const doneByOptions = canPickAgent ? doneByPeople(config, everyone, form.agent_id) : config.users;

  const control = (field) => {
    const { key } = field;
    if (field.kind === 'custom') {
      return <LayoutField field={field} value={form.custom_fields?.[key]} onChange={(value) => setCustom(key, value)} ctx={{ idPrefix: 'ts' }} />;
    }
    switch (key) {
      case 'task_id': return <TaskPicker id="ts-task_id" value={task} onPick={pickTask} />;
      case 'agent_firm_id': return <AgentPicker id="ts-agent_firm_id" agents={config.agents || []} value={form.agent_firm_id} onChange={chooseAgent} />;
      case 'client_id': return (
        <>
          <SearchSelect id="ts-client_id" value={form.client_id} onChange={chooseClient} emptyText="No client with that name."
            placeholder={`Search ${agentClients.length} client${agentClients.length === 1 ? '' : 's'}…`}
            options={agentClients.map((c) => ({ value: c.id, label: c.name, hint: form.agent_firm_id ? '' : agentNames[c.agent_id] || '' }))} />
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
      case 'agent_id': return select('agent_id', doneByOptions.map((user) => ({ id: String(user.id), name: user.name })), 'Select', !canPickAgent);
      case 'description': return <Textarea id="ts-description" rows={3} maxLength={2000} value={form.description} onChange={set('description')} />;
      case 'count_number': return <Input id="ts-count_number" type="number" min="0" step="1" value={form.count_number} onChange={set('count_number')} />;
      case 'hours': return isEdit && !needsHours
        ? <p className="text-sm text-muted sm:pt-2">Hours are kept in the time log on the entry, so each person adds their own.</p>
        : <HoursInput id="ts-hours" label="Hours worked" value={form.hours} onChange={(hours) => setForm((prev) => ({ ...prev, hours }))} />;
      default: return field.type === 'dropdown'
        ? select(key, optionsFor(field))
        : <Input id={`ts-${key}`} maxLength={120} value={form[key]} onChange={set(key)} />;
    }
  };
  const hint = (field) => {
    if (field.key === 'job_type' && skipped.size && hideSkipped) {
      const names = visible.filter((f) => skipped.has(f.key)).map((f) => f.label);
      return `Not needed for ${form.job_type}, so not shown: ${names.join(', ')}.`;
    }
    if (field.help) return field.help;
    if (field.key === 'task_id' && !task) return 'Pick the task your manager created. Client, agent and description fill in for you.';
    if (field.key === 'agent_firm_id') return 'Pick the agent first to see only its clients.';
    if (field.key === 'hours' && needsHours) return 'This draft has no hours yet. Add them to submit it.';
    if (field.key === 'hours' && !isEdit) return 'Fill hours, minutes or both: 20 minutes is 0 h 20 min.';
    if (field.key === 'client_id') return form.agent_firm_id ? `Showing ${agentClients.length} client${agentClients.length === 1 ? '' : 's'} of this agent.` : canAddClient ? 'This is your list from Settings → Clients.' : 'Client missing? Ask your manager or admin to add it in Settings → Clients.';
    if (field.key === 'agent_id' && !canPickAgent) return 'Your entries are logged under your own name.';
    if (field.key === 'agent_id' && hasTeam(config)) {
      return (
        <>
          {everyone ? 'Showing everyone in the company. ' : `Showing your team (${teamPeople(config).length} people). `}
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setEveryone((value) => !value)}>{everyone ? 'Show only my team' : 'Show everyone'}</button>
        </>
      );
    }
    return null;
  };

  const footer = isEdit
    ? <>
        {isDraft && <Button variant="primary" disabled={saving} onClick={() => save('edit-submit')}>Save and submit</Button>}
        <Button variant={isDraft ? 'secondary' : 'primary'} disabled={saving} onClick={() => save('edit')}>{isDraft ? 'Save draft' : 'Save changes'}</Button>
        <Button onClick={onClose}>Cancel</Button>
      </>
    : <>
        <Button variant="primary" disabled={saving} onClick={() => save('submit')}>Submit</Button>
        <Button variant="primary" disabled={saving} onClick={() => save('new')}>Submit and New</Button>
        <Button disabled={saving} onClick={() => save('draft')}>Save Draft</Button>
        <Button onClick={onClose}>Cancel</Button>
      </>;

  if (designing) {
    return (
      <Modal title={`Edit the ${layout.name || 'Timesheet'} form`} subtitle="Changes apply to everyone in the company." onClose={() => setDesigning(false)} size="lg">
        <TimesheetFormDesigner embedded onCancel={() => setDesigning(false)}
          onSaved={(saved) => { if (saved) setSavedLayout(saved); setDesigning(false); onFormChanged?.(); }} />
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? `Edit ${layout.name || 'Timesheet'}` : `Add ${layout.name || 'Timesheet'}`} onClose={onClose} footer={footer} size="lg">
      <div className="mb-4 flex items-center gap-3 border-b border-line pb-3">
        <p className="flex-1 text-sm font-semibold">Job Configuration Details</p>
        {canDesign && (
          <button type="button" onClick={() => setDesigning(true)} title="Move, hide or add fields for everyone"
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft">
            <span aria-hidden="true">✎</span>Edit form
          </button>
        )}
      </div>
      {/* Fields the chosen Job Type does not need: greyed out, or left out altogether when the form says so. */}
      {visible.filter((field) => !(hideSkipped && skipped.has(field.key))).map((field) => {
        const off = skipped.has(field.key);
        return (
          <FormRow key={field.key} label={field.type === 'checkbox' ? '' : field.label} htmlFor={`ts-${field.key}`}
            required={field.required && !off && !(field.key === 'hours' && isEdit)} error={off ? '' : errors[field.key]}
            hint={off ? `Not needed for ${form.job_type}.` : hint(field)}>
            {off ? <fieldset disabled aria-disabled="true" className="min-w-0 opacity-50">{control(field)}</fieldset> : control(field)}
          </FormRow>
        );
      })}
    </Modal>
  );
}
