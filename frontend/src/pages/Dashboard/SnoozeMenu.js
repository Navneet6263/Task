import React from 'react';

const addTime = (amount, unit) => {
  const date = new Date();
  if (unit === 'hours') date.setHours(date.getHours() + amount);
  if (unit === 'days') date.setDate(date.getDate() + amount);
  date.setSeconds(0, 0);
  return date.toISOString();
};

const OPTIONS = [
  { label: '1 hour', until: () => addTime(1, 'hours') },
  { label: 'Tomorrow', until: () => addTime(1, 'days') },
  { label: 'Next week', until: () => addTime(7, 'days') },
];

const SnoozeMenu = ({ task, onSnooze }) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canSnooze = ['admin', 'company_admin'].includes(user.role) ||
    Number(task.assigned_to) === Number(user.id) || Number(task.assigned_by) === Number(user.id);
  if (!canSnooze) return null;
  const isSnoozed = task.snoozed_until && new Date(task.snoozed_until) > new Date();
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="list-none cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-indigo-300">
        {isSnoozed ? 'Snoozed' : 'Snooze'}
      </summary>
      <div className="absolute right-0 top-7 z-30 min-w-[132px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
        {OPTIONS.map((option) => (
          <button key={option.label} type="button" onClick={(event) => { event.currentTarget.closest('details').removeAttribute('open'); onSnooze(task, option.until()); }} className="block w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
            {option.label}
          </button>
        ))}
        {isSnoozed && <button type="button" onClick={(event) => { event.currentTarget.closest('details').removeAttribute('open'); onSnooze(task, null); }} className="block w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-red-600 hover:bg-red-50">Unsnooze</button>}
      </div>
    </details>
  );
};

export default SnoozeMenu;
