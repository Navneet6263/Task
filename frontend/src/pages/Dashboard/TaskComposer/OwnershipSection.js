import React from 'react';

const S = (cls) => `h-[42px] rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm px-3.5
  focus:border-[#2f5dff] focus:ring-3 focus:ring-blue-50 transition-all outline-none w-full ${cls || ''}`;

const OwnershipSection = ({ taskForm, updateTaskFormField, members }) => (
  <section className="rounded-2xl border border-[#dbe7ff] bg-white shadow-[0_8px_24px_rgba(148,163,184,0.10)] px-5 py-5 flex flex-col gap-4">
    <div>
      <h4 className="text-[15px] font-bold text-gray-900 tracking-tight">Ownership & Timeline</h4>
      <p className="mt-0.5 text-xs text-gray-500">Assign ownership and set the delivery schedule.</p>
    </div>

    <div className="grid grid-cols-2 gap-3">
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
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
    </div>

    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Assigned Date', key: 'assigned_date' },
        { label: 'Start Date', key: 'start_date' },
        { label: 'Due Date', key: 'due_date', required: true },
      ].map(({ label, key, required }) => (
        <label key={key} className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-gray-700">{label}{required && <span className="text-red-400"> *</span>}</span>
          <input type="date" className={S()} value={taskForm[key]} onChange={(e) => updateTaskFormField(key, e.target.value)} />
        </label>
      ))}
    </div>
  </section>
);

export default OwnershipSection;
