import React from 'react';
import useDialog from '../../components/useDialog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Same dd-MMM-yyyy format the client uses on paper timesheets.
export const fmtDate = (value) => {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
};
export const fmtHours = (value) => String(Number(Number(value || 0).toFixed(2)));
export const errorOf = (error, fallback) => error?.response?.data?.error || fallback;
export const fieldsOf = (error) => error?.response?.data?.fields || {};

export const GROUP_LABELS = {
  job_type: 'Job Type', work_type: 'Work Type', period_type: 'Period Type',
  registration_status: 'Registration Status', count_type: 'Count Type',
};

export const cls = {
  primary: 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50',
  button: 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  small: 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  danger: 'rounded-md px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50',
  input: 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500',
  label: 'text-xs font-medium text-slate-600',
  card: 'rounded-xl border border-slate-200 bg-white',
  th: 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
  td: 'px-3 py-2.5 align-top',
};

export function Modal({ title, onClose, children, footer, wide = false }) {
  const ref = useDialog(true, onClose);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`my-6 flex w-full flex-col rounded-xl bg-white shadow-xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" className="rounded-md px-2 text-xl leading-none text-slate-500 hover:bg-slate-100" onClick={onClose}>×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const chip = (text, tone) => {
  const tones = { ok: 'bg-emerald-50 text-emerald-700', warn: 'bg-amber-50 text-amber-800', info: 'bg-blue-50 text-blue-700', muted: 'bg-slate-100 text-slate-600' };
  return <span key={text} className={`mr-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{text}</span>;
};

export function StatusChip({ entry }) {
  if (entry.status === 'DRAFT') return chip('Draft', 'muted');
  if (entry.lock?.unlocked_until) return chip(`Unlocked till ${fmtDate(entry.lock.unlocked_until)}`, 'info');
  if (entry.lock?.locked) return <>{chip('Locked', 'warn')}{entry.has_pending_unlock && chip('Unlock requested', 'info')}</>;
  return chip(`Editable till ${fmtDate(entry.lock?.editable_until)}`, 'ok');
}

export function FieldError({ text }) {
  return text ? <p className="mt-1 text-xs text-red-600">{text}</p> : null;
}
