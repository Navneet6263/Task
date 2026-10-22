// Calendar date helpers. Dates are local; keys are YYYY-MM-DD and times YYYY-MM-DDTHH:mm.
export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfWeek = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const todayKey = () => toKey(new Date());

export const monthGrid = (cursor) => {
  const start = startOfWeek(startOfMonth(cursor));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
export const weekDays = (cursor) => {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};
export const daysFor = (view, cursor) => (view === 'month' ? monthGrid(cursor) : view === 'week' ? weekDays(cursor) : [new Date(cursor)]);

export function shift(view, cursor, direction) {
  if (view === 'month') return addMonths(cursor, direction);
  return addDays(cursor, (view === 'week' ? 7 : 1) * direction);
}

const fmt = (d, options) => d.toLocaleDateString('en-US', options);
export function title(view, cursor) {
  if (view === 'month') return fmt(cursor, { month: 'long', year: 'numeric' });
  if (view === 'day') return fmt(cursor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const days = weekDays(cursor);
  const first = days[0], last = days[6];
  const month = (d) => fmt(d, { month: 'short' });
  const end = first.getMonth() === last.getMonth() ? last.getDate() : `${month(last)} ${last.getDate()}`;
  return `${month(first)} ${first.getDate()} – ${end}, ${last.getFullYear()}`;
}

export const minutesOf = (dateTime) => Number(dateTime.slice(11, 13)) * 60 + Number(dateTime.slice(14, 16));
export function timeLabel(dateTime) {
  const minutes = minutesOf(dateTime);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return m ? `${hour}:${pad(m)}${suffix}` : `${hour}${suffix}`;
}
export const hourLabel = (h) => (h === 0 ? '' : `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`);

export function whenText(item) {
  const day = fmt(fromKey(item.start.slice(0, 10)), { weekday: 'short', month: 'short', day: 'numeric' });
  const endDay = item.end.slice(0, 10);
  if (item.allDay) {
    return endDay !== item.start.slice(0, 10) ? `${day} – ${fmt(fromKey(endDay), { month: 'short', day: 'numeric' })} · All day` : `${day} · All day`;
  }
  return `${day} · ${timeLabel(item.start)} – ${timeLabel(item.end)}`;
}

// Next whole hour from now, as a local date-time string.
export function nextHour(dayKey) {
  const now = new Date();
  const hour = Math.min(23, now.getHours() + 1);
  return `${dayKey || toKey(now)}T${pad(hour)}:00`;
}

export function plusMinutes(dateTime, minutes) {
  const d = new Date(`${dateTime}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  return `${toKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const durationMinutes = (start, end) => Math.round((new Date(`${end}:00`) - new Date(`${start}:00`)) / 60000);
