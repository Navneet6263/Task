import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storedUser } from '../../services/accountState';
import { Banner, Button } from '../../ui';

const HIDE_KEY = 'email_reminder_hidden';
const hiddenThisSession = () => { try { return sessionStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

// A gentle strip for people who signed in with an employee code and have not added an email yet.
export default function EmailReminder() {
  const navigate = useNavigate();
  const [needsEmail, setNeedsEmail] = useState(() => Boolean(storedUser().needs_email));
  const [hidden, setHidden] = useState(hiddenThisSession);
  useEffect(() => {
    const refresh = () => setNeedsEmail(Boolean(storedUser().needs_email));
    window.addEventListener('account-changed', refresh);
    return () => window.removeEventListener('account-changed', refresh);
  }, []);
  if (!needsEmail || hidden) return null;

  const hide = () => { try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <Banner tone="warn" action={(
      <span className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => navigate('/account-setup?step=email')}>Add email</Button>
        <Button size="sm" variant="ghost" onClick={hide}>Later</Button>
      </span>
    )}>
      <strong>Your email is not registered.</strong> Add it so you can also sign in with it and reset your password yourself.
    </Banner>
  );
}
