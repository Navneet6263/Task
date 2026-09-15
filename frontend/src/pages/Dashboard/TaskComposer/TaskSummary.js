import React from 'react';

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const TYPE_META = {
  bug: { label: 'Bug', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', tip: 'Include repeatable steps and the expected result.' },
  feature: { label: 'Feature', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', tip: 'Add acceptance criteria so “done” is clear.' },
  enhancement: { label: 'Enhancement', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', tip: 'Explain the current experience and desired improvement.' },
  story: { label: 'Story', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', tip: 'Describe the user, goal, and expected value.' },
  task: { label: 'Task', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', tip: 'A clear result-focused title helps work move faster.' },
};

const TaskSummary = ({ taskForm, selectedTeam, members }) => {
  const meta = TYPE_META[taskForm.issue_type] || TYPE_META.task;
  const member = members.find((item) => Number(item.id) === Number(taskForm.assigned_to));
  const readyCount = [taskForm.title, taskForm.due_date].filter(Boolean).length;
  const priorityStyle = taskForm.priority === 'HIGH' ? 'bg-red-100 text-red-700' : taskForm.priority === 'LOW' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

  return (
    <aside className="border-t border-indigo-100 bg-gradient-to-b from-indigo-50 via-blue-50/70 to-purple-50/60 p-4 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-5">
      <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-indigo-600">Live preview</p>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap gap-1.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${meta.badge}`}>{meta.label}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${priorityStyle}`}>{taskForm.priority || 'MEDIUM'}</span></div>
        <h4 className="mt-3 break-words text-[15px] font-extrabold leading-snug text-slate-900">{taskForm.title || 'Your task title will appear here'}</h4>
        <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-slate-500">{taskForm.description || 'Add a short description to give the assignee enough context.'}</p>
        <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {[['Owner', member?.name || 'Unassigned'], ['Due', formatDate(taskForm.due_date)], ['Team', selectedTeam?.name || 'Current team'], ['Client', taskForm.client_name || 'Not specified']].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 py-2.5 text-[10px]"><span className="font-semibold text-slate-400">{label}</span><strong className="max-w-[150px] truncate text-right text-slate-800">{value}</strong></div>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-3.5">
        <div className="flex items-center justify-between"><strong className="text-[11px] text-indigo-900">Ready to create</strong><span className="text-[10px] font-extrabold text-indigo-700">{readyCount}/2</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100"><i className="block h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${readyCount * 50}%` }} /></div>
        <p className="mt-2 text-[10px] leading-relaxed text-indigo-800">{readyCount === 2 ? 'Everything required is ready.' : 'Add a title and due date to continue.'}</p>
      </section>

      <section className="mt-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3"><div className="flex gap-2"><i className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} /><p className="text-[10px] leading-relaxed text-slate-600"><strong className="block text-slate-800">Helpful tip</strong>{meta.tip}</p></div></section>
    </aside>
  );
};

export default TaskSummary;
