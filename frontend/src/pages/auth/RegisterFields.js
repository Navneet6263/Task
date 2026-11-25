import React from 'react';
import { AuthInput } from '../../components/auth/AuthFields';

// Extra fields shown when someone creates an account from the sign-in page. Sign-up only joins an existing
// team as an employee; a new company goes through "Register your company", which a platform admin approves.
export default function RegisterFields({ form, update }) {
  return (
    <>
      <AuthInput label="Full name" icon="user" autoComplete="name" placeholder="Your full name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AuthInput label="Mobile number" icon="phone" autoComplete="tel" placeholder="Optional" value={form.mobile} onChange={(e) => update('mobile', e.target.value)} />
        <AuthInput label="Employee ID" icon="badge" placeholder="e.g. EMP001" value={form.employee_id} onChange={(e) => update('employee_id', e.target.value)} />
      </div>
      <AuthInput label="Team code" icon="hash" placeholder="Ask your manager for it" required hint="Your manager finds it in Settings → Teams & join codes."
        className="[&_input]:font-mono [&_input]:uppercase" value={form.team_code} onChange={(e) => update('team_code', e.target.value.toUpperCase())} />
    </>
  );
}
