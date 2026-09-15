import React from 'react';

const TYPES = [
  { value: 'task', label: 'Task', description: 'General work', icon: '✓', active: 'border-indigo-200 bg-white text-indigo-700 shadow-[0_8px_22px_rgba(79,70,229,0.10)]', iconClass: 'bg-indigo-600 text-white' },
  { value: 'bug', label: 'Bug', description: 'Issue or defect', icon: '!', active: 'border-red-200 bg-white text-red-700 shadow-[0_8px_22px_rgba(239,68,68,0.10)]', iconClass: 'bg-red-500 text-white' },
  { value: 'story', label: 'Story', description: 'User outcome', icon: '◇', active: 'border-purple-200 bg-white text-purple-700 shadow-[0_8px_22px_rgba(147,51,234,0.10)]', iconClass: 'bg-purple-500 text-white' },
  { value: 'feature', label: 'Feature', description: 'New capability', icon: '+', active: 'border-emerald-200 bg-white text-emerald-700 shadow-[0_8px_22px_rgba(16,185,129,0.10)]', iconClass: 'bg-emerald-500 text-white' },
  { value: 'enhancement', label: 'Enhancement', description: 'Improve existing', icon: '↗', active: 'border-amber-200 bg-white text-amber-700 shadow-[0_8px_22px_rgba(245,158,11,0.10)]', iconClass: 'bg-amber-500 text-white' },
];

const TaskTypeRail = ({ value, onChange }) => (
  <aside className="border-b border-indigo-100 bg-gradient-to-b from-indigo-50 via-blue-50/70 to-slate-50 px-3 py-4 lg:border-b-0 lg:border-r lg:px-3.5 lg:py-5">
    <p className="mb-2.5 px-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Work type</p>
    <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {TYPES.map((type) => {
        const selected = value === type.value;
        return (
          <button key={type.value} type="button" aria-pressed={selected} onClick={() => onChange(type.value)} className={`flex min-w-[132px] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all lg:w-full lg:min-w-0 ${selected ? type.active : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white'}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border text-sm font-black ${selected ? type.iconClass : 'border-slate-200 bg-white text-slate-500'}`}>{type.icon}</span>
            <span className="min-w-0"><strong className="block text-[12px] leading-tight">{type.label}</strong><small className="mt-0.5 block truncate text-[9px] font-semibold text-slate-400">{type.description}</small></span>
          </button>
        );
      })}
    </div>
  </aside>
);

export default TaskTypeRail;
