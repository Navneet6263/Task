import React, { useState } from 'react';
import { readPreference, writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import { Button, Card, CardHeader, Input } from '../../ui';

// Three personal goals for the month; private to this account on this browser.
export default function FocusPlan() {
  const [focus, setFocus] = useState(() => readPreference('focus-plan', { f1: '', f2: '', f3: '' }));
  const save = (event) => {
    event.preventDefault();
    const saved = writePreference('focus-plan', focus);
    notify(saved ? 'Focus plan saved on this browser.' : 'Could not save: browser storage is unavailable.', saved ? 'success' : 'error');
  };
  return (
    <Card>
      <CardHeader title="My focus this month" aside="Private to you" />
      <form onSubmit={save} className="flex flex-col gap-2 p-4">
        {[['f1', 'e.g. Close every high-priority task within 3 days'], ['f2', 'e.g. No overdue tasks at month end'], ['f3', 'e.g. Learn the new reporting module']].map(([key, hint], index) => (
          <label key={key} className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-xs font-bold text-accent">{index + 1}</span>
            <Input aria-label={`Focus ${index + 1}`} placeholder={hint} maxLength={120} value={focus[key]} onChange={(e) => setFocus({ ...focus, [key]: e.target.value })} />
          </label>
        ))}
        <div className="flex justify-end pt-1"><Button type="submit" size="sm" variant="primary">Save plan</Button></div>
      </form>
    </Card>
  );
}
