import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthLayout, { TopLink } from '../components/auth/AuthLayout';
import { AuthAlert, AuthHeading, AuthIcon, SubmitButton } from '../components/auth/AuthFields';
import { API_BASE_URL } from '../services/runtimeConfig';
import { CompanyStep, STEPS, Stepper } from './auth/CompanySteps';

const initialForm = {
  name: '', email: '', password: '', mobile: '', designation: '', alternate_mobile: '',
  company_name: '', company_description: '', industry: '', website: '', company_size: '11-50', headquarters_city: '', headquarters_country: '',
  expected_companies: '1', expected_managers: '5', expected_staff: '20', active_shifts: '1', timezone: 'Asia/Kolkata', work_mode: 'Hybrid',
  billing_contact: '', support_email: '', integration_needs: '', onboarding_goal: '', additional_notes: '', agree_terms: false,
};

const toNumber = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
};

const NEXT_STEPS = [
  ['Review', 'Our team checks your company details.'],
  ['Approval', 'You can sign in as soon as the company is approved.'],
  ['Invite your team', 'Add managers, then they create teams and invite staff.'],
];

const RegisterCompany = () => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const bind = (key) => ({ value: form[key], onChange: (event) => updateField(key, event.target.value) });

  const validateStep = (targetStep) => {
    const missing = {
      1: (!form.name.trim() || !form.email.trim() || !form.password.trim()) && 'Please fill name, email, and password.',
      2: (!form.company_name.trim() || !form.company_description.trim() || !form.industry.trim()) && 'Please complete company name, description, and industry.',
      3: (!form.expected_companies || !form.expected_managers || !form.expected_staff) && 'Please fill expected companies, managers, and staff.',
      4: !form.agree_terms && 'Please confirm the information before submitting.',
    }[targetStep];
    if (missing) { setError(missing); return false; }
    return true;
  };

  const buildDescription = () => [
    `Primary Description: ${form.company_description.trim()}`,
    `Company Name: ${form.company_name.trim() || '-'}`,
    `Industry: ${form.industry.trim() || '-'}`,
    `Website: ${form.website.trim() || '-'}`,
    `Company Size: ${form.company_size || '-'}`,
    `Headquarters: ${form.headquarters_city.trim() || '-'}, ${form.headquarters_country.trim() || '-'}`,
    `Primary Contact: ${form.name.trim() || '-'} (${form.designation.trim() || 'Admin'})`,
    `Alternate Contact Number: ${form.alternate_mobile.trim() || '-'}`,
    `Active Shifts: ${form.active_shifts || '-'}`,
    `Timezone: ${form.timezone || '-'}`,
    `Work Mode: ${form.work_mode || '-'}`,
    `Billing Contact: ${form.billing_contact.trim() || '-'}`,
    `Support Email: ${form.support_email.trim() || '-'}`,
    `Onboarding Goal: ${form.onboarding_goal.trim() || '-'}`,
    `Integration Needs: ${form.integration_needs.trim() || '-'}`,
    `Additional Notes: ${form.additional_notes.trim() || '-'}`,
  ].join('\n');

  // Enter on steps 1–3 moves forward; the last step submits.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!validateStep(step)) return;
    if (step < STEPS.length) { setStep(step + 1); return; }
    const payload = {
      name: form.name.trim(), email: form.email.trim(), password: form.password, mobile: form.mobile.trim(),
      company_description: buildDescription(),
      expected_companies: toNumber(form.expected_companies, 1),
      expected_managers: toNumber(form.expected_managers, 5),
      expected_staff: toNumber(form.expected_staff, 20),
    };
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE_URL}/company-auth/register`, payload);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to submit registration right now.');
    } finally { setSubmitting(false); }
  };

  if (success) {
    return (
      <AuthLayout variant="onboarding">
        <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><AuthIcon name="check" size={26} /></span>
        <AuthHeading eyebrow="Request received" title="Registration submitted">
          Thanks, {form.name.split(' ')[0] || 'there'}. We've received the details for <strong className="text-ink">{form.company_name}</strong>.
        </AuthHeading>
        <ol className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          {NEXT_STEPS.map(([title, text], index) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{index + 1}</span>
              <span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{text}</span></span>
            </li>
          ))}
        </ol>
        <SubmitButton type="button" onClick={() => navigate('/login')}>Back to sign in</SubmitButton>
      </AuthLayout>
    );
  }

  const current = STEPS[step - 1];
  return (
    <AuthLayout variant="onboarding" wide topAction={<TopLink to="/login">Already registered? Sign in</TopLink>}>
      <AuthHeading eyebrow={`Step ${step} of ${STEPS.length}`} title={step === 1 ? 'Register your company' : current.title}>
        {step === 1 ? 'Tell us about you and your company. Our team reviews every request before the workspace goes live.' : current.subtitle}
      </AuthHeading>
      <Stepper step={step} onPick={(id) => { setError(''); setStep(id); }} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <AuthAlert>{error}</AuthAlert>
        <CompanyStep step={step} form={form} bind={bind} update={updateField} />
        <div className="flex items-center gap-3 border-t border-line pt-5">
          <button type="button" onClick={() => { setError(''); setStep(Math.max(1, step - 1)); }} disabled={step === 1}
            className="h-11 rounded-lg border border-line px-5 text-sm font-semibold text-ink hover:bg-subtle disabled:invisible">Back</button>
          <span className="flex-1" />
          <SubmitButton className="!w-auto px-6" busy={submitting} busyText="Submitting…">{step < STEPS.length ? 'Continue' : 'Submit for approval'}</SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
};

export default RegisterCompany;
