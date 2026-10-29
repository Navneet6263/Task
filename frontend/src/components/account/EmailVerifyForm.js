import React, { useEffect, useState } from 'react';
import { account } from '../../services/api';
import { AuthAlert, AuthInput, SubmitButton, TextLink } from '../auth/AuthFields';
import OtpInput, { otpComplete } from '../auth/OtpInput';

const BLANK = '      ';
const errorOf = (err, fallback) => err.response?.data?.error || fallback;

// Add or change the sign-in email: type it, then enter the 6-digit code we email to it.
export default function EmailVerifyForm({ onDone, submitLabel = 'Send code', current = '' }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState(BLANK);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const send = async (event) => {
    event?.preventDefault();
    const value = (sentTo || email).trim();
    if (!value || busy) return;
    setError(''); setBusy('send');
    try {
      const { data } = await account.startEmail(value);
      setSentTo(data.email || value); setCode(BLANK); setResendIn(60);
    } catch (err) { setError(errorOf(err, 'Could not send the code.')); }
    finally { setBusy(''); }
  };

  const verify = async (value = code) => {
    if (!otpComplete(value) || busy) return;
    setError(''); setBusy('verify');
    try {
      const { data } = await account.verifyEmail(value);
      onDone?.(data.email);
    } catch (err) { setError(errorOf(err, 'Could not check the code.')); setCode(BLANK); }
    finally { setBusy(''); }
  };

  if (!sentTo) {
    return (
      <form onSubmit={send} className="flex flex-col gap-4">
        <AuthAlert>{error}</AuthAlert>
        <AuthInput label={current ? 'New email' : 'Your email'} type="email" icon="mail" autoComplete="email" placeholder="name@company.com" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <SubmitButton busy={busy === 'send'} busyText="Sending code…">{submitLabel}</SubmitButton>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="flex flex-col gap-4">
      <p className="text-sm text-muted">We sent a 6-digit code to <span className="font-semibold text-ink">{sentTo}</span>. It expires in 10 minutes.</p>
      <AuthAlert>{error}</AuthAlert>
      <OtpInput value={code} invalid={Boolean(error)} disabled={busy === 'verify'}
        onChange={(next) => { setCode(next); if (error) setError(''); if (otpComplete(next)) verify(next); }} />
      <SubmitButton busy={busy === 'verify'} busyText="Checking code…" disabled={!otpComplete(code)}>Confirm email</SubmitButton>
      <div className="flex items-center justify-between text-sm">
        <TextLink onClick={() => { setSentTo(''); setError(''); }}>Use a different email</TextLink>
        {resendIn > 0
          ? <span className="text-muted">Resend in 0:{String(resendIn).padStart(2, '0')}</span>
          : <TextLink onClick={send} disabled={busy === 'send'}>{busy === 'send' ? 'Sending…' : 'Resend code'}</TextLink>}
      </div>
    </form>
  );
}
