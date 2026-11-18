import React, { useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Card, FieldError, Input, Switch } from '../../../ui';
import { errorOf, fieldsOf } from '../format';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const dayLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

// Hours before signing out: on working days, employees cannot use Log out until they have submitted
// this many hours for the day (Leave entries count). Managers and admins are never stopped.
export default function SignOutRuleCard() {
  const [rule, setRule] = useState(null);
  const [form, setForm] = useState(null);
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const take = (data) => { setRule(data); setForm({ enabled: data.enabled, hours: String(data.min_daily_hours || 8), days: data.working_days }); };
  useEffect(() => { timesheet.signOutRule().then((r) => take(r.data)).catch(() => setRule(false)); }, []);
  if (rule === false) return null;
  if (!rule || !form) return null;

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      take((await timesheet.saveSignOutRule({ enabled: form.enabled, min_daily_hours: Number(form.hours), working_days: form.days })).data);
      setErrors({});
      notify(form.enabled ? `Employees now need ${form.hours} hours submitted before they log out on working days.` : 'Employees can log out any time again.', 'success');
    } catch (err) { setErrors(fieldsOf(err)); notify(errorOf(err, 'Could not save. Please try again.')); }
    finally { setBusy(false); }
  };
  const toggleDay = (day) => setForm((prev) => ({ ...prev, days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day].sort() }));
  const addHoliday = async () => {
    setBusy(true);
    try { take((await timesheet.addHoliday(holiday)).data); setHoliday({ date: '', name: '' }); setErrors({}); }
    catch (err) { setErrors(fieldsOf(err)); notify(errorOf(err, 'Could not add the holiday.')); }
    finally { setBusy(false); }
  };
  const removeHoliday = async (id) => {
    try { take((await timesheet.removeHoliday(id)).data); } catch (err) { notify(errorOf(err, 'Could not remove the holiday.')); }
  };

  return (
    <Card className="p-4">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold">Hours before logging out</h3>
            <p className="text-sm text-muted">On working days, employees cannot log out until they have submitted this many hours for the day. Leave entries count, so a half day is hours worked plus a Leave entry. Managers and admins are never stopped.</p>
          </div>
          <Switch checked={form.enabled} label="Stop employees from logging out with fewer hours" onChange={(on) => setForm({ ...form, enabled: on })} />
        </div>
        {form.enabled && <>
          <div className="text-sm">
            <label htmlFor="ts-min-hours">Hours needed each working day</label>
            <span className="mt-1 flex items-center gap-2">
              <Input id="ts-min-hours" type="number" min="0.25" max="24" step="0.25" className="!w-24" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
              hours (more is fine)
            </span>
            <FieldError text={errors.min_daily_hours} />
          </div>
          <div className="text-sm">
            <p>Working days</p>
            <div role="group" aria-label="Working days" className="mt-1 flex flex-wrap gap-1.5">
              {DAYS.map(([day, name]) => (
                <button key={day} type="button" aria-pressed={form.days.includes(day)} onClick={() => toggleDay(day)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold ${form.days.includes(day) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>{name}</button>
              ))}
            </div>
            <FieldError text={errors.working_days} />
          </div>
        </>}
        <div><Button type="submit" variant="primary" disabled={busy}>Save</Button></div>
      </form>

      {rule.enabled && (
        <section className="mt-4 border-t border-line pt-3" aria-label="Holidays">
          <h4 className="text-sm font-semibold">Holidays</h4>
          <p className="text-sm text-muted">No one is stopped on these days.</p>
          <ul className="my-2 flex flex-col gap-1">
            {rule.holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 text-sm">
                <span className="font-mono tabular-nums">{dayLabel(h.date)}</span>
                <span className="text-muted">{h.name || ''}</span>
                <button type="button" onClick={() => removeHoliday(h.id)} className="ml-auto text-xs font-semibold text-danger hover:underline" aria-label={`Remove holiday ${h.date}`}>Remove</button>
              </li>
            ))}
            {!rule.holidays.length && <li className="text-sm text-muted">No holidays added.</li>}
          </ul>
          <div className="flex flex-wrap items-start gap-2">
            <Input type="date" aria-label="Holiday date" className="!w-44" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} />
            <Input aria-label="Holiday name" placeholder="Name, e.g. Diwali" className="!w-56" maxLength={120} value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} />
            <Button disabled={busy || !holiday.date} onClick={addHoliday}>Add holiday</Button>
          </div>
          <FieldError text={errors.date} />
        </section>
      )}
    </Card>
  );
}
