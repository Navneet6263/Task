import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../../ui';
import { splitHours } from '../../pages/Timesheet/entries/HoursInput';

// 5.33 → "5 h 20 min", 0.5 → "30 min".
export const hm = (hours) => {
  const { h, m } = splitHours(String(hours || 0));
  return [h && h !== '0' ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 h';
};

// Shown instead of logging out when the company's timesheet rule says today is not complete yet.
export default function SignOutBlock({ info, onClose }) {
  const navigate = useNavigate();
  const go = (path) => { onClose(); navigate(path); };
  return (
    <Modal title="Finish today's timesheet first" onClose={onClose}
      subtitle={`Your company needs at least ${hm(info.required)} of submitted time on working days before you log out.`}
      footer={<>
        <Button variant="primary" onClick={() => go('/timesheet?add=1')}>Add Timesheet</Button>
        <Button onClick={() => go('/timesheet')}>Open my entries</Button>
        <Button variant="ghost" onClick={onClose}>Stay signed in</Button>
      </>}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Submitted today</dt><dd className="font-mono font-semibold tabular-nums">{hm(info.hours)}</dd>
        <dt className="text-muted">Still needed</dt><dd className="font-mono font-semibold tabular-nums text-danger">{hm(info.missing)}</dd>
        {info.draft_hours > 0 && <>
          <dt className="text-muted">In drafts</dt><dd className="font-mono font-semibold tabular-nums">{hm(info.draft_hours)}</dd>
        </>}
      </dl>
      {info.draft_hours > 0 && <p className="mt-3 text-sm">You have drafts for today. Submit them and they count.</p>}
      <p className="mt-3 text-sm text-muted">On a half day, add a Leave entry for the hours you were away.</p>
    </Modal>
  );
}
