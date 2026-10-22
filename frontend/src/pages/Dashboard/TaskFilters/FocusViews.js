import React from 'react';

const OPTIONS = [
  { value: '', label: 'All Work', hint: 'Everything matching your filters' },
  { value: 'MY_DAY', label: 'My Day', hint: 'Your due and overdue work' },
  { value: 'DUE_TODAY', label: 'Due Today', hint: 'Tasks due today' },
  { value: 'OVERDUE', label: 'Overdue', hint: 'Open tasks past their due date' },
];

const FocusViews = ({ value, onChange }) => (
  <div className="relative z-20 flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick task views">
    <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Focus</span>
    {OPTIONS.map((option) => {
      const active = value === option.value;
      return (
        <button key={option.value || 'all'} type="button" title={option.hint} aria-pressed={active} onClick={() => onChange(option.value)}
          className={`h-8 rounded-md border px-3 text-xs font-semibold ${active ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-ink'}`}>
          {option.label}
        </button>
      );
    })}
  </div>
);

export default FocusViews;
