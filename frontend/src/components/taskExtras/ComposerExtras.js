import React from 'react';
import LabelPicker from './LabelPicker';
import TaskSearchPicker from './TaskSearchPicker';
import { useTaskMeta } from './taskExtrasStore';

const EMPTY = { label_ids: [], parent: null, blocked_by: [] };

// "Create task" → labels, a parent task and blocking tasks, saved right after the task is created.
export default function ComposerExtras({ value, onChange, teamId }) {
  const { keyOf } = useTaskMeta();
  const extras = { ...EMPTY, ...(value || {}) };
  const set = (patch) => onChange({ ...extras, ...patch });
  const chip = (task, onRemove) => (
    <span key={task.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-subtle px-2 py-1 text-xs">
      <span className="font-mono font-semibold text-accent">{keyOf(task.id)}</span><span className="truncate">{task.title}</span>
      <button type="button" aria-label={`Remove ${keyOf(task.id)}`} onClick={onRemove} className="text-muted hover:text-danger">×</button>
    </span>
  );

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">Organize <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] font-bold uppercase text-accent">New</span></p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="compose-labels" className="text-xs font-medium text-muted">Labels</label>
          <LabelPicker id="compose-labels" value={extras.label_ids} onChange={(label_ids) => set({ label_ids })} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Subtask of <span className="font-normal">(optional)</span></span>
          {extras.parent ? chip(extras.parent, () => set({ parent: null }))
            : <TaskSearchPicker label="Parent task" placeholder="Search the main task…" teamId={teamId} onlyMain onPick={(task) => set({ parent: task })} />}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Blocked by <span className="font-normal">(optional)</span></span>
          {extras.blocked_by.length > 0 && <span className="flex flex-wrap gap-1.5">{extras.blocked_by.map((task) => chip(task, () => set({ blocked_by: extras.blocked_by.filter((t) => t.id !== task.id) })))}</span>}
          {extras.blocked_by.length < 5 && <TaskSearchPicker label="Blocking task" placeholder="Which task must finish first?" exclude={extras.blocked_by.map((t) => t.id)} onPick={(task) => set({ blocked_by: [...extras.blocked_by, task] })} />}
        </div>
      </div>
    </section>
  );
}

// What to send after creating the task, or null when nothing was picked.
export const extrasPayload = (value) => {
  const extras = { ...EMPTY, ...(value || {}) };
  if (!extras.label_ids.length && !extras.parent && !extras.blocked_by.length) return null;
  return {
    label_ids: extras.label_ids,
    ...(extras.parent ? { parent_id: extras.parent.id } : {}),
    links: extras.blocked_by.map((t) => ({ type: 'blocks', inward: true, task_id: t.id })),
  };
};
