import React from 'react';
import { Banner, Button } from '../../../ui';
import { fmtDate } from '../format';

export default function LockBanner({ entry, isAdmin, onRequest }) {
  const pending = entry.unlock_requests?.find((request) => request.status === 'PENDING');
  if (entry.status === 'DRAFT') {
    return <Banner>Draft. The {entry.lock_days}-day edit window starts when it is submitted.</Banner>;
  }
  if (entry.lock.unlocked_until) {
    return <Banner tone="info">Unlocked by admin until <b>{fmtDate(entry.lock.unlocked_until)}</b>. Make your changes before then.</Banner>;
  }
  if (entry.lock.locked && isAdmin) {
    return <Banner tone="info">Locked for the team since {fmtDate(entry.lock.editable_until)}. You can still edit it as admin.</Banner>;
  }
  if (entry.lock.locked) {
    const action = pending
      ? <span className="text-xs">Unlock request sent on {fmtDate(pending.created_on)}. Waiting for admin.</span>
      : entry.can_request_unlock && <Button size="sm" onClick={onRequest}>Request unlock</Button>;
    return (
      <Banner tone="warn" action={action}>
        <b>Locked.</b> The edit window closed on <b>{fmtDate(entry.lock.editable_until)}</b>. Talk to your admin to make changes.
      </Banner>
    );
  }
  return <Banner tone="ok">Editable until <b>{fmtDate(entry.lock.editable_until)}</b> ({entry.lock_days} days after submission).</Banner>;
}
