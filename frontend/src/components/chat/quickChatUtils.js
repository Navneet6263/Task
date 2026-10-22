// Helpers for the quick chat panel (kept pure so they are easy to test).
export const msgKey = (m) => m.client_temp_id || `id:${m.id}`;

// Insert or replace a message, matching the server copy to its optimistic twin.
export function upsert(list, message) {
  const index = list.findIndex((m) => (message.client_temp_id && m.client_temp_id === message.client_temp_id) || (message.id && m.id === message.id));
  if (index === -1) return [...list, message];
  const next = [...list];
  next[index] = { ...next[index], ...message, status: message.status };
  return next;
}

const sameDay = (a, b) => a.toDateString() === b.toDateString();
export function dayLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export const timeOf = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); };

// Adds day separators and marks the first message of each run by the same person.
export function arrange(messages) {
  const out = [];
  let lastDay = '', lastUser = null, lastTime = 0;
  messages.forEach((m) => {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) { out.push({ type: 'day', key: `day-${day}-${msgKey(m)}`, label: day }); lastDay = day; lastUser = null; }
    const time = new Date(m.created_at).getTime() || 0;
    const startsRun = m.user_id !== lastUser || time - lastTime > 5 * 60000 || Boolean(m.reply_to);
    out.push({ type: 'msg', key: msgKey(m), message: m, startsRun });
    lastUser = m.user_id; lastTime = time;
  });
  return out;
}

// Readable name for a conversation: channel title, or the other person in a direct chat.
export function threadName(thread, members, selfId) {
  if (thread.thread_type !== 'direct') return thread.is_default ? 'General' : thread.title;
  const otherId = Number(thread.direct_user_one) === Number(selfId) ? thread.direct_user_two : thread.direct_user_one;
  return members.find((m) => Number(m.id) === Number(otherId))?.name || thread.title || 'Direct message';
}
