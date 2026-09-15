import React from 'react';
export default function ActiveFilterSummary({ filters, setters, members, onClear }) {
  const chips = Object.entries(filters).filter(([key, value]) => key !== 'activeCount' && (Array.isArray(value) ? value.length : value));
  if (!chips.length) return null;
  const labels = { priorities: 'Priority', statuses: 'Status', issueTypes: 'Type', assignees: 'Members', clientNames: 'Client', search: 'Search', createdFrom: 'From', createdTo: 'To' };
  return <div aria-label="Active filters" className="relative z-10 flex flex-wrap gap-2 text-xs">
    {chips.map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      const text = values.map(item => key === 'assignees' ? members.find(m => String(m.id) === String(item))?.name || item : item).join(', ');
      return <button key={key} type="button" title={`Remove ${labels[key]} filter`} onClick={() => setters[key](Array.isArray(value) ? [] : '')} className="max-w-full truncate rounded-full bg-blue-50 px-3 py-1.5 text-blue-800">{labels[key]}: {text} ×</button>;
    })}
    <button type="button" onClick={onClear} className="px-2 underline text-slate-600">Clear filters</button>
  </div>;
}
