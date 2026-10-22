import React, { useState } from 'react';
import TaskCard from './TaskCard';
import { STATUS_DOT } from './taskMeta';

// One board column. Highlights while a card is dragged over it.
const TaskQueue = ({ title, statusValue, tasks, handleDrop, ...cardProps }) => {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(false); }}
      onDrop={(event) => { event.preventDefault(); setOver(false); const taskId = event.dataTransfer.getData('taskId'); if (taskId) handleDrop(taskId, statusValue); }}
      className={`flex min-h-[420px] flex-col rounded-lg border p-2.5 transition-colors ${over ? 'border-accent bg-accent-soft/50' : 'border-line bg-subtle'}`}>
      <header className="mb-2.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[statusValue]}`} />{title}</span>
        <span className="rounded-full bg-surface px-2 font-mono text-xs text-muted">{tasks.length}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2">
        {tasks.map((task) => <TaskCard key={task.id} task={task} {...cardProps} />)}
        {!tasks.length && <div className="grid flex-1 place-items-center rounded-md border border-dashed border-line p-6 text-center text-xs text-muted">Drop a task here</div>}
      </div>
    </div>
  );
};

export default TaskQueue;
