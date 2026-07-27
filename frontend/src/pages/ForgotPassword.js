import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthShowcase from '../components/AuthShowcase';
import { auth } from '../services/api';
import './Login.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const emailFromUrl = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Mode 1: Request Link (no token in URL)
  const handleRequestLink = async (event) => {
    event.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    try {
      setBusy(true);
      await auth.sendResetLink({ email: email.trim() });
      setLinkSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to send reset link. Please check your email and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Mode 2: Reset Password with Token (token present in URL)
  const handleResetPassword = async (event) => {
    event.preventDefault();
    setError('');

    if (!password || !confirmPassword) {
      setError('Please enter both password and confirm password.');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirm password must match.');
      return;
    }

    try {
      setBusy(true);
      await auth.resetPassword({
        token,
        email: email || emailFromUrl,
        password,
      });
      setResetSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired reset link. Please request a new link.');
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
              <span>GT</span>
              <div>
                <strong>GreenTask</strong>
                <small>Password recovery</small>
              </div>
            </button>

            <button type="button" className="auth-page__ghost-link" onClick={() => navigate('/login')}>
              Back to login
            </button>
          </div>

          {!token ? (
            /* ──────────────── STAGE 1: Request Reset Link ──────────────── */
            <>
              <div className="auth-page__heading">
                <p className="auth-page__eyebrow">Password Reset</p>
                <h1>Forgot your password?</h1>
                <p>
                  Enter your registered email address and we will send you a secure link to reset your password.
                </p>
              </div>

              {error && <div className="auth-page__error">{error}</div>}

              {!linkSent ? (
                <form onSubmit={handleRequestLink} className="auth-page__form">
                  <div className="auth-page__field">
                    <label className="auth-page__label">Email Address</label>
                    <input
                      className="auth-page__input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      required
                    />
                  </div>

                  <div className="auth-page__info">
                    A password reset link valid for 15 minutes will be sent to this email address.
                  </div>

                  <button type="submit" className="auth-page__submit" disabled={busy}>
                    {busy ? 'Sending Reset Link...' : 'Send Reset Link'}
                  </button>
                </form>
              ) : (
                <div className="auth-page__success-card">
                  <p className="auth-page__eyebrow">Email Sent!</p>
                  <h2>Check your inbox</h2>
                  <p>
                    We have sent a password reset link to <strong>{email}</strong>. Please check your email inbox and click the link to reset your password.
                  </p>
                  <div style={{ marginTop: '16px', fontSize: '13px', color: '#64748b' }}>
                    Didn't receive the email? Check your spam folder or{' '}
                    <button
                      type="button"
                      style={{ color: '#2563eb', fontWeight: 'bold', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setLinkSent(false)}
                    >
                      try again
                    </button>.
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ──────────────── STAGE 2: Choose New Password ──────────────── */
            <>
              <div className="auth-page__heading">
                <p className="auth-page__eyebrow">Set New Password</p>
                <h1>Choose a new password</h1>
                <p>
                  Create a new password for account <strong>{emailFromUrl || email}</strong>.
                </p>
              </div>

              {error && <div className="auth-page__error">{error}</div>}

              {!resetSuccess ? (
                <form onSubmit={handleResetPassword} className="auth-page__form">
                  <div className="auth-page__field">
                    <label className="auth-page__label">New Password</label>
                    <div className="auth-page__password-wrap">
                      <input
                        className="auth-page__input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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

                  <div className="auth-page__field">
                    <label className="auth-page__label">Confirm Password</label>
                    <input
                      className="auth-page__input"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      required
                    />
                  </div>

                  <button type="submit" className="auth-page__submit" disabled={busy}>
                    {busy ? 'Updating Password...' : 'Update Password'}
                  </button>
                </form>
              ) : (
                <div className="auth-page__success-card">
                  <p className="auth-page__eyebrow">Success!</p>
                  <h2>Password Updated</h2>
                  <p>Your password has been reset successfully. You can now log in with your new password.</p>
                  <button type="button" className="auth-page__submit" onClick={() => navigate('/login')}>
                    Go to Sign In
                  </button>
                </div>
              )}
            </>
          )}

          {!linkSent && !resetSuccess && (
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

export default ForgotPassword;
