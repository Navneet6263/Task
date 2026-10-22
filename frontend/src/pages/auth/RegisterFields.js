import React from 'react';
import { AuthInput } from '../../components/auth/AuthFields';

const ROLES = [
  ['person', 'Employee', 'Join your team with the code from your manager'],
  ['manager', 'Manager', 'Lead a team, or start a new organization'],
];

// Extra fields shown when someone creates a workspace account from the sign-in page.
export default function RegisterFields({ form, update }) {
  return (
    <>
      <div role="radiogroup" aria-label="Register as" className="grid grid-cols-2 gap-2">
        {ROLES.map(([value, title, help]) => {
          const active = form.role === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={active} onClick={() => update('role', value)}
              className={`rounded-lg border p-3 text-left transition ${active ? 'border-accent bg-accent-soft ring-2 ring-accent/15' : 'border-line hover:border-muted'}`}>
              <span className="flex items-center justify-between text-sm font-semibold">{title}
                <span className={`h-4 w-4 rounded-full border-2 ${active ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_rgb(var(--c-surface))]' : 'border-line'}`} />
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted">{help}</span>
            </button>
          );
        })}
      </div>
      <AuthInput label="Full name" icon="user" autoComplete="name" placeholder="Your full name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AuthInput label="Mobile number" icon="phone" autoComplete="tel" placeholder="Optional" value={form.mobile} onChange={(e) => update('mobile', e.target.value)} />
        <AuthInput label="Employee ID" icon="badge" placeholder="e.g. EMP001" value={form.employee_id} onChange={(e) => update('employee_id', e.target.value)} />
      </div>
      {form.role === 'person' && (
        <AuthInput label="Team code" icon="hash" placeholder="Ask your manager for it" required hint="Your manager finds it in Settings → Teams & join codes."
          className="[&_input]:font-mono [&_input]:uppercase" value={form.team_code} onChange={(e) => update('team_code', e.target.value.toUpperCase())} />
      )}
      {form.role === 'manager' && (
        <>
          <AuthInput label="Company code" icon="hash" placeholder="To join an existing company" className="[&_input]:font-mono [&_input]:uppercase"
            value={form.company_code} onChange={(e) => update('company_code', e.target.value.toUpperCase())} />
          {!form.company_code && (
            <AuthInput label="Company name" icon="building" placeholder="To start a new organization" value={form.company_name} onChange={(e) => update('company_name', e.target.value)} />
          )}
          <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
            {form.company_code ? 'You will join this organization after verification.' : 'A new organization and a default team will be created for you.'}
          </p>
        </>
      )}
    </>
  );
}
