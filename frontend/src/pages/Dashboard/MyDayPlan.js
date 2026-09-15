import React, { useState } from 'react';
import { readPreference, writePreference } from '../../services/preferences';
import { localDate } from '../../services/localDate';
export default function MyDayPlan({ teamId, tasks, onOpen }) {
  const key = `top-three:${teamId}:${localDate()}`;
  const [pinned, setPinned] = useState(() => readPreference(key, []));
  const [choice, setChoice] = useState('');
  const save = next => { if (writePreference(key, next)) setPinned(next); else alert('Could not save your plan in this browser.'); };
  const available = tasks.filter(task => !pinned.some(item => item.id === task.id));
  return <section className="relative z-10 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
    <h3 className="text-sm font-bold text-indigo-900">My top 3 today</h3><p className="mt-1 text-xs text-slate-500">A private plan for today, saved on this browser. It does not change task priority.</p>
    <div className="my-2 flex flex-wrap gap-2">{pinned.map((task, index) => <div key={task.id} className="flex items-center rounded-lg border bg-white text-sm"><button className="max-w-[220px] truncate px-3 py-2" onClick={() => onOpen(task)}>{index + 1}. {task.title}</button><button aria-label={`Unpin ${task.title}`} className="px-2" onClick={() => save(pinned.filter(item => item.id !== task.id))}>×</button></div>)}</div>
    {pinned.length < 3 && <div className="flex gap-2"><select aria-label="Choose today's focus task" value={choice} onChange={e => setChoice(e.target.value)} className="min-w-0 max-w-full rounded-lg border p-2 text-sm"><option value="">Choose from this page</option>{available.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select><button disabled={!choice} className="text-sm font-bold text-indigo-700 disabled:opacity-40" onClick={() => { const task = available.find(item => String(item.id) === choice); if (task) save([...pinned, { id: task.id, title: task.title }]); setChoice(''); }}>Pin</button></div>}
  </section>;
}
