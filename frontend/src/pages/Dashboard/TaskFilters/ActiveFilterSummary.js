import React from 'react';

const LABELS = { priorities: 'Priority', statuses: 'Status', issueTypes: 'Type', assignees: 'Members', clientNames: 'Client', search: 'Search', createdFrom: 'From', createdTo: 'To' };

export default function ActiveFilterSummary({ filters, setters, members, onClear }) {
  const chips = Object.entries(filters).filter(([key, value]) => key !== 'activeCount' && (Array.isArray(value) ? value.length : value));
  if (!chips.length) return null;
  return (
    <div aria-label="Active filters" className="relative z-10 flex flex-wrap items-center gap-2 text-xs">
      {chips.map(([key, value]) => {
        const values = Array.isArray(value) ? value : [value];
        const text = values.map((item) => (key === 'assignees' ? members.find((m) => String(m.id) === String(item))?.name || item : item)).join(', ');
        return (
          <button key={key} type="button" title={`Remove ${LABELS[key]} filter`} onClick={() => setters[key](Array.isArray(value) ? [] : '')}
            className="max-w-full truncate rounded-full bg-info-soft px-3 py-1 font-medium text-info hover:brightness-95">
            {LABELS[key]}: {text} ×
          </button>
        );
      })}
      <button type="button" onClick={onClear} className="px-1 text-muted underline hover:text-ink">Clear filters</button>
    </div>
  );
}
