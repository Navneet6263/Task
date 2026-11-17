import React from 'react';

// Which fields are not needed for which Job Type. A ticked box greys that field out in the timesheet
// form for that Job Type: it is not required and is saved empty. Stored on each field as skip_for.
export const skipFor = (field) => field.skip_for || [];
export const skippedFor = (layout, jobType) => {
  const job = String(jobType ?? '').trim().toLowerCase();
  if (!job) return new Set();
  return new Set((layout?.fields || []).filter((f) => !f.hidden && skipFor(f).some((v) => v.toLowerCase() === job)).map((f) => f.key));
};
// Fields a rule can apply to: shown, not locked (client, date and hours always stay), and not Job Type itself.
export const ruleFields = (layout) => (layout?.fields || []).filter((f) => !f.hidden && !f.locked && f.key !== 'job_type' && f.key !== 'task_id');

export default function JobTypeRules({ draft, onChange, disabled = false }) {
  const jobField = draft.fields.find((f) => f.key === 'job_type');
  const jobs = jobField && !jobField.hidden && jobField.type === 'dropdown' ? jobField.options || [] : [];
  const fields = ruleFields(draft);
  if (!jobs.length || !fields.length) return null;
  const ticked = (field, job) => skipFor(field).includes(job);
  const toggle = (key, job) => onChange({
    ...draft,
    fields: draft.fields.map((f) => {
      if (f.key !== key) return f;
      const next = ticked(f, job) ? skipFor(f).filter((v) => v !== job) : [...skipFor(f), job];
      const { skip_for: _old, ...rest } = f;
      return next.length ? { ...rest, skip_for: next } : rest;
    }),
  });
  const count = fields.reduce((n, f) => n + skipFor(f).length, 0);

  return (
    <section aria-label="Fields not needed for a job type" className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[15px] font-semibold">Fields not needed for a job type</h3>
        <p className="mt-0.5 text-sm text-muted">Tick a box when a field does not apply to that {jobField.label}. In the form it is greyed out, does not need filling and is saved empty. {count ? `${count} ${count === 1 ? 'rule' : 'rules'} set.` : 'No rules yet.'}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-subtle text-[11px] uppercase tracking-wider text-muted">
              <th className="sticky left-0 z-[1] bg-subtle px-3 py-2 text-left font-semibold">{jobField.label}</th>
              {fields.map((f) => <th key={f.key} className="px-2 py-2 text-center font-semibold normal-case tracking-normal">{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-3 py-2 text-left font-medium">{job}</th>
                {fields.map((f) => (
                  <td key={f.key} className="px-2 py-2 text-center">
                    <input type="checkbox" disabled={disabled} className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={ticked(f, job)}
                      aria-label={`${f.label} not needed for ${job}`} onChange={() => toggle(f.key, job)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
