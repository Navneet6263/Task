import React, { useState } from 'react';
import { readPreference, writePreference } from '../../../services/preferences';
import { Button, Select } from '../../../ui';

export default function TemplatePicker({ form, onApply, teamId }) {
  const key = `templates:${teamId}`;
  const [templates, setTemplates] = useState(() => readPreference(key, []));
  const [selected, setSelected] = useState('');
  const persist = (next) => { if (writePreference(key, next)) setTemplates(next); else alert('Could not save templates in this browser.'); };
  const save = () => {
    const name = window.prompt('Template name')?.trim().slice(0, 40);
    if (!name) return;
    if (templates.some((item) => item.name.toLowerCase() === name.toLowerCase()) && !window.confirm('Replace this template?')) return;
    const { reference_image, assigned_date, start_date, due_date, ...fields } = form;
    persist([{ name, fields }, ...templates.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 20));
  };
  const apply = () => {
    const item = templates.find((row) => row.name === selected);
    if (item && window.confirm('Apply this template to the current form? Dates and reference image stay unchanged.')) Object.entries(item.fields).forEach(([field, value]) => onApply(field, value));
  };
  const remove = () => {
    if (window.confirm('Delete this personal template?')) { persist(templates.filter((item) => item.name !== selected)); setSelected(''); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3">
      <Select aria-label="Personal task templates" className="!w-auto min-w-0" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Personal templates</option>
        {templates.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
      </Select>
      <Button size="sm" variant="ghost" disabled={!selected} onClick={apply}>Apply</Button>
      <Button size="sm" variant="ghost" disabled={!form.title.trim()} onClick={save}>Save as template</Button>
      {selected && <Button size="sm" variant="danger" onClick={remove}>Delete template</Button>}
    </div>
  );
}
