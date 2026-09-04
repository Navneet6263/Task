import React from 'react';

const OPTIONS = [
  { value: '', label: 'All Work', icon: '◫', hint: 'Everything matching your filters' },
  { value: 'MY_DAY', label: 'My Day', icon: '◎', hint: 'Your due and overdue work' },
  { value: 'DUE_TODAY', label: 'Due Today', icon: '◷', hint: 'Tasks due today' },
  { value: 'OVERDUE', label: 'Overdue', icon: '!', hint: 'Open tasks past their due date' },
];

const FocusViews = ({ value, onChange }) => (
  <div className="relative z-20 flex flex-wrap items-center gap-2" aria-label="Quick task views">
    <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mr-1">Focus</span>
    {OPTIONS.map((option) => (
      <button
        key={option.value || 'all'}
        type="button"
        title={option.hint}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={`h-8 px-3 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1.5 ${
          value === option.value
            ? 'border-indigo-500 bg-indigo-600 text-white shadow-[0_5px_14px_rgba(79,70,229,0.22)]'
            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
        }`}
      >
        <span aria-hidden="true">{option.icon}</span>{option.label}
      </button>
    ))}
  </div>
);

export default FocusViews;
