import React from 'react';
import { ComposerSection, Fld, Inp, Sel } from './fields';

const dateFromToday = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const DATES = [
  { label: 'Assigned Date', key: 'assigned_date' },
  { label: 'Start Date', key: 'start_date' },
  { label: 'Due Date', key: 'due_date', required: true },
];
const QUICK_DUE = [['Today', 0], ['Tomorrow', 1], ['In 7 days', 7], ['In 14 days', 14]];

const OwnershipSection = ({ taskForm, updateTaskFormField, members }) => (
  <ComposerSection step={2} title="Who owns it and when?">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Fld label="Priority" req>
        <Sel value={taskForm.priority} onChange={(event) => updateTaskFormField('priority', event.target.value)}
          opts={[{ v: 'LOW', l: 'Low Priority' }, { v: 'MEDIUM', l: 'Medium Priority' }, { v: 'HIGH', l: 'High Priority' }]} />
      </Fld>
      <Fld label="Assignee">
        <Sel value={taskForm.assigned_to} onChange={(event) => updateTaskFormField('assigned_to', event.target.value)} placeholder="Unassigned"
          opts={members.map((m) => ({ v: m.id, l: `${m.name}${Number.isFinite(Number(m.current_tasks)) ? ` · ${m.current_tasks} active` : ''}` }))} />
      </Fld>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {DATES.map(({ label, key, required }) => (
        <Fld key={key} label={label} req={required}>
          <Inp type="date" required={required} value={taskForm[key]} onChange={(event) => updateTaskFormField(key, event.target.value)} />
        </Fld>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted">Quick due:</span>
      {QUICK_DUE.map(([label, days]) => (
        <button key={label} type="button" onClick={() => updateTaskFormField('due_date', dateFromToday(days))}
          className="rounded-md border border-line bg-subtle px-2.5 py-1 text-xs font-medium text-muted hover:border-accent/60 hover:text-accent">
          {label}
        </button>
      ))}
    </div>
  </ComposerSection>
);

export default OwnershipSection;
