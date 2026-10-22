import React, { useState } from 'react';
import { Banner, Button, Input, Select, Textarea } from '../../ui';
import { updatesApi, errorText, changed } from './updatesApi';

const blank = { title: '', summary: '', why_text: '', how_text: '', performance_text: '' };
const templates = {
  saved: { title: 'Saved views: return to your preferred task setup', summary: 'Save a named task view with the filters and layout you choose.',
    why_text: 'Useful when you repeatedly check the same kind of work, such as bugs or your daily queue.',
    how_text: 'Choose your task filters. Select Save current view beside Focus. Name the view, choose which settings to include, and save. Select the saved view to restore those settings. Views are personal to your account and organization in this browser; they remain after refresh, but clearing browser storage removes them.', performance_text: '' },
  header: { title: 'A clearer header and collapsible sidebar', summary: 'A cleaner header with your workspace name, and a sidebar you can collapse.',
    why_text: 'Keep navigation recognizable while giving your tasks more horizontal room.',
    how_text: 'Use the Collapse button at the bottom of the sidebar to collapse or expand it. Your workspace name sits in the header next to the logo. On mobile, use the menu button.', performance_text: '' },
};
const FIELDS = [
  ['title', 'Update / feature name', 160, 'Short and clear, e.g. "Saved views"'],
  ['summary', "What's new or improved?", 3000, 'One or two sentences people see in the feed.'],
  ['why_text', 'Why is it useful?', 3000, 'The problem it solves for the reader.'],
  ['how_text', 'How to use it — step by step', 5000, 'Put each step on its own line.'],
  ['performance_text', 'Performance improvements (optional, verified changes only)', 3000, ''],
];

// Publish or edit a website-wide update.
export default function UpdateEditor({ initial, onSaved, onBusy }) {
  const [draft, setDraft] = useState(initial || blank), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const payload = Object.fromEntries(Object.keys(blank).map(key => [key, draft[key]]));
      if (initial?.id) await updatesApi.edit(initial.id, { ...payload, version: initial.version });
      else await updatesApi.publish(payload);
      changed(); onSaved();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); onBusy(false); }
  };
  return (
    <form className="updates-form flex max-w-3xl flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5" onSubmit={submit}>
      <Banner tone="warn">Everyone using GreenTask can read this after publishing, across all organizations. Do not include private team or client information. The date and time are recorded automatically.</Banner>
      {!initial && (
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Optional starting template</span>
          <Select defaultValue="" onChange={e => { if (templates[e.target.value]) setDraft(templates[e.target.value]); }}>
            <option value="">Start with a blank update</option><option value="saved">Saved views</option><option value="header">Header and sidebar</option>
          </Select>
          <span className="text-xs text-muted">Review the wording and confirm the feature is live before publishing.</span>
        </label>
      )}
      {FIELDS.map(([key, label, max, hint]) => (
        <label key={key} className="flex flex-col gap-1"><span className="text-sm font-medium">{label}</span>
          {key === 'title'
            ? <Input required maxLength={max} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
            : <Textarea required={key !== 'performance_text'} maxLength={max} rows={key === 'how_text' ? 5 : 3} value={draft[key] || ''} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}
          <span className="flex justify-between text-xs text-muted"><span>{hint}</span><span>{String(draft[key] || '').length}/{max}</span></span>
        </label>
      ))}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div><Button type="submit" variant="primary" className="updates-primary" disabled={busy}>{busy ? 'Saving...' : initial ? 'Publish changes' : 'Publish update'}</Button></div>
    </form>
  );
}
