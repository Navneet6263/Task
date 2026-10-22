import React from 'react';

const TYPES = [
  { value: 'task', label: 'Task', description: 'General work', icon: '✓', dot: 'bg-accent' },
  { value: 'bug', label: 'Bug', description: 'Issue or defect', icon: '!', dot: 'bg-danger' },
  { value: 'story', label: 'Story', description: 'User outcome', icon: '◇', dot: 'bg-info' },
  { value: 'feature', label: 'Feature', description: 'New capability', icon: '+', dot: 'bg-accent' },
  { value: 'enhancement', label: 'Enhancement', description: 'Improve existing', icon: '↗', dot: 'bg-warn' },
];

const TaskTypeRail = ({ value, onChange }) => (
  <aside className="border-b border-line bg-subtle px-3 py-4 lg:border-b-0 lg:border-r lg:py-5">
    <p className="mb-2 px-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Work type</p>
    <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {TYPES.map((type) => {
        const selected = value === type.value;
        return (
          <button key={type.value} type="button" aria-pressed={selected} onClick={() => onChange(type.value)}
            className={`flex min-w-[132px] items-center gap-2.5 rounded-md border px-2.5 py-2 text-left lg:w-full lg:min-w-0 ${selected ? 'border-line bg-surface text-ink shadow-sm' : 'border-transparent text-muted hover:bg-surface hover:text-ink'}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-bold ${selected ? `${type.dot} text-white` : 'border border-line bg-surface'}`} aria-hidden="true">{type.icon}</span>
            <span className="min-w-0">
              <strong className="block text-xs font-semibold">{type.label}</strong>
              <small className="block truncate text-[10px] text-muted">{type.description}</small>
            </span>
          </button>
        );
      })}
    </div>
  </aside>
);

export default TaskTypeRail;
