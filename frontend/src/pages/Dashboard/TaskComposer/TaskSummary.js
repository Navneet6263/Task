import React from 'react';
import { Chip, Meter } from '../../../ui';
import { PRIORITY_TONE } from '../tones';

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const TYPE_META = {
  bug: { label: 'Bug', tone: 'danger', tip: 'Include repeatable steps and the expected result.' },
  feature: { label: 'Feature', tone: 'ok', tip: 'Add acceptance criteria so “done” is clear.' },
  enhancement: { label: 'Enhancement', tone: 'warn', tip: 'Explain the current experience and desired improvement.' },
  story: { label: 'Story', tone: 'info', tip: 'Describe the user, goal, and expected value.' },
  task: { label: 'Task', tone: 'neutral', tip: 'A clear result-focused title helps work move faster.' },
};

const TaskSummary = ({ taskForm, selectedTeam, members }) => {
  const meta = TYPE_META[taskForm.issue_type] || TYPE_META.task;
  const member = members.find((item) => Number(item.id) === Number(taskForm.assigned_to));
  const readyCount = [taskForm.title, taskForm.due_date].filter(Boolean).length;
  const rows = [['Owner', member?.name || 'Unassigned'], ['Due', formatDate(taskForm.due_date)], ['Team', selectedTeam?.name || 'Current team'], ['Client', taskForm.client_name || 'Not specified']];

  return (
    <aside className="border-t border-line bg-subtle p-4 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Live preview</p>
      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap gap-1"><Chip tone={meta.tone}>{meta.label}</Chip><Chip tone={PRIORITY_TONE[taskForm.priority] || 'warn'}>{taskForm.priority || 'MEDIUM'}</Chip></div>
        <h4 className="mt-3 break-words text-[15px] font-semibold leading-snug">{taskForm.title || 'Your task title will appear here'}</h4>
        <p className="mt-2 line-clamp-4 text-xs text-muted">{taskForm.description || 'Add a short description to give the assignee enough context.'}</p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 py-2 text-xs">
              <dt className="text-muted">{label}</dt><dd className="max-w-[150px] truncate text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-3 rounded-lg border border-line bg-surface p-3.5">
        <div className="mb-2 flex items-center justify-between"><strong className="text-xs font-semibold">Ready to create</strong><span className="font-mono text-xs text-muted">{readyCount}/2</span></div>
        <Meter value={readyCount} max={2} label="Required fields filled" />
        <p className="mt-2 text-xs text-muted">{readyCount === 2 ? 'Everything required is ready.' : 'Add a title and due date to continue.'}</p>
      </section>
      <p className="mt-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-xs text-muted"><strong className="block text-ink">Helpful tip</strong>{meta.tip}</p>
    </aside>
  );
};

export default TaskSummary;
