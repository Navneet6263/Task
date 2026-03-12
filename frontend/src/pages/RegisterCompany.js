import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './RegisterCompany.css';

const stepMeta = [
  {
    id: 1,
    title: 'Admin Profile',
    subtitle: 'Primary account owner details',
  },
  {
    id: 2,
    title: 'Company Profile',
    subtitle: 'Business and organization basics',
  },
  {
    id: 3,
    title: 'Scale Planning',
    subtitle: 'Expected team and workload size',
  },
  {
    id: 4,
    title: 'Operations',
    subtitle: 'Integrations, support, and notes',
  },
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

  const progress = useMemo(() => Math.round((step / stepMeta.length) * 100), [step]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep = (targetStep) => {
    if (targetStep === 1) {
      if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
        setError('Please fill name, email and password.');
        return false;
      }
    }

    if (targetStep === 2) {
      if (!form.company_name.trim() || !form.company_description.trim() || !form.industry.trim()) {
        setError('Please complete company name, description and industry.');
        return false;
      }
    }

    if (targetStep === 3) {
      if (!form.expected_companies || !form.expected_managers || !form.expected_staff) {
        setError('Please fill expected companies, managers and staff.');
        return false;
      }
    }

    if (targetStep === 4 && !form.agree_terms) {
      setError('Please accept terms to submit registration.');
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

  const handleFormSubmit = (event) => {
    if (step < stepMeta.length) {
      event.preventDefault();
      goNext();
      return;
    }
    handleSubmit(event);
  };

  if (success) {
    return (
      <div className="company-flow">
        <div className="company-flow__grid" />
        <div className="company-flow__card company-flow__card--success">
          <p className="company-flow__tag">REQUEST RECEIVED</p>
          <h1>Registration Submitted</h1>
          <p className="company-flow__success-copy">
            Your company profile has been sent for review. Super Admin will verify your request and share approval update.
          </p>
          <Link to="/login" className="company-flow__primary-btn company-flow__primary-btn--inline">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="company-flow">
      <div className="company-flow__grid" />
      <div className="company-flow__glow" />

      <div className="company-flow__card">
        <aside className="company-flow__sidebar">
          <p className="company-flow__tag">NAV TASK ONBOARDING</p>
          <h1>Company Registration</h1>
          <p>Multi-step onboarding with complete business profile for faster approval.</p>

          <div className="company-flow__progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>{progress}% complete</small>

          <ul className="company-flow__steps">
            {stepMeta.map((item) => (
              <li key={item.id} className={item.id === step ? 'is-active' : item.id < step ? 'is-done' : ''}>
                <span>{item.id}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.subtitle}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="company-flow__main">
          <header className="company-flow__main-head">
            <h2>{stepMeta[step - 1].title}</h2>
            <p>{stepMeta[step - 1].subtitle}</p>
          </header>

          {error && <div className="company-flow__error">{error}</div>}

          <form onSubmit={handleFormSubmit} className="company-flow__form">
            {step === 1 && (
              <div className="company-flow__field-grid">
                <Field
                  label="Full Name"
                  value={form.name}
                  onChange={(value) => updateField('name', value)}
                  placeholder="Admin full name"
                  required
                />
                <Field
                  label="Work Email"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateField('email', value)}
                  placeholder="admin@company.com"
                  required
                />
                <Field
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={(value) => updateField('password', value)}
                  placeholder="Create secure password"
                  required
                />
                <Field
                  label="Mobile Number"
                  value={form.mobile}
                  onChange={(value) => updateField('mobile', value)}
                  placeholder="Primary contact number"
                />
                <Field
                  label="Designation"
                  value={form.designation}
                  onChange={(value) => updateField('designation', value)}
                  placeholder="Example: Director, Ops Head"
                />
                <Field
                  label="Alternate Mobile"
                  value={form.alternate_mobile}
                  onChange={(value) => updateField('alternate_mobile', value)}
                  placeholder="Optional alternate number"
                />
              </div>
            )}

            {step === 2 && (
              <div className="company-flow__field-grid">
                <Field
                  label="Company Name"
                  value={form.company_name}
                  onChange={(value) => updateField('company_name', value)}
                  placeholder="Registered company name"
                  required
                />
                <Field
                  label="Industry"
                  value={form.industry}
                  onChange={(value) => updateField('industry', value)}
                  placeholder="IT Services, Manufacturing, Healthcare"
                  required
                />
                <Field
                  label="Website"
                  value={form.website}
                  onChange={(value) => updateField('website', value)}
                  placeholder="https://example.com"
                />
                <div className="company-flow__field">
                  <label className="company-flow__label">Company Size</label>
                  <select
                    className="company-flow__input"
                    value={form.company_size}
                    onChange={(event) => updateField('company_size', event.target.value)}
                  >
                    <option value="1-10">1-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-1000">201-1000</option>
                    <option value="1000+">1000+</option>
                  </select>
                </div>
                <Field
                  label="Headquarters City"
                  value={form.headquarters_city}
                  onChange={(value) => updateField('headquarters_city', value)}
                  placeholder="City"
                />
                <Field
                  label="Headquarters Country"
                  value={form.headquarters_country}
                  onChange={(value) => updateField('headquarters_country', value)}
                  placeholder="Country"
                />
                <div className="company-flow__field company-flow__field--full">
                  <label className="company-flow__label">Company Description</label>
                  <textarea
                    className="company-flow__input company-flow__textarea"
                    value={form.company_description}
                    onChange={(event) => updateField('company_description', event.target.value)}
                    placeholder="What does your company do, and which teams will use this platform?"
                    required
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="company-flow__field-grid">
                <Field
                  label="Expected Companies or Clients"
                  type="number"
                  value={form.expected_companies}
                  onChange={(value) => updateField('expected_companies', value)}
                  placeholder="1"
                  required
                />
                <Field
                  label="Expected Managers per Company"
                  type="number"
                  value={form.expected_managers}
                  onChange={(value) => updateField('expected_managers', value)}
                  placeholder="5"
                  required
                />
                <Field
                  label="Expected Staff per Company"
                  type="number"
                  value={form.expected_staff}
                  onChange={(value) => updateField('expected_staff', value)}
                  placeholder="20"
                  required
                />
                <Field
                  label="Active Shifts"
                  type="number"
                  value={form.active_shifts}
                  onChange={(value) => updateField('active_shifts', value)}
                  placeholder="1"
                />
                <div className="company-flow__field">
                  <label className="company-flow__label">Timezone</label>
                  <select
                    className="company-flow__input"
                    value={form.timezone}
                    onChange={(event) => updateField('timezone', event.target.value)}
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                  </select>
                </div>
                <div className="company-flow__field">
                  <label className="company-flow__label">Work Mode</label>
                  <select
                    className="company-flow__input"
                    value={form.work_mode}
                    onChange={(event) => updateField('work_mode', event.target.value)}
                  >
                    <option value="Hybrid">Hybrid</option>
                    <option value="Onsite">Onsite</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="company-flow__field-grid">
                <Field
                  label="Billing Contact"
                  value={form.billing_contact}
                  onChange={(value) => updateField('billing_contact', value)}
                  placeholder="Billing SPOC name or team"
                />
                <Field
                  label="Support Email"
                  type="email"
                  value={form.support_email}
                  onChange={(value) => updateField('support_email', value)}
                  placeholder="support@company.com"
                />
                <Field
                  label="Primary Onboarding Goal"
                  value={form.onboarding_goal}
                  onChange={(value) => updateField('onboarding_goal', value)}
                  placeholder="What should be achieved in first 30 days?"
                />
                <div className="company-flow__field company-flow__field--full">
                  <label className="company-flow__label">Integration Needs</label>
                  <textarea
                    className="company-flow__input company-flow__textarea"
                    value={form.integration_needs}
                    onChange={(event) => updateField('integration_needs', event.target.value)}
                    placeholder="Example: Slack, Email alerts, HRMS import, SSO"
                  />
                </div>
                <div className="company-flow__field company-flow__field--full">
                  <label className="company-flow__label">Additional Notes</label>
                  <textarea
                    className="company-flow__input company-flow__textarea"
                    value={form.additional_notes}
                    onChange={(event) => updateField('additional_notes', event.target.value)}
                    placeholder="Any specific compliance, audit, or rollout notes"
                  />
                </div>
                <label className="company-flow__terms">
                  <input
                    type="checkbox"
                    checked={form.agree_terms}
                    onChange={(event) => updateField('agree_terms', event.target.checked)}
                  />
                  <span>I confirm this information is accurate for approval.</span>
                </label>
              </div>
            )}
          </form>

          <footer className="company-flow__actions">
            <button type="button" onClick={goBack} className="company-flow__secondary-btn" disabled={step === 1}>
              Back
            </button>

            {step < stepMeta.length ? (
              <button type="button" onClick={goNext} className="company-flow__primary-btn">
                Next Step
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="company-flow__primary-btn"
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit For Approval'}
              </button>
            )}
          </footer>

          <p className="company-flow__login-line">
            Already registered? <Link to="/login">Go to Login</Link>
          </p>
        </section>
      </div>
    </div>
  );
};

const Field = ({ label, type = 'text', value, onChange, placeholder, required = false }) => (
  <div className="company-flow__field">
    <label className="company-flow__label">{label}</label>
    <input
      className="company-flow__input"
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
