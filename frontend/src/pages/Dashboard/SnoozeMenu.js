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

const itemClass = 'block w-full rounded px-2.5 py-1.5 text-left text-xs font-medium hover:bg-subtle';

const SnoozeMenu = ({ task, onSnooze }) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canSnooze = ['admin', 'company_admin'].includes(user.role) ||
    Number(task.assigned_to) === Number(user.id) || Number(task.assigned_by) === Number(user.id);
  if (!canSnooze) return null;
  const isSnoozed = task.snoozed_until && new Date(task.snoozed_until) > new Date();
  const choose = (event, until) => { event.currentTarget.closest('details').removeAttribute('open'); onSnooze(task, until); };
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className={`cursor-pointer list-none rounded-md border px-2 py-1 text-xs font-semibold ${isSnoozed ? 'border-info/40 bg-info-soft text-info' : 'border-line bg-surface text-muted hover:text-ink'}`}>
        {isSnoozed ? 'Snoozed' : 'Snooze'}
      </summary>
      <div className="absolute right-0 top-8 z-30 min-w-[132px] rounded-md border border-line bg-surface p-1 shadow-pop">
        {OPTIONS.map((option) => <button key={option.label} type="button" onClick={(event) => choose(event, option.until())} className={itemClass}>{option.label}</button>)}
        {isSnoozed && <button type="button" onClick={(event) => choose(event, null)} className={`${itemClass} text-danger`}>Unsnooze</button>}
      </div>
    </details>
  );
};

export default SnoozeMenu;
