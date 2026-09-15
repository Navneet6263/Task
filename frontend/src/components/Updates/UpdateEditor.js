import React, { useState } from 'react';
import { updatesApi, errorText, changed } from './updatesApi';
const blank = { title: '', summary: '', why_text: '', how_text: '', performance_text: '' };
const templates = {
  saved: { title: 'Saved views: return to your preferred task setup', summary: 'Save a named task view with the filters and layout you choose.',
    why_text: 'Useful when you repeatedly check the same kind of work, such as bugs or your daily queue.',
    how_text: 'Choose your task filters. Select Save current view beside Focus. Name the view, choose which settings to include, and save. Select the saved view to restore those settings. Views are personal to your account and organization in this browser; they remain after refresh, but clearing browser storage removes them.', performance_text: '' },
  header: { title: 'A clearer header and collapsible sidebar', summary: 'A blue logo, subtle glass header, and an aligned sidebar divider.',
    why_text: 'Keep navigation recognizable while giving your tasks more horizontal room.',
    how_text: 'Use the arrow on the sidebar edge to collapse or expand it. The header logo stays visible; the divider disappears when the sidebar is collapsed. On mobile, use the menu button.', performance_text: '' },
};
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
  return <form className="updates-form" onSubmit={submit}>
    <p className="updates-hint">Website-wide feature update: everyone using GreenTask can read this after publishing, across all organizations. Do not include private team or client information. Date and time are recorded automatically.</p>
    {!initial && <label>Optional starting template<select defaultValue="" onChange={e => { if (templates[e.target.value]) setDraft(templates[e.target.value]); }}>
      <option value="">Start with a blank update</option><option value="saved">Saved views</option><option value="header">Header and sidebar</option>
    </select><small>Review the wording and confirm availability before publishing.</small></label>}
    {[
      ['title', 'Update / feature name', 160], ['summary', "What's new or improved?", 3000],
      ['why_text', 'Why is it useful?', 3000], ['how_text', 'How to use it — step by step', 5000],
      ['performance_text', 'Performance improvements (optional, verified changes only)', 3000],
    ].map(([key, label, max]) => <label key={key}>{label}{key === 'title'
      ? <input required maxLength={max} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
      : <textarea required={key !== 'performance_text'} maxLength={max} rows={key === 'how_text' ? 5 : 3} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</label>)}
    {error && <p role="alert" className="updates-error">{error}</p>}
    <button className="updates-primary" disabled={busy}>{busy ? 'Saving...' : initial ? 'Publish changes' : 'Publish update'}</button>
  </form>;
}
