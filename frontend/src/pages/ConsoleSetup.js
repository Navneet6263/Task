import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { SA_BASE_URL } from '../services/runtimeConfig';
import AuthLayout from '../components/auth/AuthLayout';
import { AuthAlert, AuthHeading, AuthIcon, PasswordInput, SubmitButton } from '../components/auth/AuthFields';

const sa = axios.create({ baseURL: SA_BASE_URL });

const rulesFor = (password, confirm, email) => {
  const local = String(email || '').split('@')[0].toLowerCase();
  return [
    ['At least 10 characters', password.length >= 10],
    ['Letters and numbers', /[A-Za-z]/.test(password) && /\d/.test(password)],
    ['Not based on your email', !(local.length >= 4 && password.toLowerCase().includes(local))],
    ['Both passwords match', Boolean(password) && password === confirm],
  ];
};

function Ended({ title, children, onGo, action }) {
  return (
    <div>
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><AuthIcon name={title === 'Password saved' ? 'check' : 'alert'} size={26} /></span>
      <AuthHeading title={title}>{children}</AuthHeading>
      <SubmitButton type="button" onClick={onGo}>{action}</SubmitButton>
    </div>
  );
}

// Console helpers open this from their invite email to choose a password. The link works once.
export default function ConsoleSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [invite, setInvite] = useState(null);
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setLinkError('This link is missing its code. Open it again from your invite email.'); return; }
    sa.get('/setup-password', { params: { token } }).then(({ data }) => setInvite(data))
      .catch((err) => setLinkError(err.response?.data?.error || 'Could not check this link. Try again.'));
  }, [token]);

  const rules = rulesFor(password, confirm, invite?.email);
  const ready = rules.every(([, ok]) => ok);
  const signIn = () => navigate('/login?mode=system-admin');

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try { await sa.post('/setup-password', { token, password }); setDone(true); }
    catch (err) { setError(err.response?.data?.error || 'Could not save the password. Try again.'); }
    finally { setBusy(false); }
  };

  let body;
  if (done) body = <Ended title="Password saved" onGo={signIn} action="Go to console sign in">Sign in with your email and new password. We'll email you a code each time.</Ended>;
  else if (linkError) body = <Ended title="This link can't be used" onGo={signIn} action="Go to sign in">{linkError}</Ended>;
  else if (!invite) body = <p role="status" className="text-sm text-muted">Checking your link…</p>;
  else body = (
    <>
      <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent"><AuthIcon name="shield" size={22} /></span>
      <AuthHeading eyebrow="Platform console" title={`Welcome${invite.name ? `, ${invite.name.split(' ')[0]}` : ''}`}>
        Choose a password for <strong className="text-ink">{invite.email}</strong>. You'll use it with a code we email you each time you sign in.
      </AuthHeading>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthAlert>{error}</AuthAlert>
        <PasswordInput label="New password" autoComplete="new-password" strength required value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordInput label="Confirm password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ul className="grid grid-cols-1 gap-1.5 rounded-lg bg-subtle p-3 text-sm sm:grid-cols-2">
          {rules.map(([label, ok]) => (
            <li key={label} className={`flex items-center gap-2 transition-colors ${ok ? 'text-accent' : 'text-muted'}`}>
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${ok ? 'bg-accent text-accent-fg' : 'border border-line'}`}>{ok ? '✓' : ''}</span>{label}
            </li>
          ))}
        </ul>
        <SubmitButton busy={busy} busyText="Saving…" disabled={!ready}>Save password</SubmitButton>
      </form>
    </>
  );

  return <AuthLayout variant="security">{body}</AuthLayout>;
}
