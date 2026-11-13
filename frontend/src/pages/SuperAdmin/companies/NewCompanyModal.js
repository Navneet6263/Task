import React, { useState } from 'react';
import { Button, FieldError, Input, Modal } from '../../../ui';
import PasswordReveal from './PasswordReveal';

const PLANS = [['Starter', 1, 5, 20], ['Growth', 3, 10, 50], ['Scale', 10, 50, 500]];

function Row({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

// Add a company straight from the console: approved at once, with its first organization and admin.
export default function NewCompanyModal({ onCreate, onClose, onDone }) {
  const [form, setForm] = useState({ company_name: '', name: '', email: '', mobile: '' });
  const [plan, setPlan] = useState('Growth');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event) => {
    event?.preventDefault();
    if (!form.company_name.trim() || !form.name.trim() || !form.email.trim()) { setError('Fill in the company, the admin\'s name and email.'); return; }
    const [, c, m, s] = PLANS.find(([label]) => label === plan);
    setBusy(true); setError('');
    const result = await onCreate({ ...form, max_companies: c, max_managers_per_company: m, max_staff_per_company: s });
    setBusy(false);
    if (result?.password) setCreated(result);
    else if (result && result.error) setError(result.error);
  };

  if (created) {
    return (
      <Modal title={`${form.company_name.trim()} is ready`} subtitle="The company is approved and its admin can sign in now." onClose={() => onDone(created.id)}
        footer={<><span className="flex-1" /><Button variant="primary" onClick={() => onDone(created.id)}>Done</Button></>}>
        <PasswordReveal email={created.email} password={created.password} />
      </Modal>
    );
  }

  return (
    <Modal title="Add a company" subtitle="Creates the company, its first workspace and its company admin, approved straight away." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><span className="flex-1" /><Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create company'}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Row label="Company name" hint="Also the name of its first workspace. They can add more later."><Input autoFocus maxLength={200} placeholder="e.g. Accountrust" value={form.company_name} onChange={set('company_name')} /></Row>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row label="Company admin's name"><Input maxLength={255} value={form.name} onChange={set('name')} /></Row>
          <Row label="Mobile" hint="Optional"><Input maxLength={20} value={form.mobile} onChange={set('mobile')} /></Row>
        </div>
        <Row label="Company admin's email" hint="They sign in with this. It must not already have a GreenTask account."><Input type="email" maxLength={255} value={form.email} onChange={set('email')} /></Row>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Plan</span>
          <div className="grid grid-cols-3 gap-2">
            {PLANS.map(([label, c, m, s]) => (
              <button key={label} type="button" aria-pressed={plan === label} onClick={() => setPlan(label)}
                className={`rounded-lg border p-2.5 text-left transition ${plan === label ? 'border-accent bg-accent-soft ring-2 ring-accent/15' : 'border-line hover:border-muted'}`}>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[11px] text-muted">{c} orgs · {m} managers · {s} staff</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">Limits can be changed any time in the Limits tab.</span>
        </div>
        <FieldError text={error} />
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}
