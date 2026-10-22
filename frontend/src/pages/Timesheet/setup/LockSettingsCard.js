import React, { useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Card, FieldError, Input } from '../../../ui';
import { errorOf, fieldsOf } from '../format';

export default function LockSettingsCard({ settings, onSaved }) {
  const [form, setForm] = useState({ lock_days: String(settings.lock_days), unlock_days: String(settings.unlock_days) });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await timesheet.saveSettings({ lock_days: Number(form.lock_days), unlock_days: Number(form.unlock_days) });
      setErrors({}); notify(`Entries now lock ${form.lock_days} days after submission.`, 'success'); onSaved();
    } catch (err) { setErrors(fieldsOf(err)); notify(errorOf(err, 'Could not save the edit lock.')); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4">
      <form onSubmit={save}>
        <h3 className="text-[15px] font-semibold">Edit lock</h3>
        <p className="mb-3 text-sm text-muted">Admins can always edit. After the window, managers and employees see the entry as locked and can send you an unlock request.</p>
        <div className="flex flex-wrap items-start gap-6">
          <div className="text-sm">
            <label htmlFor="ts-lock-days">Team can edit for</label>
            <span className="mt-1 flex items-center gap-2">
              <Input id="ts-lock-days" type="number" min="1" max="365" className="!w-24" value={form.lock_days} onChange={(event) => setForm({ ...form, lock_days: event.target.value })} />
              days after submission
            </span>
            <FieldError text={errors.lock_days} />
          </div>
          <div className="text-sm">
            <label htmlFor="ts-unlock-days">An approved unlock lasts</label>
            <span className="mt-1 flex items-center gap-2">
              <Input id="ts-unlock-days" type="number" min="1" max="90" className="!w-24" value={form.unlock_days} onChange={(event) => setForm({ ...form, unlock_days: event.target.value })} />
              days
            </span>
            <FieldError text={errors.unlock_days} />
          </div>
        </div>
        <Button type="submit" variant="primary" className="mt-3" disabled={busy}>Save edit lock</Button>
      </form>
    </Card>
  );
}
