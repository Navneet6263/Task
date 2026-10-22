import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { calendar } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { Banner, Button, Segmented } from '../../ui';
import { daysFor, shift, title, toKey } from './dates';
import { toItems } from './items';
import CalendarSidebar from './CalendarSidebar';
import MonthView from './MonthView';
import TimeGridView from './TimeGridView';
import EventFormModal from './EventFormModal';
import EventDetailModal from './EventDetailModal';

const VIEWS = [['month', 'Month'], ['week', 'Week'], ['day', 'Day']];
const ALL_TYPES = { EVENT: true, MEETING: true, REMINDER: true, TASK: true };

export default function CalendarPage() {
  const self = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [view, setViewState] = useState(() => readPreference('calendar-view', 'month'));
  const [cursor, setCursor] = useState(() => new Date());
  const [data, setData] = useState({ events: [], tasks: [] });
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...ALL_TYPES, ...readPreference('calendar-filters', {}) }));
  const [form, setForm] = useState(null); // { event } to edit or { defaults } to create
  const [detail, setDetail] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [scope, setScopeState] = useState(() => readPreference('calendar-task-scope', 'mine'));

  const days = useMemo(() => daysFor(view, cursor), [view, cursor]);
  const from = toKey(days[0]), to = toKey(days[days.length - 1]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    calendar.events(from, to, scope)
      .then((response) => { if (active) { setData(response.data); setError(''); } })
      .catch((err) => { if (active) setError(err?.response?.status === 404 ? 'The calendar service is not running on the server yet. Restart the backend so it creates the calendar tables, then retry.' : err?.response?.data?.error || 'Could not load the calendar.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, scope, reloadKey]);

  useEffect(() => { calendar.members().then((response) => setMembers(response.data)).catch(() => {}); }, []);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener('calendar:changed', reload);
    return () => window.removeEventListener('calendar:changed', reload);
  }, [reload]);

  const allItems = useMemo(() => toItems(data), [data]);
  const items = useMemo(() => allItems.filter((item) => filters[item.type]), [allItems, filters]);
  const counts = useMemo(() => allItems.reduce((acc, item) => ({ ...acc, [item.type]: (acc[item.type] || 0) + 1 }), {}), [allItems]);

  const setScope = (next) => { setScopeState(next); writePreference('calendar-task-scope', next); };
  const setView = (next) => { setViewState(next); writePreference('calendar-view', next); };
  const setFilter = (type, value) => setFilters((prev) => { const next = { ...prev, [type]: value }; writePreference('calendar-filters', next); return next; });
  const showDay = (day) => { setCursor(day); setView('day'); };
  const create = (day, start) => setForm({ defaults: { day: day || toKey(cursor), start } });
  const afterSave = () => { setForm(null); setDetail(null); reload(); };

  return (
    <div className="flex gap-5">
      <CalendarSidebar cursor={cursor} onPick={setCursor} onCreate={() => create()} filters={filters} setFilter={setFilter} counts={counts} scope={scope} setScope={setScope} />
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <div className="flex">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Previous" onClick={() => setCursor(shift(view, cursor, -1))}>‹</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Next" onClick={() => setCursor(shift(view, cursor, 1))}>›</Button>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{title(view, cursor)}</h1>
          {loading && <span role="status" className="text-xs text-muted">Loading…</span>}
          <span className="flex-1" />
          <Button size="sm" variant="primary" className="lg:hidden" onClick={() => create()}>+ Create</Button>
          <Segmented label="Calendar view" value={view} onChange={setView} options={VIEWS} />
        </header>
        {error && <Banner tone="danger" action={<Button size="sm" onClick={reload}>Retry</Button>}><span role="alert">{error}</span></Banner>}
        {!error && !loading && !items.length && (
          <Banner tone="info" action={scope === 'mine' && <Button size="sm" onClick={() => setScope('team')}>Show team tasks</Button>}>
            Nothing on your calendar for this {view}. Click any {view === 'month' ? 'day' : 'time slot'} to add an event or meeting{scope === 'mine' ? ', or show tasks from your whole team' : ''}.
          </Banner>
        )}
        {view === 'month'
          ? <MonthView days={days} cursor={cursor} items={items} onCreate={create} onOpen={setDetail} onShowDay={showDay} />
          : <div className="flex h-[min(760px,calc(100vh-170px))] min-h-[480px] flex-col"><TimeGridView key={view} days={days} items={items} onCreate={create} onOpen={setDetail} onShowDay={showDay} /></div>}
      </section>

      {detail && !form && <EventDetailModal item={detail} onClose={() => setDetail(null)} onEdit={(event) => setForm({ event })} onChanged={() => { setDetail(null); reload(); }} />}
      {form && <EventFormModal event={form.event} defaults={form.defaults} members={members} selfId={self.id} onClose={() => setForm(null)} onSaved={afterSave} />}
    </div>
  );
}
