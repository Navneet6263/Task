import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout, { TopLink } from '../components/auth/AuthLayout';
import { AuthAlert, AuthHeading, AuthIcon, AuthInput, PasswordInput, SubmitButton, TextLink } from '../components/auth/AuthFields';
import { auth } from '../services/api';

function Result({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-start">
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><AuthIcon name={icon} size={26} /></span>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
      {action && <div className="mt-6 w-full">{action}</div>}
    </div>
  );
}

// Request a reset link (no token in the URL), or choose a new password (token present).
const ForgotPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const emailFromUrl = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleRequestLink = async (event) => {
    event.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    try {
      setBusy(true);
      await auth.sendResetLink({ email: email.trim() });
      setLinkSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to send reset link. Please check your email and try again.');
    } finally { setBusy(false); }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setError('');
    if (!password || !confirmPassword) { setError('Please enter both password and confirm password.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters long.'); return; }
    if (password !== confirmPassword) { setError('Password and confirm password must match.'); return; }
    try {
      setBusy(true);
      await auth.resetPassword({ token, email: email || emailFromUrl, password });
      setResetSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired reset link. Please request a new link.');
    } finally { setBusy(false); }
  };

  const mismatch = confirmPassword && password !== confirmPassword;
  const backToSignIn = <p className="mt-6 text-center text-sm text-muted">Remembered it? <TextLink onClick={() => navigate('/login')}>Back to sign in</TextLink></p>;

  let body;
  if (!token && linkSent) {
    body = (
      <Result icon="mail" title="Check your inbox" action={<SubmitButton type="button" onClick={() => navigate('/login')}>Back to sign in</SubmitButton>}>
        <p>We sent a reset link to <strong className="text-ink">{email}</strong>. It works for 15 minutes.</p>
        <p className="mt-3">Didn't get it? Check your spam folder or <TextLink onClick={() => setLinkSent(false)}>try again</TextLink>.</p>
      </Result>
    );
  } else if (!token) {
    body = (
      <>
        <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent"><AuthIcon name="key" size={22} /></span>
        <AuthHeading title="Forgot your password?">Enter the email you sign in with. We'll send you a secure link to set a new password.</AuthHeading>
        <form onSubmit={handleRequestLink} className="flex flex-col gap-4">
          <AuthAlert>{error}</AuthAlert>
          <AuthInput label="Email address" type="email" icon="mail" autoComplete="email" placeholder="name@company.com" required
            hint="The link is valid for 15 minutes." value={email} onChange={(e) => setEmail(e.target.value)} />
          <SubmitButton busy={busy} busyText="Sending link…">Send reset link</SubmitButton>
        </form>
        {backToSignIn}
      </>
    );
  } else if (resetSuccess) {
    body = (
      <Result icon="check" title="Password updated" action={<SubmitButton type="button" onClick={() => navigate('/login')}>Go to sign in</SubmitButton>}>
        Your password was changed. Sign in with your new password.
      </Result>
    );
  } else {
    body = (
      <>
        <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent"><AuthIcon name="lock" size={22} /></span>
        <AuthHeading title="Choose a new password">
          For <strong className="text-ink">{emailFromUrl || email}</strong>. Use at least 8 characters with a mix of letters, numbers and symbols.
        </AuthHeading>
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
          <AuthAlert>{error}</AuthAlert>
          <PasswordInput label="New password" autoComplete="new-password" placeholder="Enter a new password" required strength value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordInput label="Confirm password" autoComplete="new-password" placeholder="Type it again" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            hint={mismatch ? 'Passwords do not match yet.' : confirmPassword ? 'Passwords match.' : ''} />
          <SubmitButton busy={busy} busyText="Updating…">Update password</SubmitButton>
        </form>
        {backToSignIn}
      </>
    );
  }

  return (
    <AuthLayout variant="security" topAction={<TopLink to="/login">Back to sign in</TopLink>}>{body}</AuthLayout>
  );
};

export default ForgotPassword;
