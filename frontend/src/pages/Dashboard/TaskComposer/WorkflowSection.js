import React from 'react';

const PLACEHOLDERS = {
  bug: 'e.g. Fix login button on mobile',
  feature: 'e.g. Add dark mode support',
  enhancement: 'e.g. Improve dashboard loading speed',
  story: 'e.g. Let users filter tasks by client',
  task: 'Write a clear, result-focused title',
};

const DESCRIPTION_HINTS = {
  bug: 'Include what happened, what you expected, and how to reproduce it.',
  story: 'Explain the user, their goal, and why the outcome matters.',
  task: 'Explain the expected output, dependencies, and delivery details.',
};

const WorkflowSection = ({ taskForm, updateTaskFormField }) => (
  <section className="rounded-2xl border border-indigo-100 border-t-[3px] border-t-indigo-500 bg-white p-4 shadow-[0_10px_26px_rgba(79,70,229,0.07)] sm:p-5">
    <div className="mb-4 flex items-end justify-between gap-3">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-indigo-600">01 · Essentials</p><h4 className="mt-1 text-[16px] font-extrabold tracking-tight text-slate-900">What needs to be done?</h4></div>
      <span className="hidden text-[10px] font-bold text-slate-400 sm:block">Keep it clear and actionable</span>
    </div>
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-slate-700">Task title <span className="text-red-500">*</span></span>
      <input autoFocus maxLength={255} required className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" placeholder={PLACEHOLDERS[taskForm.issue_type] || PLACEHOLDERS.task} value={taskForm.title} onChange={(event) => updateTaskFormField('title', event.target.value)} />
      <small className="text-right text-[10px] font-semibold text-slate-400">{taskForm.title.length}/255</small>
    </label>
    <label className="mt-2 flex flex-col gap-1.5">
      <span className="text-xs font-bold text-slate-700">Description</span>
      <textarea className="min-h-[100px] resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" placeholder={DESCRIPTION_HINTS[taskForm.issue_type] || DESCRIPTION_HINTS.task} value={taskForm.description} onChange={(event) => updateTaskFormField('description', event.target.value)} />
    </label>
  </section>
);

export default WorkflowSection;
