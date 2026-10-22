import { useEffect, useState } from 'react';
import { calendar } from '../../services/api';
import { addDays, toKey, todayKey } from '../Calendar/dates';
import { byStart, toItems } from '../Calendar/items';

const nowStamp = () => { const d = new Date(); return `${toKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// The next seven days of the user's calendar, for the dashboard agenda and greeting.
export default function useAgenda() {
  const [state, setState] = useState({ items: null, error: false });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const from = todayKey();
    calendar.events(from, toKey(addDays(new Date(), 7)))
      .then((response) => { if (active) setState({ items: toItems(response.data), error: false }); })
      .catch(() => { if (active) setState({ items: [], error: true }); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    const reload = () => setReloadKey((value) => value + 1);
    window.addEventListener('calendar:changed', reload);
    return () => window.removeEventListener('calendar:changed', reload);
  }, []);

  const today = todayKey(), now = nowStamp();
  const items = state.items || [];
  const upcoming = items
    .filter((item) => !item.done && !item.declined && (item.allDay ? item.end.slice(0, 10) >= today : item.end >= now))
    .sort((a, b) => a.start.slice(0, 10).localeCompare(b.start.slice(0, 10)) || byStart(a, b));
  const todays = items.filter((item) => item.start.slice(0, 10) <= today && item.end.slice(0, 10) >= today && !item.declined);

  return {
    loaded: state.items !== null,
    error: state.error,
    upcoming: upcoming.slice(0, 6),
    meetingsToday: todays.filter((item) => item.type === 'MEETING').length,
    tasksDueToday: todays.filter((item) => item.kind === 'task' && !item.done).length,
  };
}
