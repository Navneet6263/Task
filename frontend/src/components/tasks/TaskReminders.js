import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { calendar } from '../../services/api';
import EventFormModal from '../../pages/Calendar/EventFormModal';

const pad = (n) => String(n).padStart(2, '0');
// Tomorrow at 10:00, local time: a sensible first choice the person can change.
export function tomorrowTen(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}
const self = () => { try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}'); } catch { return {}; } };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Tue, 24 Nov, 10:00" from a calendar time (wall-clock, as saved).
export function shortWhen(item) {
  const [date, time] = String(item.start_at).split('T');
  const [y, m, d] = date.split('-').map(Number);
  // Written out by hand so it reads the same in every browser and language setting.
  const day = `${DAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1]}`;
  return item.all_day ? `${day}, all day` : `${day}, ${String(time).slice(0, 5)}`;
}
const TYPE = { REMINDER: 'Reminder', MEETING: 'Meeting', EVENT: 'Event' };

// Task window → Reminders: reminders and meetings about this task, and "Set reminder", which opens the
// calendar form ready for this task (it goes off as a notification and an email; others can be added).
// onOpenChange tells the task window a form is on top, so Escape closes only the form.
export default function TaskReminders({ task, onOpenChange }) {
  const [items, setItems] = useState(null);
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => Promise.resolve().then(() => calendar.taskEvents(task.id))
    .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
    .catch(() => setItems([])), [task.id]);
  useEffect(() => { load(); }, [load]);
  const show = (value) => {
    setOpen(value); onOpenChange?.(value);
    if (value && !members.length) Promise.resolve().then(() => calendar.members()).then((r) => setMembers(r.data || [])).catch(() => {});
  };

  const now = new Date();
  const upcoming = (items || []).filter((item) => new Date(item.end_at) >= now);
  const past = (items || []).length - upcoming.length;
  return (
    <section className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Reminders</h3>
        <button type="button" onClick={() => show(true)} className="text-sm font-semibold text-accent hover:underline">Set reminder</button>
      </div>
      {items === null ? <p className="py-1 text-xs text-muted">Loading…</p> : (
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.event_type === 'REMINDER' ? 'bg-warn' : 'bg-info'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="block text-xs text-muted">{TYPE[item.event_type] || 'Event'} · {shortWhen(item)}{item.attendees?.length ? ` · with ${item.attendees.length} ${item.attendees.length === 1 ? 'person' : 'people'}` : ''}</span>
              </span>
            </li>
          ))}
          {!upcoming.length && <li className="text-xs text-muted">No reminder yet. You get a notification and an email at the time you pick.</li>}
          {past > 0 && <li className="text-xs text-muted">{past} earlier · <Link to="/calendar" className="font-semibold text-accent hover:underline">see calendar</Link></li>}
        </ul>
      )}
      {open && (
        <EventFormModal members={members} selfId={self().id}
          defaults={{ event_type: 'REMINDER', title: task.title, start: tomorrowTen(), reminder_minutes: '0', task: { id: task.id, title: task.title } }}
          onClose={() => show(false)} onSaved={() => { show(false); load(); }} />
      )}
    </section>
  );
}
