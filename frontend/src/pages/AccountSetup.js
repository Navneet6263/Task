import React, { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { account } from '../services/api';
import { storedUser, updateStoredUser } from '../services/accountState';
import AuthLayout from '../components/auth/AuthLayout';
import { AuthAlert, AuthHeading, PasswordInput, SubmitButton, TextLink } from '../components/auth/AuthFields';
import EmailVerifyForm from '../components/account/EmailVerifyForm';

// After signing in with an employee code: choose your own password (required), then add an email
// (can wait). People who already did both go straight to the dashboard.
export default function AccountSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [user, setUser] = useState(storedUser);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [twoSteps] = useState(() => Boolean(user.must_change_password && user.needs_email));

  const step = user.must_change_password ? 'password' : user.needs_email || params.get('step') === 'email' ? 'email' : null;
  if (!step) return <Navigate to="/dashboard" replace />;
  const patch = (next) => { updateStoredUser(next); setUser((prev) => ({ ...prev, ...next })); };

  const savePassword = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      await account.firstPassword(password);
      patch({ must_change_password: false });
      if (!user.needs_email) navigate('/dashboard', { replace: true });
    } catch (err) { setError(err.response?.data?.error || 'Could not save your password.'); }
    finally { setBusy(false); }
  };

  const hello = user.name ? `Hi ${user.name.split(' ')[0]}` : 'Welcome';
  return (
    <AuthLayout>
      {step === 'password' ? (
        <>
          <AuthHeading eyebrow={twoSteps ? 'Step 1 of 2' : 'One more step'} title={`${hello}, choose your own password`}>
            You signed in with the one-time password your admin gave you. Pick a new one that only you know.
          </AuthHeading>
          <form onSubmit={savePassword} className="flex flex-col gap-4">
            <AuthAlert>{error}</AuthAlert>
            <PasswordInput label="New password" autoComplete="new-password" strength placeholder="At least 8 characters" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordInput label="Type it again" autoComplete="new-password" placeholder="Same password again" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <SubmitButton busy={busy} busyText="Saving…">Save password</SubmitButton>
          </form>
        </>
      ) : (
        <>
          <AuthHeading eyebrow={twoSteps ? 'Step 2 of 2' : 'Your email'} title={user.needs_email ? 'Your email is not registered yet' : 'Change your email'}>
            {user.needs_email
              ? 'Add your email so you can also sign in with it, reset your password yourself and get task updates. We will send a code to confirm it.'
              : 'We will send a code to your new email to confirm it.'}
          </AuthHeading>
          <EmailVerifyForm onDone={(email) => { patch({ needs_email: false, email }); navigate('/dashboard', { replace: true }); }} />
          <p className="mt-6 text-center text-sm text-muted">
            <TextLink onClick={() => navigate('/dashboard', { replace: true })}>Do this later</TextLink>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
