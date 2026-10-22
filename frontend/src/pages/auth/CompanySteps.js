import React from 'react';
import { AuthInput, AuthSelect, AuthTextarea, PasswordInput } from '../../components/auth/AuthFields';

export const STEPS = [
  { id: 1, title: 'Your details', subtitle: 'Who owns the account' },
  { id: 2, title: 'Company', subtitle: 'What your business does' },
  { id: 3, title: 'Team size', subtitle: 'How many people will use it' },
  { id: 4, title: 'Review', subtitle: 'Support details and submit' },
];

const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2';
const full = 'sm:col-span-2';

// The fields for each registration step. `bind(key)` returns value/onChange props for a form field.
export function CompanyStep({ step, form, bind, update }) {
  if (step === 1) return (
    <div className={grid}>
      <AuthInput label="Full name" icon="user" autoComplete="name" placeholder="Admin full name" required {...bind('name')} />
      <AuthInput label="Work email" type="email" icon="mail" autoComplete="email" placeholder="admin@company.com" required {...bind('email')} />
      <PasswordInput className={full} autoComplete="new-password" placeholder="Create a secure password" required strength {...bind('password')} />
      <AuthInput label="Mobile number" icon="phone" autoComplete="tel" placeholder="Primary contact number" {...bind('mobile')} />
      <AuthInput label="Designation" icon="badge" placeholder="e.g. Director, Ops Head" {...bind('designation')} />
      <AuthInput label="Alternate mobile" icon="phone" placeholder="Optional" className={full} {...bind('alternate_mobile')} />
    </div>
  );
  if (step === 2) return (
    <div className={grid}>
      <AuthInput label="Company name" icon="building" placeholder="Registered company name" required {...bind('company_name')} />
      <AuthInput label="Industry" placeholder="IT, Manufacturing, Healthcare…" required {...bind('industry')} />
      <AuthInput label="Website" icon="globe" placeholder="https://example.com" {...bind('website')} />
      <AuthSelect label="Company size" {...bind('company_size')}>
        {['1-10', '11-50', '51-200', '201-1000', '1000+'].map((size) => <option key={size} value={size}>{size} people</option>)}
      </AuthSelect>
      <AuthInput label="Headquarters city" icon="pin" placeholder="City" {...bind('headquarters_city')} />
      <AuthInput label="Headquarters country" placeholder="Country" {...bind('headquarters_country')} />
      <AuthTextarea label="What does your company do?" className={full} required placeholder="Tell us what you do and how your teams will use GreenTask." {...bind('company_description')} />
    </div>
  );
  if (step === 3) return (
    <div className={grid}>
      <AuthInput label="Companies or clients you manage" type="number" min="1" required {...bind('expected_companies')} />
      <AuthInput label="Managers per company" type="number" min="1" required {...bind('expected_managers')} />
      <AuthInput label="Staff per company" type="number" min="1" required {...bind('expected_staff')} />
      <AuthInput label="Active shifts" type="number" min="1" {...bind('active_shifts')} />
      <AuthSelect label="Timezone" {...bind('timezone')}>
        {['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles'].map((zone) => <option key={zone}>{zone}</option>)}
      </AuthSelect>
      <AuthSelect label="Work mode" {...bind('work_mode')}>
        {['Hybrid', 'Onsite', 'Remote'].map((mode) => <option key={mode}>{mode}</option>)}
      </AuthSelect>
      <p className={`${full} rounded-lg bg-subtle px-3 py-2 text-xs text-muted`}>
        Estimated seats: <strong className="text-ink">{Number(form.expected_companies || 0) * (Number(form.expected_managers || 0) + Number(form.expected_staff || 0))}</strong> people. You can change this later.
      </p>
    </div>
  );
  const summary = [
    ['Admin', `${form.name || '—'} · ${form.email || '—'}`],
    ['Company', `${form.company_name || '—'} · ${form.industry || '—'}`],
    ['Size', `${form.company_size} people · ${form.work_mode} · ${form.timezone}`],
  ];
  return (
    <div className={grid}>
      <AuthInput label="Billing contact" placeholder="Billing person or team" {...bind('billing_contact')} />
      <AuthInput label="Support email" type="email" icon="mail" placeholder="support@company.com" {...bind('support_email')} />
      <AuthInput label="Main goal for the first 30 days" className={full} placeholder="e.g. Move all client work and hours onto one tool" {...bind('onboarding_goal')} />
      <AuthTextarea label="Integrations you need" placeholder="Slack, HRMS import, SSO, email alerts" {...bind('integration_needs')} />
      <AuthTextarea label="Anything else?" placeholder="Notes for the review team" {...bind('additional_notes')} />
      <dl className={`${full} divide-y divide-line rounded-lg border border-line`}>
        {summary.map(([label, value]) => (
          <div key={label} className="flex gap-3 px-3.5 py-2.5 text-sm"><dt className="w-20 shrink-0 text-muted">{label}</dt><dd className="min-w-0 truncate font-medium">{value}</dd></div>
        ))}
      </dl>
      <label className={`${full} flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 text-sm`}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={form.agree_terms} onChange={(e) => update('agree_terms', e.target.checked)} />
        <span>I confirm these details are correct and can be used to review and approve this company.</span>
      </label>
    </div>
  );
}

export function Stepper({ step, onPick }) {
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2">
      {STEPS.map((item) => {
        const done = item.id < step, active = item.id === step;
        return (
          <li key={item.id}>
            <button type="button" disabled={item.id > step} onClick={() => onPick(item.id)} aria-current={active ? 'step' : undefined} className="w-full text-left disabled:cursor-default">
              <span className={`block h-1 rounded-full ${done || active ? 'bg-accent' : 'bg-line'}`} />
              <span className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-ink' : done ? 'text-accent' : 'text-muted'}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${done ? 'bg-accent text-accent-fg' : active ? 'border-2 border-accent text-accent' : 'border border-line'}`}>{done ? '✓' : item.id}</span>
                <span className="truncate">{item.title}</span>
              </span>
              <span className="mt-0.5 hidden truncate text-[11px] text-muted sm:block">{item.subtitle}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
