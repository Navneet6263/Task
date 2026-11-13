import React, { useState } from 'react';
import { LineIcon } from './icons';
import { taskExtras } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button } from '../../ui';
import useDialog from '../useDialog';
import { reloadTaskMeta } from '../taskExtras/taskExtrasStore';

// The kinds of work, as on Jira's first screen. Each one brings starter labels that fit it.
const KINDS = [
  ['accounting', 'Accounting', 'M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6 M9 16h3', 'VAT, payroll, bookkeeping'],
  ['software', 'Software development', 'M8 8l-4 4 4 4 M16 8l4 4-4 4 M14 5l-4 14', 'Frontend, backend, bugs'],
  ['product', 'Product management', 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5', 'Roadmap, research'],
  ['marketing', 'Marketing', 'M3 11v2l12 5V6L3 11z M15 9a3 3 0 0 1 0 6 M7 14.5V19h3', 'Campaigns, content'],
  ['design', 'Design', 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z M2 2l7.6 7.6 M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'UI, branding'],
  ['project', 'Project management', 'M9 3h6v4H9z M8 5H5v16h14V5h-3 M9 12h6 M9 16h4', 'Milestones, risks'],
  ['operations', 'Operations', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1 7 17 M17 7l2.1-2.1', 'Process, vendors'],
  ['it_support', 'IT support', 'M3 4h18v12H3z M8 21h8 M12 16v5', 'Access, incidents'],
  ['hr', 'Human resources', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', 'Hiring, onboarding'],
  ['customer_service', 'Customer service', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'Queries, complaints'],
  ['legal', 'Legal', 'M12 3v18 M6 21h12 M5 7h14 M5 7l-3 6a3 3 0 0 0 6 0L5 7 M19 7l-3 6a3 3 0 0 0 6 0l-3-6', 'Contracts, filings'],
  ['finance', 'Finance', 'M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', 'Invoices, payments'],
  ['sales', 'Sales', 'M3 17l6-6 4 4 8-8 M15 7h6v6', 'Leads, proposals'],
  ['data', 'Data science', 'M4 20V10 M10 20V4 M16 20v-7 M2 20h20', 'Analysis, reports'],
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
              className={`flex items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition ${picked === key ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50 hover:bg-subtle'}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><LineIcon d={icon} size={20} /></span>
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
