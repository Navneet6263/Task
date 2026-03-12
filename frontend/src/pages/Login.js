import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/api';
import './Login.css';

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
  const [loginType, setLoginType] = useState('user');
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const navigate = useNavigate();

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const isCompanyLogin = isLogin && loginType === 'company';
      if (isCompanyLogin) {
        const response = await auth.companyLogin({
          email: form.email.trim(),
          password: form.password,
        });

        localStorage.setItem('company_token', response.data.token);
        localStorage.setItem(
          'company_user',
          JSON.stringify({
            name: response.data.name,
            email: response.data.email,
            role: 'company_admin',
            limits: response.data.limits,
          })
        );
        navigate('/dashboard');
        return;
      }

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
      localStorage.setItem('token', response.data.token);
      localStorage.setItem(
        'user',
        JSON.stringify({
          name: response.data.name,
          email: response.data.email,
          role: response.data.role,
        })
      );
      navigate('/dashboard');
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PENDING') {
        setError('Your company account is pending approval from Super Admin.');
      } else if (code === 'REJECTED') {
        setError(err.response?.data?.error || 'Your account was rejected.');
      } else {
        setError(err.response?.data?.error || 'Unable to process your request right now.');
      }
    }
  };

  const renderRegisterFields = () => (
    <>
      <Field
        label="Full Name"
        value={form.name}
        onChange={(value) => updateField('name', value)}
        placeholder="Enter your full name"
        required
      />
      <Field
        label="Mobile Number"
        value={form.mobile}
        onChange={(value) => updateField('mobile', value)}
        placeholder="Enter mobile number"
      />
      <Field
        label="Employee ID"
        value={form.employee_id}
        onChange={(value) => updateField('employee_id', value)}
        placeholder="Example: EMP001"
      />

      <div className="neon-auth__field">
        <label className="neon-auth__label">Register As</label>
        <select
          className="neon-auth__input"
          value={form.role}
          onChange={(event) => updateField('role', event.target.value)}
        >
          <option value="person">Employee</option>
          <option value="manager">Manager</option>
        </select>
      </div>

      {form.role === 'person' && (
        <Field
          label="Team Code"
          value={form.team_code}
          onChange={(value) => updateField('team_code', value.toUpperCase())}
          placeholder="Given by your manager"
          required
        />
      )}

      {form.role === 'manager' && (
        <>
          <Field
            label="Company Code"
            value={form.company_code}
            onChange={(value) => updateField('company_code', value.toUpperCase())}
            placeholder="If joining existing company"
          />
          {!form.company_code && (
            <Field
              label="Company Name"
              value={form.company_name}
              onChange={(value) => updateField('company_name', value)}
              placeholder="For creating a new organization"
            />
          )}
          <div className="neon-auth__note">
            {form.company_code
              ? 'You will join an existing organization after verification.'
              : 'A new organization and default team will be created for you.'}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="neon-auth">
      <div className="neon-auth__light-grid" />
      <div className="neon-auth__floor-glow" />

      <div className="neon-auth__panel">
        <div className="neon-auth__header">
          <p className="neon-auth__kicker">NAV TASK SECURE ACCESS</p>
          <h1>{isLogin ? 'Login' : 'Create Account'}</h1>
          <p>
            {isLogin
              ? 'Use your credentials to continue to the workspace.'
              : 'Register quickly and start task tracking in minutes.'}
          </p>
        </div>

        {isLogin && (
          <div className="neon-auth__tabs">
            <button
              type="button"
              className={`neon-auth__tab ${loginType === 'user' ? 'is-active' : ''}`}
              onClick={() => {
                setLoginType('user');
                setError('');
              }}
            >
              Employee or Manager
            </button>
            <button
              type="button"
              className={`neon-auth__tab ${loginType === 'company' ? 'is-active' : ''}`}
              onClick={() => {
                setLoginType('company');
                setError('');
              }}
            >
              Company Admin
            </button>
          </div>
        )}

        {error && <div className="neon-auth__error">{error}</div>}

        <form onSubmit={handleSubmit} className="neon-auth__form">
          {!isLogin && renderRegisterFields()}

          <Field
            label="Email Address"
            type="email"
            value={form.email}
            onChange={(value) => updateField('email', value)}
            placeholder="your@email.com"
            required
          />

          <div className="neon-auth__field">
            <label className="neon-auth__label">Password</label>
            <div className="neon-auth__password-wrap">
              <input
                className="neon-auth__input"
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                className="neon-auth__ghost-btn"
                onClick={() => setShowPass((prev) => !prev)}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {isLogin && (
            <div className="neon-auth__row">
              <label className="neon-auth__remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                className="neon-auth__text-btn"
                onClick={() => setError('Forgot password flow can be linked here.')}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button type="submit" className="neon-auth__submit">
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <div className="neon-auth__footer">
          <p>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            <button
              type="button"
              className="neon-auth__text-btn"
              onClick={() => {
                setIsLogin((prev) => !prev);
                setError('');
                setShowPass(false);
              }}
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>

          {isLogin && (
            <p>
              Need company onboarding?
              <button
                type="button"
                className="neon-auth__text-btn"
                onClick={() => navigate('/register-company')}
              >
                Company Registration
              </button>
            </p>
          )}

          <p className="neon-auth__admin-line">
            <button type="button" className="neon-auth__admin-link" onClick={() => navigate('/sa-login')}>
              System Admin Access
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, type = 'text', value, onChange, placeholder, required = false }) => (
  <div className="neon-auth__field">
    <label className="neon-auth__label">{label}</label>
    <input
      className="neon-auth__input"
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </div>
);

export default Login;
