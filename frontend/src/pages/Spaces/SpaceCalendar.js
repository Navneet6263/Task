import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasks } from '../../services/api';
import { Button, Loading } from '../../ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PRIORITY_BAR = { HIGH: 'border-l-danger', MEDIUM: 'border-l-warn', LOW: 'border-l-info' };
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Space → Calendar: the team's tasks on their due dates, a month at a time.
export default function SpaceCalendar({ teamId }) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [list, setList] = useState(null);

  useEffect(() => {
    let alive = true;
    setList(null);
    (async () => {
      const all = [];
      for (let page = 1; page <= 5; page += 1) {
        const { data } = await tasks.getByTeam(teamId, page, 100, { sort: 'due' });
        all.push(...(data.data || []));
        if (page >= (data.pagination?.total_pages || 1)) break;
      }
      if (alive) setList(all.filter((t) => t.due_date));
    })().catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [teamId]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);
  const byDay = useMemo(() => (list || []).reduce((map, t) => {
    const day = String(t.due_date).slice(0, 10);
    (map[day] = map[day] || []).push(t);
    return map;
  }, {}), [list]);
  const today = ymd(new Date());
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
        <div className="flex items-center rounded-md border border-line bg-surface">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="px-2.5 py-1.5 text-muted hover:text-ink">‹</button>
          <span className="min-w-[130px] text-center text-sm font-semibold">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="px-2.5 py-1.5 text-muted hover:text-ink">›</button>
        </div>
        <span className="ml-auto text-xs text-muted">Tasks sit on their due date. The left edge shows priority.</span>
      </div>
      {list === null ? <Loading>Loading the calendar…</Loading> : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-subtle">
            {DAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day) => {
              const key = ymd(day);
              const items = byDay[key] || [];
              const inMonth = day.getMonth() === month.getMonth();
              return (
                <div key={key} className={`min-h-[104px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-subtle/60'}`}>
                  <span className={`mb-1 inline-grid h-6 min-w-[24px] place-items-center rounded-full px-1 text-xs ${key === today ? 'bg-accent font-bold text-accent-fg' : inMonth ? 'text-ink' : 'text-muted'}`}>{day.getDate()}</span>
                  <div className="flex flex-col gap-1">
                    {items.slice(0, 3).map((t) => (
                      <button key={t.id} type="button" onClick={() => navigate(`/dashboard?task=${t.id}`)} title={`${t.title}${t.assigned_to_name ? ` · ${t.assigned_to_name}` : ''}`}
                        className={`truncate rounded border border-line border-l-[3px] bg-surface px-1.5 py-0.5 text-left text-[11px] font-medium hover:bg-subtle ${PRIORITY_BAR[t.priority] || 'border-l-muted'} ${t.status === 'DONE' ? 'text-muted line-through' : ''}`}>
                        {t.title}
                      </button>
                    ))}
                    {items.length > 3 && <span className="px-1 text-[11px] font-semibold text-muted">+{items.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
