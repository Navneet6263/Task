import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../services/api';
import { SA_BASE_URL } from '../services/runtimeConfig';
import AuthShowcase from '../components/AuthShowcase';
import './Login.css';

const sa = axios.create({ baseURL: SA_BASE_URL });

const initialForm = {
  name: '',
  email: '',
  password: '',
  mobile: '',
  employee_id: '',
  role: 'person',
  team_code: '',
  company_code: '',
  company_name: '',
};

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [accessMode, setAccessMode] = useState('workspace');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [saStep, setSaStep] = useState(1);
  const [saEmail, setSaEmail] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [saUserInfo, setSaUserInfo] = useState(null);
  const [saBusy, setSaBusy] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const mode = searchParams.get('mode') === 'system-admin' ? 'system-admin' : 'workspace';
    setAccessMode((prev) => (prev === mode ? prev : mode));
  }, [searchParams]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const switchAccessMode = (mode) => {
    setError('');
    const next = new URLSearchParams(searchParams);
    if (mode === 'system-admin') next.set('mode', 'system-admin');
    else next.delete('mode');
    setSearchParams(next, { replace: true });
    setAccessMode(mode);
  };

  const persistWorkspaceSession = (responseData) => {
    const isCompanyAdminResponse = responseData?.role === 'company_admin';
    const userPayload = {
      id: responseData.id,
      org_id: responseData.org_id,
      org_ids: responseData.org_ids || [],
      name: responseData.name,
      email: responseData.email,
      role: responseData.role,
      limits: responseData.limits,
    };

    if (isCompanyAdminResponse) {
      localStorage.removeItem('token');
      localStorage.setItem('company_token', responseData.token);
      localStorage.setItem('company_user', JSON.stringify(userPayload));
    } else {
      localStorage.removeItem('company_token');
      localStorage.removeItem('company_user');
      localStorage.setItem('token', responseData.token);
    }

    if (responseData.org_id) localStorage.setItem('active_org_id', String(responseData.org_id));
    else localStorage.removeItem('active_org_id');

    localStorage.setItem('user', JSON.stringify(userPayload));
  };

  const handleWorkspaceSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const payload = isLogin
        ? { email: form.email.trim(), password: form.password }
        : {
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            mobile: form.mobile.trim(),
            employee_id: form.employee_id.trim(),
            role: form.role,
            team_code: form.team_code.trim().toUpperCase(),
            company_code: form.company_code.trim().toUpperCase(),
            company_name: form.company_name.trim(),
          };

      const response = isLogin ? await auth.login(payload) : await auth.register(payload);
      persistWorkspaceSession(response.data);
      navigate('/dashboard');
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PENDING') {
        setError('This company account is still waiting for approval.');
      } else if (code === 'REJECTED') {
        setError(err.response?.data?.error || 'This account was rejected.');
      } else {
        setError(err.response?.data?.error || 'Unable to process the request right now.');
      }
    }
  };

  const handleSuperAdminEmailSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaBusy(true);

    try {
      const response = await sa.post('/verify-email', { email: saEmail.trim() });
      setSaUserInfo(response.data);
      if (response.data.is_master) {
        setSaStep(2);
      } else {
        const loginResponse = await sa.post('/login', { email: saEmail.trim() });
        localStorage.setItem('sa_token', loginResponse.data.token);
        localStorage.setItem('sa_user', JSON.stringify(loginResponse.data));
        navigate('/sa-dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Email is not authorized for admin access.');
    } finally {
      setSaBusy(false);
    }
  };

  const handleSuperAdminPasswordSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaBusy(true);

    try {
      const response = await sa.post('/login', { email: saEmail.trim(), password: saPassword });
      localStorage.setItem('sa_token', response.data.token);
      localStorage.setItem('sa_user', JSON.stringify(response.data));
      navigate('/sa-dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid password.');
    } finally {
      setSaBusy(false);
    }
  };

  const renderRegisterFields = () => (
    <>
      <Field
        label="Full name"
        value={form.name}
        onChange={(value) => updateField('name', value)}
        placeholder="Full name"
        required
      />
      <Field
        label="Mobile number"
        value={form.mobile}
        onChange={(value) => updateField('mobile', value)}
        placeholder="Mobile number"
      />
      <Field
        label="Employee ID"
        value={form.employee_id}
        onChange={(value) => updateField('employee_id', value)}
        placeholder="EMP001"
      />

      <div className="auth-page__field">
        <label className="auth-page__label">Register as</label>
        <select
          className="auth-page__input"
          value={form.role}
          onChange={(event) => updateField('role', event.target.value)}
        >
          <option value="person">Employee</option>
          <option value="manager">Manager</option>
        </select>
      </div>

      {form.role === 'person' && (
        <Field
          label="Team code"
          value={form.team_code}
          onChange={(value) => updateField('team_code', value.toUpperCase())}
          placeholder="Provided by your manager"
          required
        />
      )}

      {form.role === 'manager' && (
        <>
          <Field
            label="Company code"
            value={form.company_code}
            onChange={(value) => updateField('company_code', value.toUpperCase())}
            placeholder="Join an existing company"
          />
          {!form.company_code && (
            <Field
              label="Company name"
              value={form.company_name}
              onChange={(value) => updateField('company_name', value)}
              placeholder="Create a new organization"
            />
          )}
          <div className="auth-page__info">
            {form.company_code
              ? 'You will join the selected organization after verification.'
              : 'A new organization and a default team will be created for you.'}
          </div>
        </>
      )}
    </>
  );

  const isSystemAdmin = accessMode === 'system-admin';
  const showcaseVariant = isSystemAdmin ? 'security' : 'workspace';

  return (
    <div className="auth-page">
      <div className="auth-page__noise" />
      <div className="auth-page__frame">
        <section className="auth-page__panel">
          <div className="auth-page__topbar">
            <button type="button" className="auth-page__brand" onClick={() => navigate('/login')}>
              <span>NT</span>
              <div>
                <strong>Nav Task</strong>
                <small>Task operations platform</small>
              </div>
            </button>

            <button type="button" className="auth-page__ghost-link" onClick={() => navigate('/register-company')}>
              Company setup
            </button>
          </div>

          <div className="auth-page__mode-switch">
            <button
              type="button"
              className={!isSystemAdmin ? 'is-active' : ''}
              onClick={() => switchAccessMode('workspace')}
            >
              Workspace
            </button>
            <button
              type="button"
              className={isSystemAdmin ? 'is-active' : ''}
              onClick={() => switchAccessMode('system-admin')}
            >
              System Admin
            </button>
          </div>

          <div className="auth-page__heading">
            <p className="auth-page__eyebrow">
              {isSystemAdmin ? 'Protected access' : isLogin ? 'Welcome back' : 'Create account'}
            </p>
            <h1>
              {isSystemAdmin
                ? (saStep === 1 ? 'Administrative sign in' : 'Confirm your credentials')
                : (isLogin ? 'Sign in to continue work.' : 'Join the workspace.')}
            </h1>
            <p>
              {isSystemAdmin
                ? (saStep === 1
                    ? 'Use an approved email to access the control layer.'
                    : `Continue as ${saUserInfo?.name || 'administrator'}.`)
                : (isLogin
                    ? 'Employees, managers, and company admins all use the same login.'
                    : 'Set up a personal workspace account with the role that fits you.')}
            </p>
          </div>

          {error && <div className="auth-page__error">{error}</div>}

          {!isSystemAdmin ? (
            <>
              <form onSubmit={handleWorkspaceSubmit} className="auth-page__form">
                {!isLogin && renderRegisterFields()}

                <Field
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateField('email', value)}
                  placeholder="name@company.com"
                  required
                />

                <div className="auth-page__field">
                  <label className="auth-page__label">Password</label>
                  <div className="auth-page__password-wrap">
                    <input
                      className="auth-page__input"
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      placeholder="Enter password"
                      required
                    />
                    <button
                      type="button"
                      className="auth-page__inline-btn"
                      onClick={() => setShowPass((prev) => !prev)}
                    >
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="auth-page__row">
                    <label className="auth-page__remember">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      className="auth-page__text-link"
                      onClick={() => navigate('/forgot-password')}
                    >
                      Forgot password
                    </button>
                  </div>
                )}

                <button type="submit" className="auth-page__submit">
                  {isLogin ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              <div className="auth-page__footer">
                <div className="auth-page__footer-row">
                  <span className="auth-page__footer-text">
                    {isLogin ? "Don't have an account?" : 'Already have an account?'}
                  </span>
                  <button
                    type="button"
                    className="auth-page__text-link"
                    onClick={() => {
                      setIsLogin((prev) => !prev);
                      setError('');
                      setShowPass(false);
                    }}
                  >
                    {isLogin ? 'Register' : 'Sign in'}
                  </button>
                </div>
                <div className="auth-page__footer-row">
                  <span className="auth-page__footer-text">Need a company approval flow?</span>
                  <button
                    type="button"
                    className="auth-page__text-link"
                    onClick={() => navigate('/register-company')}
                  >
                    Open company registration
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {saStep === 1 ? (
                <form onSubmit={handleSuperAdminEmailSubmit} className="auth-page__form">
                  <Field
                    label="Approved email"
                    type="email"
                    value={saEmail}
                    onChange={setSaEmail}
                    placeholder="superadmin@navtask.com"
                    required
                  />
                  <button type="submit" className="auth-page__submit" disabled={saBusy}>
                    {saBusy ? 'Verifying...' : 'Verify Email'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSuperAdminPasswordSubmit} className="auth-page__form">
                  <div className="auth-page__verified-chip">{saEmail}</div>
                  <Field
                    label="Password"
                    type="password"
                    value={saPassword}
                    onChange={setSaPassword}
                    placeholder="Enter password"
                    required
                  />
                  <div className="auth-page__row auth-page__row--stack">
                    <button type="submit" className="auth-page__submit" disabled={saBusy}>
                      {saBusy ? 'Signing In...' : 'Enter Workspace'}
                    </button>
                    <button
                      type="button"
                      className="auth-page__secondary"
                      onClick={() => {
                        setSaStep(1);
                        setSaPassword('');
                        setSaUserInfo(null);
                        setError('');
                      }}
                    >
                      Change Email
                    </button>
                  </div>
                </form>
              )}

              <div className="auth-page__footer">
                <div className="auth-page__footer-row">
                  <span className="auth-page__footer-text">Need the standard workspace login?</span>
                  <button
                    type="button"
                    className="auth-page__text-link"
                    onClick={() => switchAccessMode('workspace')}
                  >
                    Back to workspace access
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <AuthShowcase key={`${showcaseVariant}-${isLogin ? 'login' : 'register'}-${saStep}`} variant={showcaseVariant} />
      </div>
    </div>
  );
};

const Field = ({ label, type = 'text', value, onChange, placeholder, required = false }) => (
  <div className="auth-page__field">
    <label className="auth-page__label">{label}</label>
    <input
      className="auth-page__input"
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </div>
);

export default Login;
