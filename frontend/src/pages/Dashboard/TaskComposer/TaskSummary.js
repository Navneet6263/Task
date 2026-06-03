import React from 'react';

const fmt = (v) => { const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

const TYPE_META = {
  bug:         { label: 'Bug Report',    grad: 'from-red-50 to-orange-50 border-red-200',       dot: 'bg-red-500',     tip: 'Include steps to reproduce, expected vs actual behavior.' },
  feature:     { label: 'Feature',       grad: 'from-emerald-50 to-teal-50 border-emerald-200', dot: 'bg-emerald-500', tip: 'Define acceptance criteria and definition of done clearly.' },
  enhancement: { label: 'Enhancement',   grad: 'from-amber-50 to-yellow-50 border-amber-200',   dot: 'bg-amber-500',   tip: 'Describe impact level and effort so the team can plan.' },
  story:       { label: 'User Story',    grad: 'from-purple-50 to-pink-50 border-purple-200',   dot: 'bg-purple-500',  tip: 'Use: "As a [role], I want [goal], so that [reason]".' },
  task:        { label: 'Task',          grad: 'from-blue-50 to-indigo-50 border-blue-200',     dot: 'bg-blue-500',    tip: 'Break complex tasks into subtasks for better tracking.' },
};

const TaskSummary = ({ taskForm, selectedTeam, members }) => {
  const meta = TYPE_META[taskForm.issue_type] || TYPE_META.task;
  const assignee = members.find((m) => Number(m.id) === Number(taskForm.assigned_to))?.name || 'Unassigned';

  const rows = [
    { label: 'Team',     value: selectedTeam?.name || 'No team' },
    { label: 'Type',     value: meta.label },
    { label: 'Client',   value: taskForm.client_name || 'Not specified' },
    { label: 'Priority', value: taskForm.priority || '-' },
    { label: 'Assignee', value: assignee },
    { label: 'Due',      value: fmt(taskForm.due_date) },
  ];

  return (
    <aside className="flex flex-col gap-4">
      <section className={`rounded-2xl border-2 bg-gradient-to-br ${meta.grad} px-5 py-5 flex flex-col gap-3`}>
        <div className="flex items-center gap-2.5 mb-1">
          <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
          <div>
            <h4 className="text-sm font-bold text-gray-900">{meta.label}</h4>
            <p className="text-[11px] text-gray-500">Live Preview</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-white/80 border border-white/60 px-3 py-2 shadow-sm">
              <span className="text-xs text-gray-500 font-medium">{r.label}</span>
              <strong className="text-xs text-gray-900 font-bold text-right max-w-[120px] truncate">{r.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 px-4 py-3.5">
        <p className="text-xs font-bold text-blue-900 mb-1">Pro Tip</p>
        <p className="text-xs text-blue-800 leading-relaxed">{meta.tip}</p>
      </div>
    </aside>
  );
};

export default TaskSummary;
