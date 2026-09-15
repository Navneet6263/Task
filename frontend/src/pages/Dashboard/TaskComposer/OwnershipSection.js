import React from 'react';

const S = (cls) => `h-[42px] rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm px-3.5
  focus:border-[#2f5dff] focus:ring-3 focus:ring-blue-50 transition-all outline-none w-full ${cls || ''}`;

const dateFromToday = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const OwnershipSection = ({ taskForm, updateTaskFormField, members }) => (
  <section className="rounded-2xl border border-blue-100 border-t-[3px] border-t-blue-500 bg-white shadow-[0_10px_26px_rgba(37,99,235,0.07)] px-5 py-5 flex flex-col gap-4">
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-indigo-600">02 · Ownership</p>
      <h4 className="mt-1 text-[16px] font-extrabold text-gray-900 tracking-tight">Who owns it and when?</h4>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-gray-700">Priority <span className="text-red-400">*</span></span>
        <select className={S()} value={taskForm.priority} onChange={(e) => updateTaskFormField('priority', e.target.value)}>
          <option value="LOW">Low Priority</option>
          <option value="MEDIUM">Medium Priority</option>
          <option value="HIGH">High Priority</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-gray-700">Assignee</span>
        <select className={S()} value={taskForm.assigned_to} onChange={(e) => updateTaskFormField('assigned_to', e.target.value)}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}{Number.isFinite(Number(m.current_tasks)) ? ` · ${m.current_tasks} active` : ''}</option>)}
        </select>
      </label>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[
        { label: 'Assigned Date', key: 'assigned_date' },
        { label: 'Start Date', key: 'start_date' },
        { label: 'Due Date', key: 'due_date', required: true },
      ].map(({ label, key, required }) => (
        <label key={key} className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-gray-700">{label}{required && <span className="text-red-400"> *</span>}</span>
          <input type="date" required={key === 'due_date'} className={S()} value={taskForm[key]} onChange={(e) => updateTaskFormField(key, e.target.value)} />
        </label>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[10px] font-bold text-slate-400">Quick due:</span>{[['Today', 0], ['Tomorrow', 1], ['In 7 days', 7], ['In 14 days', 14]].map(([label, days]) => <button key={label} type="button" onClick={() => updateTaskFormField('due_date', dateFromToday(days))} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">{label}</button>)}</div>
  </section>
);

export default OwnershipSection;
