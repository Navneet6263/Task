import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthShowcase from '../components/AuthShowcase';
import './RegisterCompany.css';

const stepMeta = [
  { id: 1, title: 'Admin', subtitle: 'Owner and contact details' },
  { id: 2, title: 'Company', subtitle: 'Business profile and context' },
  { id: 3, title: 'Scale', subtitle: 'Expected managers and staff' },
  { id: 4, title: 'Ops', subtitle: 'Support, integrations, rollout' },
];

const initialForm = {
  name: '',
  email: '',
  password: '',
  mobile: '',
  designation: '',
  alternate_mobile: '',
  company_name: '',
  company_description: '',
  industry: '',
  website: '',
  company_size: '11-50',
  headquarters_city: '',
  headquarters_country: '',
  expected_companies: '1',
  expected_managers: '5',
  expected_staff: '20',
  active_shifts: '1',
  timezone: 'Asia/Kolkata',
  work_mode: 'Hybrid',
  billing_contact: '',
  support_email: '',
  integration_needs: '',
  onboarding_goal: '',
  additional_notes: '',
  agree_terms: false,
};

const RegisterCompany = () => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const progress = useMemo(() => Math.round((step / stepMeta.length) * 100), [step]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep = (targetStep) => {
    if (targetStep === 1 && (!form.name.trim() || !form.email.trim() || !form.password.trim())) {
      setError('Please fill name, email, and password.');
      return false;
    }

    if (targetStep === 2 && (!form.company_name.trim() || !form.company_description.trim() || !form.industry.trim())) {
      setError('Please complete company name, description, and industry.');
      return false;
    }

    if (targetStep === 3 && (!form.expected_companies || !form.expected_managers || !form.expected_staff)) {
      setError('Please fill expected companies, managers, and staff.');
      return false;
    }

    if (targetStep === 4 && !form.agree_terms) {
      setError('Please confirm the information before submitting.');
      return false;
    }

    return true;
  };

  const goNext = () => {
    setError('');
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(prev + 1, stepMeta.length));
  };

  const goBack = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const buildDescription = () => {
    const lines = [
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
    ];

    return [`Primary Description: ${form.company_description.trim()}`, ...lines].join('\n');
  };

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    setError('');
    if (!validateStep(4)) return;

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      mobile: form.mobile.trim(),
      company_description: buildDescription(),
      expected_companies: toNumber(form.expected_companies, 1),
      expected_managers: toNumber(form.expected_managers, 5),
      expected_staff: toNumber(form.expected_staff, 20),
    };

    try {
      setSubmitting(true);
      await axios.post('http://localhost:5000/api/company-auth/register', payload);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to submit registration right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentStep = stepMeta[step - 1];

  if (success) {
    return (
      <div className="company-auth">
        <div className="company-auth__noise" />
        <div className="company-auth__frame">
          <section className="company-auth__panel company-auth__panel--success">
            <p className="company-auth__eyebrow">Request received</p>
            <h1>Company registration submitted.</h1>
            <p className="company-auth__lead">
              The request has been sent for review. A super admin can now verify the company and approve workspace access.
            </p>
            <div className="company-auth__success-actions">
              <Link to="/login" className="company-auth__primary">
                Back to login
              </Link>
              <button type="button" className="company-auth__secondary" onClick={() => navigate('/login?mode=system-admin')}>
                Open admin access
              </button>
            </div>
          </section>

          <AuthShowcase variant="onboarding" />
        </div>
      </div>
    );
  }

  return (
    <div className="company-auth">
      <div className="company-auth__noise" />
      <div className="company-auth__frame">
        <section className="company-auth__panel">
          <div className="company-auth__topbar">
            <button type="button" className="company-auth__brand" onClick={() => navigate('/login')}>
              <span>NT</span>
              <div>
                <strong>Nav Task</strong>
                <small>Company onboarding</small>
              </div>
            </button>

            <Link to="/login" className="company-auth__ghost-link">
              Back to login
            </Link>
          </div>

          <div className="company-auth__heading">
            <p className="company-auth__eyebrow">Company registration</p>
            <h1>Build your workspace launch plan.</h1>
            <p className="company-auth__lead">
              Capture admin details, company profile, expected scale, and rollout notes for approval.
            </p>
          </div>

          <div className="company-auth__progress">
            <div className="company-auth__progress-head">
              <strong>{currentStep.title}</strong>
              <span>{progress}% complete</span>
            </div>
            <div className="company-auth__bar">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="company-auth__steps">
              {stepMeta.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === step ? 'is-active' : item.id < step ? 'is-done' : ''}
                  onClick={() => {
                    if (item.id <= step) {
                      setError('');
                      setStep(item.id);
                    }
                  }}
                >
                  <span>{item.id}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="company-auth__error">{error}</div>}

          <form onSubmit={handleSubmit} className="company-auth__form">
            {step === 1 && (
              <div className="company-auth__grid">
                <Field label="Full name" value={form.name} onChange={(value) => updateField('name', value)} placeholder="Admin full name" required />
                <Field label="Work email" type="email" value={form.email} onChange={(value) => updateField('email', value)} placeholder="admin@company.com" required />
                <Field label="Password" type="password" value={form.password} onChange={(value) => updateField('password', value)} placeholder="Create secure password" required />
                <Field label="Mobile number" value={form.mobile} onChange={(value) => updateField('mobile', value)} placeholder="Primary contact number" />
                <Field label="Designation" value={form.designation} onChange={(value) => updateField('designation', value)} placeholder="Director, Ops Head" />
                <Field label="Alternate mobile" value={form.alternate_mobile} onChange={(value) => updateField('alternate_mobile', value)} placeholder="Optional alternate number" />
              </div>
            )}

            {step === 2 && (
              <div className="company-auth__grid">
                <Field label="Company name" value={form.company_name} onChange={(value) => updateField('company_name', value)} placeholder="Registered company name" required />
                <Field label="Industry" value={form.industry} onChange={(value) => updateField('industry', value)} placeholder="IT, Manufacturing, Healthcare" required />
                <Field label="Website" value={form.website} onChange={(value) => updateField('website', value)} placeholder="https://example.com" />
                <div className="company-auth__field">
                  <label className="company-auth__label">Company size</label>
                  <select className="company-auth__input" value={form.company_size} onChange={(event) => updateField('company_size', event.target.value)}>
                    <option value="1-10">1-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-1000">201-1000</option>
                    <option value="1000+">1000+</option>
                  </select>
                </div>
                <Field label="Headquarters city" value={form.headquarters_city} onChange={(value) => updateField('headquarters_city', value)} placeholder="City" />
                <Field label="Headquarters country" value={form.headquarters_country} onChange={(value) => updateField('headquarters_country', value)} placeholder="Country" />
                <div className="company-auth__field company-auth__field--full">
                  <label className="company-auth__label">Company description</label>
                  <textarea
                    className="company-auth__input company-auth__textarea"
                    value={form.company_description}
                    onChange={(event) => updateField('company_description', event.target.value)}
                    placeholder="What does your company do and how will teams use Nav Task?"
                    required
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="company-auth__grid">
                <Field label="Expected companies or clients" type="number" value={form.expected_companies} onChange={(value) => updateField('expected_companies', value)} placeholder="1" required />
                <Field label="Expected managers per company" type="number" value={form.expected_managers} onChange={(value) => updateField('expected_managers', value)} placeholder="5" required />
                <Field label="Expected staff per company" type="number" value={form.expected_staff} onChange={(value) => updateField('expected_staff', value)} placeholder="20" required />
                <Field label="Active shifts" type="number" value={form.active_shifts} onChange={(value) => updateField('active_shifts', value)} placeholder="1" />
                <div className="company-auth__field">
                  <label className="company-auth__label">Timezone</label>
                  <select className="company-auth__input" value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)}>
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                  </select>
                </div>
                <div className="company-auth__field">
                  <label className="company-auth__label">Work mode</label>
                  <select className="company-auth__input" value={form.work_mode} onChange={(event) => updateField('work_mode', event.target.value)}>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Onsite">Onsite</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="company-auth__grid">
                <Field label="Billing contact" value={form.billing_contact} onChange={(value) => updateField('billing_contact', value)} placeholder="Billing SPOC or team" />
                <Field label="Support email" type="email" value={form.support_email} onChange={(value) => updateField('support_email', value)} placeholder="support@company.com" />
                <Field label="Primary onboarding goal" value={form.onboarding_goal} onChange={(value) => updateField('onboarding_goal', value)} placeholder="What should the first 30 days achieve?" />
                <div className="company-auth__field company-auth__field--full">
                  <label className="company-auth__label">Integration needs</label>
                  <textarea
                    className="company-auth__input company-auth__textarea"
                    value={form.integration_needs}
                    onChange={(event) => updateField('integration_needs', event.target.value)}
                    placeholder="Slack, HRMS import, SSO, email alerts"
                  />
                </div>
                <div className="company-auth__field company-auth__field--full">
                  <label className="company-auth__label">Additional notes</label>
                  <textarea
                    className="company-auth__input company-auth__textarea"
                    value={form.additional_notes}
                    onChange={(event) => updateField('additional_notes', event.target.value)}
                    placeholder="Anything the review team should know before approval"
                  />
                </div>
                <label className="company-auth__terms">
                  <input
                    type="checkbox"
                    checked={form.agree_terms}
                    onChange={(event) => updateField('agree_terms', event.target.checked)}
                  />
                  <span>I confirm the information above is accurate for review and approval.</span>
                </label>
              </div>
            )}
          </form>

          <div className="company-auth__actions">
            <button type="button" className="company-auth__secondary" onClick={goBack} disabled={step === 1}>
              Back
            </button>

            {step < stepMeta.length ? (
              <button type="button" className="company-auth__primary" onClick={goNext}>
                Next Step
              </button>
            ) : (
              <button type="button" className="company-auth__primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
            )}
          </div>
        </section>

        <AuthShowcase variant="onboarding" />
      </div>
    </div>
  );
};

const Field = ({ label, type = 'text', value, onChange, placeholder, required = false }) => (
  <div className="company-auth__field">
    <label className="company-auth__label">{label}</label>
    <input
      className="company-auth__input"
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </div>
);

const toNumber = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
};

export default RegisterCompany;
