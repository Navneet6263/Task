import React, { useState } from 'react';
import { readPreference, writePreference } from '../../services/preferences';
import { localDate } from '../../services/localDate';
import { Button, Select } from '../../ui';

export default function MyDayPlan({ teamId, tasks, onOpen }) {
  const key = `top-three:${teamId}:${localDate()}`;
  const [pinned, setPinned] = useState(() => readPreference(key, []));
  const [choice, setChoice] = useState('');
  const save = (next) => { if (writePreference(key, next)) setPinned(next); else alert('Could not save your plan in this browser.'); };
  const available = tasks.filter((task) => !pinned.some((item) => item.id === task.id));
  const pin = () => {
    const task = available.find((item) => String(item.id) === choice);
    if (task) save([...pinned, { id: task.id, title: task.title }]);
    setChoice('');
  };

  return (
    <section className="rounded-md border border-line bg-subtle p-3">
      <h3 className="text-sm font-semibold">My top 3 today</h3>
      <p className="mt-0.5 text-xs text-muted">A private plan for today, saved on this browser. It does not change task priority.</p>
      <div className="my-2 flex flex-wrap gap-2">
        {pinned.map((task, index) => (
          <div key={task.id} className="flex items-center rounded-md border border-line bg-surface text-sm">
            <button type="button" className="max-w-[220px] truncate px-3 py-1.5 text-left" onClick={() => onOpen(task)}>{index + 1}. {task.title}</button>
            <button type="button" aria-label={`Unpin ${task.title}`} className="px-2 text-muted hover:text-danger" onClick={() => save(pinned.filter((item) => item.id !== task.id))}>×</button>
          </div>
        ))}
      </div>
      {pinned.length < 3 && (
        <div className="flex gap-2">
          <Select aria-label="Choose today's focus task" value={choice} onChange={(event) => setChoice(event.target.value)} className="!w-auto min-w-0 max-w-full">
            <option value="">Choose from this page</option>
            {available.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </Select>
          <Button size="sm" disabled={!choice} onClick={pin}>Pin</Button>
        </div>
      )}
    </section>
  );
}
