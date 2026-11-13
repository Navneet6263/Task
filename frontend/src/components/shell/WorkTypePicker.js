import React, { useState } from 'react';
import { taskExtras } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button } from '../../ui';
import useDialog from '../useDialog';
import { reloadTaskMeta } from '../taskExtras/taskExtrasStore';

// The kinds of work, as on Jira's first screen. Each one brings starter labels that fit it.
const KINDS = [
  ['accounting', 'Accounting', '🧾', 'VAT, payroll, bookkeeping'],
  ['software', 'Software development', '💻', 'Frontend, backend, bugs'],
  ['product', 'Product management', '⚙️', 'Roadmap, research'],
  ['marketing', 'Marketing', '📣', 'Campaigns, content'],
  ['design', 'Design', '🎨', 'UI, branding'],
  ['project', 'Project management', '📋', 'Milestones, risks'],
  ['operations', 'Operations', '🛠️', 'Process, vendors'],
  ['it_support', 'IT support', '🖥️', 'Access, incidents'],
  ['hr', 'Human resources', '🧑‍💼', 'Hiring, onboarding'],
  ['customer_service', 'Customer service', '💬', 'Queries, complaints'],
  ['legal', 'Legal', '⚖️', 'Contracts, filings'],
  ['finance', 'Finance', '💰', 'Invoices, payments'],
  ['sales', 'Sales', '📈', 'Leads, proposals'],
  ['data', 'Data science', '📊', 'Analysis, reports'],
];

// Asked once, of an admin, when the company has not said what it works on. Skippable.
export default function WorkTypePicker({ onDone }) {
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (type) => {
    setBusy(true);
    try {
      const { data } = await taskExtras.setWorkType(type);
      await reloadTaskMeta();
      notify(data.labels?.length ? 'Done. Starter labels are ready for your tasks.' : 'Saved.', 'success');
      onDone();
    } catch (err) { notify(err.response?.data?.error || 'Could not save.'); setBusy(false); }
  };
  const dialogRef = useDialog(true, () => save('other'));

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm motion-safe:animate-fade-in sm:p-8">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="What kind of work does your team do?" tabIndex={-1}
        className="my-auto w-full max-w-3xl rounded-2xl border border-line bg-surface p-6 text-ink shadow-pop sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Welcome to GreenTask</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">What kind of work does your team do?</h2>
        <p className="mt-1 text-sm text-muted">We will set up labels that fit, so tasks are easy to sort from day one. You can change them any time.</p>
        <div role="radiogroup" aria-label="Kind of work" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {KINDS.map(([key, label, icon, hint]) => (
            <button key={key} type="button" role="radio" aria-checked={picked === key} onClick={() => setPicked(key)} onDoubleClick={() => save(key)}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${picked === key ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : 'border-line hover:border-muted'}`}>
              <span className="text-2xl" aria-hidden="true">{icon}</span>
              <span><span className="block font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => save('other')} className="text-sm font-semibold text-muted hover:text-ink">Skip for now</button>
          <span className="flex-1" />
          <Button variant="primary" disabled={!picked || busy} onClick={() => save(picked)}>{busy ? 'Setting up…' : 'Continue'}</Button>
        </div>
      </div>
    </div>
  );
}
