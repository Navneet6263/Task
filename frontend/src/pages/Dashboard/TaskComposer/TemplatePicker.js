import React, { useState } from 'react';
import { readPreference, writePreference } from '../../../services/preferences';
export default function TemplatePicker({ form, onApply, teamId }) {
  const key = `templates:${teamId}`;
  const [templates, setTemplates] = useState(() => readPreference(key, []));
  const [selected, setSelected] = useState('');
  const persist = next => { if (writePreference(key, next)) setTemplates(next); else alert('Could not save templates in this browser.'); };
  const save = () => {
    const name = window.prompt('Template name')?.trim().slice(0, 40);
    if (!name) return;
    if (templates.some(item => item.name.toLowerCase() === name.toLowerCase()) && !window.confirm('Replace this template?')) return;
    const { reference_image, assigned_date, start_date, due_date, ...fields } = form;
    persist([{ name, fields }, ...templates.filter(item => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 20));
  };
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-white p-3 text-sm">
    <select aria-label="Personal task templates" value={selected} onChange={e => setSelected(e.target.value)} className="min-w-0 rounded-lg border p-2"><option value="">Personal templates</option>{templates.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
    <button type="button" disabled={!selected} onClick={() => { const item = templates.find(row => row.name === selected); if (item && window.confirm('Apply this template to the current form? Dates and reference image stay unchanged.')) Object.entries(item.fields).forEach(([key, value]) => onApply(key, value)); }} className="text-blue-700 disabled:opacity-40">Apply</button>
    <button type="button" onClick={save} disabled={!form.title.trim()} className="text-blue-700 disabled:opacity-40">Save as template</button>
    {selected && <button type="button" onClick={() => { if (window.confirm('Delete this personal template?')) { persist(templates.filter(item => item.name !== selected)); setSelected(''); } }} className="text-red-600">Delete template</button>}
  </div>;
}
