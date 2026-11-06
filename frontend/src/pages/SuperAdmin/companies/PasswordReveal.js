import React, { useState } from 'react';
import { Button } from '../../../ui';

// A temporary password shown once, with a copy button. It cannot be seen again after closing.
export default function PasswordReveal({ email, password, note }) {
  const [copied, setCopied] = useState('');
  const copy = (what, text) => navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500); }).catch(() => {});
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent-soft p-4">
      <p className="text-sm font-semibold">Sign-in details. Copy them now: the password is shown only once.</p>
      {[['email', 'Email', email], ['password', 'Temporary password', password]].map(([key, label, value]) => (
        <div key={key} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <span className="w-36 shrink-0 text-xs text-muted">{label}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{value}</span>
          <Button size="sm" onClick={() => copy(key, value)}>{copied === key ? 'Copied ✓' : 'Copy'}</Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => copy('both', `Sign in at ${window.location.origin}/login\nEmail: ${email}\nTemporary password: ${password}`)}>
        {copied === 'both' ? 'Copied ✓' : 'Copy as a message'}
      </Button>
      <p className="text-xs text-muted">{note || 'Ask them to sign in and set their own password with "Forgot password" on the sign-in page.'}</p>
    </div>
  );
}
