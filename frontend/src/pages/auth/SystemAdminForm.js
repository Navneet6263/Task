import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { SA_BASE_URL } from '../../services/runtimeConfig';
import { AuthAlert, AuthInput, PasswordInput, SubmitButton, TextLink } from '../../components/auth/AuthFields';
import OtpInput, { otpComplete } from '../../components/auth/OtpInput';

const sa = axios.create({ baseURL: SA_BASE_URL });
const BLANK = '      ';
const errorOf = (err, fallback) => err.response?.data?.error || fallback;

// Platform admin sign-in: email + password, then the 6-digit code we email every time.
export default function SystemAdminForm({ onStepChange, onBack }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState(BLANK);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const startOver = () => {
    setChallenge(null); setCode(BLANK); setPassword(''); setError(''); setNotice(''); setEnded(false);
    onStepChange?.(1, null);
  };

  const start = async (event) => {
    event.preventDefault(); setError(''); setBusy('start');
    try {
      const { data } = await sa.post('/login/start', { email: email.trim(), password });
      setChallenge(data); setCode(BLANK); setResendIn(data.resend_in || 60); setEnded(false); setNotice('');
      onStepChange?.(2, data);
    } catch (err) { setError(errorOf(err, 'Could not sign in. Try again.')); }
    finally { setBusy(''); }
  };

  const verify = async (value = code) => {
    if (!otpComplete(value) || busy) return;
    setError(''); setBusy('verify');
    try {
      const { data } = await sa.post('/login/verify', { challenge_id: challenge.challenge_id, code: value });
      localStorage.setItem('sa_token', data.token);
      localStorage.setItem('sa_user', JSON.stringify({ email: data.email, name: data.name, is_master: data.is_master }));
      navigate('/sa-dashboard');
    } catch (err) {
      setError(errorOf(err, 'Could not check the code.'));
      setEnded([410, 429].includes(err.response?.status));
      setCode(BLANK);
    } finally { setBusy(''); }
  };

  const resend = async () => {
    setError(''); setNotice(''); setBusy('resend');
    try {
      const { data } = await sa.post('/login/resend', { challenge_id: challenge.challenge_id });
      setResendIn(data.resend_in || 60); setCode(BLANK); setNotice('We sent a new code. The old one no longer works.');
    } catch (err) {
      setError(errorOf(err, 'Could not send a new code.'));
      if (err.response?.data?.retry_in) setResendIn(err.response.data.retry_in);
      else if (err.response?.status === 429 || err.response?.status === 410) setEnded(true);
    } finally { setBusy(''); }
  };

  if (!challenge) {
    return (
      <form onSubmit={start} className="flex flex-col gap-4">
        <AuthAlert>{error}</AuthAlert>
        <AuthInput label="Admin email" type="email" icon="mail" autoComplete="username" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordInput autoComplete="current-password" placeholder="Your console password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton busy={busy === 'start'} busyText="Checking…">Continue</SubmitButton>
        <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">After your password we email you a 6-digit code. New helpers set their password from the invite email first.</p>
        <p className="text-center text-sm text-muted">Not a platform admin? <TextLink onClick={onBack}>Back to workspace sign in</TextLink></p>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="flex flex-col gap-4">
      <AuthAlert>{error}</AuthAlert>
      {notice && !error && <AuthAlert tone="ok">{notice}</AuthAlert>}
      <OtpInput value={code} invalid={Boolean(error) && !ended} disabled={ended || busy === 'verify'}
        onChange={(next) => { setCode(next); if (error && !ended) setError(''); if (otpComplete(next)) verify(next); }} />
      {ended ? (
        <SubmitButton type="button" onClick={startOver}>Sign in again</SubmitButton>
      ) : (
        <SubmitButton busy={busy === 'verify'} busyText="Checking code…" disabled={!otpComplete(code)}>Verify and sign in</SubmitButton>
      )}
      <div className="flex items-center justify-between text-sm">
        <TextLink onClick={startOver}>Use a different account</TextLink>
        {!ended && (resendIn > 0
          ? <span className="text-muted">Resend in 0:{String(resendIn).padStart(2, '0')}</span>
          : <TextLink onClick={resend} disabled={busy === 'resend'}>{busy === 'resend' ? 'Sending…' : 'Resend code'}</TextLink>)}
      </div>
      <p className="text-center text-xs text-muted">The code expires in 10 minutes and works once. Didn't get it? Check spam, then resend.</p>
    </form>
  );
}
