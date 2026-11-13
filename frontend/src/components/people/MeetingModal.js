import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { calendar } from '../../services/api';
import { Banner, Button, Input, Modal, Select, Textarea } from '../../ui';

const DURATIONS = [[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1 hour 30 minutes'], [120, '2 hours']];
const REMINDERS = [['', 'No reminder'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']];
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
// The next half hour from now, e.g. 10:12 → 10:30.
export function nextSlot(now = new Date()) {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return { date: localDate(d), time: localTime(d) };
}
// "2026-11-14" + "23:45" + 30 → "2026-11-15T00:15" (crosses midnight correctly).
export function endOf(date, time, minutes) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const end = new Date(y, m - 1, d, hh, mm + Number(minutes));
  return `${localDate(end)}T${localTime(end)}`;
}

// "Schedule a meeting with Ashish": saved in the calendar with them invited. They get a notification,
// and an email invite when the workspace has Communications on.
export default function MeetingModal({ person, onClose }) {
  const first = String(person.name || '').split(' ')[0] || person.name;
  const slot = nextSlot();
  const [form, setForm] = useState({ title: `Meeting with ${first}`, date: slot.date, time: slot.time, duration: 30, location: '', note: '', reminder: 15 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.title.trim() && form.date && form.time;

  const save = async (event) => {
    event?.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await calendar.create({
        title: form.title.trim(), description: form.note.trim(), location: form.location.trim(), event_type: 'MEETING', all_day: false,
        start_at: `${form.date}T${form.time}`, end_at: endOf(form.date, form.time, form.duration),
        reminder_minutes: form.reminder === '' ? null : Number(form.reminder), attendee_ids: [person.id],
      });
      setDone({ emailed: Boolean(data?.emailed) });
    } catch (err) { setError(err.response?.data?.error || 'Could not save the meeting.'); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal size="sm" title="Meeting scheduled" onClose={onClose}
        footer={<><Link to="/calendar" onClick={onClose} className="mr-auto text-sm font-semibold text-accent hover:underline">Open calendar</Link><Button variant="primary" onClick={onClose}>Done</Button></>}>
        <p className="text-sm">It is saved in your calendar. <span className="font-semibold">{person.name}</span> has been notified in GreenTask{done.emailed ? ' and will get an email invite they can add to their own calendar' : ''}.</p>
      </Modal>
    );
  }

  return (
    <Modal size="md" title={`Schedule a meeting with ${first}`} subtitle="It goes in your calendar with them invited." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : 'Schedule meeting'}</Button></>}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Title</span><Input autoFocus maxLength={200} value={form.title} onChange={set('title')} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Date</span><Input type="date" value={form.date} onChange={set('date')} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Start time</span><Input type="time" step="300" value={form.time} onChange={set('time')} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">How long</span>
            <Select value={form.duration} onChange={set('duration')}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        </div>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Where or link</span><Input maxLength={500} placeholder="Meeting room, or a Teams / Meet / Zoom link" value={form.location} onChange={set('location')} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Note for {first}</span><Textarea rows={2} maxLength={2000} placeholder="What it is about (optional)" value={form.note} onChange={set('note')} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Remind me</span>
          <Select value={form.reminder} onChange={set('reminder')}>{REMINDERS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</Select></label>
        {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}
