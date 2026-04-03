import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthShowcase from '../components/AuthShowcase';
import { auth } from '../services/api';
import './Login.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.email.trim() || !form.password || !form.confirmPassword) {
      setError('Please fill email, new password, and confirm password.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Password and confirm password must match.');
      return;
    }

    try {
      setBusy(true);
      await auth.resetPassword({
        email: form.email.trim(),
        password: form.password,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to reset password right now.');
    } finally {
      setBusy(false);
    }
  };

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
                <small>Password recovery</small>
              </div>
            </button>

            <button type="button" className="auth-page__ghost-link" onClick={() => navigate('/login')}>
              Back to login
            </button>
          </div>

          <div className="auth-page__heading">
            <p className="auth-page__eyebrow">Password reset</p>
            <h1>Choose a new password.</h1>
            <p>
              Enter your registered email and set a fresh password for your workspace access.
            </p>
          </div>

          {error && <div className="auth-page__error">{error}</div>}

          {!success ? (
            <form onSubmit={handleSubmit} className="auth-page__form">
              <Field
                label="Email address"
                type="email"
                value={form.email}
                onChange={(value) => updateField('email', value)}
                placeholder="name@company.com"
                required
              />

              <div className="auth-page__field">
                <label className="auth-page__label">New password</label>
                <div className="auth-page__password-wrap">
                  <input
                    className="auth-page__input"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-page__inline-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <Field
                label="Confirm password"
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(value) => updateField('confirmPassword', value)}
                placeholder="Re-enter password"
                required
              />

              <div className="auth-page__info">
                This reset works on the registered email account used for employee, manager, or company admin login.
              </div>

              <button type="submit" className="auth-page__submit" disabled={busy}>
                {busy ? 'Updating...' : 'Reset Password'}
              </button>
            </form>
          ) : (
            <div className="auth-page__success-card">
              <p className="auth-page__eyebrow">Password updated</p>
              <h2>You can sign in now.</h2>
              <p>Your password has been changed successfully. Return to the login page and continue.</p>
              <button type="button" className="auth-page__submit" onClick={() => navigate('/login')}>
                Back to Login
              </button>
            </div>
          )}

          {!success && (
            <div className="auth-page__footer">
              <div className="auth-page__footer-row">
                <span className="auth-page__footer-text">Remembered your password?</span>
                <button type="button" className="auth-page__text-link" onClick={() => navigate('/login')}>
                  Back to sign in
                </button>
              </div>
            </div>
          )}
        </section>

        <AuthShowcase variant="security" />
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

export default ForgotPassword;
