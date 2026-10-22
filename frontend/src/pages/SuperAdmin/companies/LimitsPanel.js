import React, { useState } from 'react';
import { Button, Modal, Textarea } from '../../../ui';

const FIELDS = [
  ['max_companies', 'Organizations', 'How many workspaces this company can create'],
  ['max_managers_per_company', 'Managers per organization', 'Team leads who can create teams and assign work'],
  ['max_staff_per_company', 'Staff per organization', 'Employees who receive and complete tasks'],
];
const PRESETS = [['Starter', 1, 5, 20], ['Growth', 3, 10, 50], ['Scale', 10, 50, 500]];
const valid = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100000;

function Stepper({ id, value, onChange }) {
  const set = (next) => onChange(String(Math.max(1, Math.min(100000, next))));
  return (
    <div className={`flex h-10 items-stretch overflow-hidden rounded-lg border bg-surface ${valid(value) ? 'border-line' : 'border-danger'}`}>
      <button type="button" aria-label="Decrease" onClick={() => set(Number(value || 1) - 1)} className="w-10 text-lg text-muted hover:bg-subtle hover:text-ink">−</button>
      <input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="w-full min-w-0 border-x border-line bg-transparent text-center font-mono text-sm font-semibold focus:outline-none" />
      <button type="button" aria-label="Increase" onClick={() => set(Number(value || 0) + 1)} className="w-10 text-lg text-muted hover:bg-subtle hover:text-ink">+</button>
    </div>
  );
}

// Account limits plus the approve / reject decision for pending companies.
export default function LimitsPanel({ detail, onApprove, onReject, onSave }) {
  const initial = {
    max_companies: String(detail.max_companies || 3),
    max_managers_per_company: String(detail.max_managers_per_company || 10),
    max_staff_per_company: String(detail.max_staff_per_company || 50),
  };
  const [limits, setLimits] = useState(initial);
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const allValid = Object.values(limits).every(valid);
  const changed = Object.keys(limits).some((key) => limits[key] !== initial[key]);
  const payload = Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, Number(value)]));
  const requested = [Number(detail.expected_companies) || 1, Number(detail.expected_managers) || 5, Number(detail.expected_staff) || 20];
  const presets = [['As requested', ...requested], ...PRESETS];
  const act = async (name, fn) => { setBusy(name); try { return await fn(); } finally { setBusy(''); } };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Quick fill:</span>
        {presets.map(([label, c, m, s]) => {
          const active = Number(limits.max_companies) === c && Number(limits.max_managers_per_company) === m && Number(limits.max_staff_per_company) === s;
          return (
            <button key={label} type="button" onClick={() => setLimits({ max_companies: String(c), max_managers_per_company: String(m), max_staff_per_company: String(s) })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:border-accent hover:text-accent'}`}>
              {label} <span className="font-normal opacity-75">{c}/{m}/{s}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {FIELDS.map(([key, label, help]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={`limit-${key}`} className="text-sm font-medium">{label}</label>
            <Stepper id={`limit-${key}`} value={limits[key]} onChange={(value) => setLimits({ ...limits, [key]: value })} />
            <p className={`text-xs ${valid(limits[key]) ? 'text-muted' : 'text-danger'}`}>{valid(limits[key]) ? help : 'Use a whole number from 1 to 100000.'}</p>
          </div>
        ))}
      </div>

      {detail.status === 'approved' ? (
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button variant="primary" disabled={!changed || !allValid || Boolean(busy)} onClick={() => act('save', () => onSave(payload))}>{busy === 'save' ? 'Saving…' : 'Save limits'}</Button>
          {changed && <Button variant="ghost" onClick={() => setLimits(initial)}>Undo changes</Button>}
          <span className="text-xs text-muted">New limits apply right away. Existing people are never removed.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-semibold">{detail.status === 'pending' ? 'Ready to decide?' : 'Rejected earlier'}</p>
            <p className="text-xs text-muted">Approving creates their workspace with these limits and lets the admin sign in.</p>
          </div>
          {detail.status === 'pending' && <Button variant="danger" className="!border-danger/40" disabled={Boolean(busy)} onClick={() => setRejecting(true)}>Reject</Button>}
          <Button variant="primary" disabled={!allValid || Boolean(busy)} onClick={() => act('approve', () => onApprove(payload))}>
            {busy === 'approve' ? 'Approving…' : detail.status === 'pending' ? 'Approve company' : 'Approve now'}
          </Button>
        </div>
      )}

      {rejecting && (
        <Modal title={`Reject ${detail.name}?`} subtitle="They will not be able to sign in. The reason is saved with the account." onClose={() => setRejecting(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button><span className="flex-1" />
            <Button variant="primary" className="!border-danger !bg-danger" disabled={!reason.trim() || Boolean(busy)}
              onClick={async () => { if (await act('reject', () => onReject(reason.trim()))) setRejecting(false); }}>{busy === 'reject' ? 'Rejecting…' : 'Reject company'}</Button>
          </>}>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Reason</span>
            <Textarea autoFocus maxLength={1000} rows={4} placeholder="e.g. We could not verify the company details." value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}
