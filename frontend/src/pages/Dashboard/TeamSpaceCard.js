import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { buttonClass } from '../../ui';
import { SpaceAvatar } from '../../components/shell/spaces';
import UserAvatar from '../../components/account/UserAvatar';
import PersonHoverCard from '../../components/people/PersonHoverCard';

const OPEN = ['TODO', 'IN_PROGRESS', 'PENDING'];
const SEGMENTS = [['todo', 'To do', 'bg-muted'], ['inProgress', 'In progress', 'bg-info'], ['pending', 'Pending', 'bg-warn'], ['done', 'Done', 'bg-accent']];
const BATCH = 12; // people drawn at a time; more come in as the row is scrolled
const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
const firstName = (name) => String(name || '').split(' ')[0] || name;

function Arrow({ dir, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={dir < 0 ? 'Earlier people' : 'More people'}
      className={`absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-ink ${dir < 0 ? '-left-3' : '-right-3'}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  );
}

function Tile({ label, value, tone = '', active, onClick, hint }) {
  const body = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</span>
    </>
  );
  if (!onClick) return <div className="flex flex-col gap-0.5 rounded-md border border-line px-3 py-2" title={hint}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={hint}
      className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition ${active ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50 hover:bg-subtle'}`}>
      {body}
    </button>
  );
}

// Dashboard, one team at a time: where its work stands and who is doing what, like the top of its space.
// The numbers and people are buttons that filter the task list below.
export default function TeamSpaceCard({ team, stats, members, filters, meId = null }) {
  const { focusMode, setFocusMode, filterStatus, setFilterStatus, filterAssignee, setFilterAssignee } = filters;
  const [week, setWeek] = useState(null);
  const [count, setCount] = useState(BATCH);
  const [edges, setEdges] = useState({ left: false, right: false });
  const row = useRef(null);
  useEffect(() => { setCount(BATCH); row.current?.scrollTo?.({ left: 0 }); }, [team.id]);
  useEffect(() => {
    let alive = true;
    setWeek(null);
    Promise.resolve().then(() => api.get(`/teams/${team.id}/summary`)).then((r) => { if (alive) setWeek(r.data?.counts || null); }).catch(() => {});
    return () => { alive = false; };
  }, [team.id]);

  // Busiest first: who has late work, then who has the most open.
  const people = useMemo(() => [...members].sort((a, b) => Number(b.overdue_tasks || 0) - Number(a.overdue_tasks || 0)
    || Number(b.current_tasks || 0) - Number(a.current_tasks || 0) || String(a.name).localeCompare(String(b.name))), [members]);
  const shown = people.slice(0, count);
  // Near the end of the row (or when the row is not full yet), draw the next people.
  const check = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 160;
    if (nearEnd && count < people.length) setCount((n) => Math.min(n + BATCH, people.length));
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 || count < people.length });
  }, [count, people.length]);
  useEffect(() => {
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [check]);
  const slide = (dir) => { const el = row.current; if (el) el.scrollBy?.({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' }); };
  const picked = filterAssignee.length === 1 ? people.find((p) => String(p.id) === String(filterAssignee[0])) : null;

  const showOpen = same(filterStatus, OPEN) && !focusMode;
  const showMoving = same(filterStatus, ['IN_PROGRESS']) && !focusMode;
  const showLate = focusMode === 'OVERDUE';
  const pickStatus = (statuses, on) => { setFocusMode(''); setFilterStatus(on ? [] : statuses); };
  const pickLate = () => { setFilterStatus([]); setFocusMode(showLate ? '' : 'OVERDUE'); };
  const pickPerson = (person) => setFilterAssignee(picked && String(picked.id) === String(person.id) ? [] : [String(person.id)]);
  const total = SEGMENTS.reduce((sum, [key]) => sum + Number(stats[key] || 0), 0);

  return (
    <section aria-label={`${team.name} at a glance`} className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <SpaceAvatar team={team} size="h-9 w-9 text-xs" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{team.name}</h2>
          <p className="text-xs text-muted">{members.length} {members.length === 1 ? 'person' : 'people'} · {stats.total} tasks in all</p>
        </div>
        <div className="hidden -space-x-2 sm:flex" aria-hidden="true">
          {people.slice(0, 5).map((m) => <span key={m.id} className="rounded-full border-2 border-surface"><UserAvatar name={m.name} src={m.avatar} size="h-7 w-7 text-[10px]" /></span>)}
          {people.length > 5 && <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-subtle text-[11px] font-semibold text-muted">+{people.length - 5}</span>}
        </div>
        <Link to={`/spaces/${team.id}`} className={buttonClass('secondary', 'sm')}>Open space</Link>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          <Tile label="Open" value={stats.open} active={showOpen} onClick={() => pickStatus(OPEN, showOpen)} hint="Show open tasks" />
          <Tile label="In progress" value={stats.inProgress} active={showMoving} onClick={() => pickStatus(['IN_PROGRESS'], showMoving)} hint="Show tasks in progress" />
          <Tile label="Overdue" value={stats.overdue} tone={stats.overdue ? 'text-danger' : ''} active={showLate} onClick={pickLate} hint="Show overdue tasks" />
          <Tile label="Due in 7 days" value={week ? week.due_7d ?? 0 : '–'} hint="Open tasks due in the next 7 days" />
          <Tile label="Done in 7 days" value={week ? week.done_7d ?? 0 : '–'} tone="text-accent" hint="Tasks finished in the last 7 days" />
        </div>
        {total > 0 && (
          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-subtle" role="img" aria-label={SEGMENTS.map(([key, label]) => `${label} ${stats[key] || 0}`).join(', ')}>
              {SEGMENTS.map(([key, label, color]) => (stats[key] ? <span key={key} title={`${label}: ${stats[key]}`} className={`${color} h-full border-r-2 border-surface last:border-r-0`} style={{ width: `${(stats[key] / total) * 100}%` }} /> : null))}
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {SEGMENTS.map(([key, label, color]) => <span key={key} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label} {stats[key] || 0}</span>)}
            </p>
          </div>
        )}
      </div>

      {people.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Who is working on what</h3>
            {picked
              ? <p className="text-sm">Showing <span className="font-semibold">{picked.name}</span>’s work. <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setFilterAssignee([])}>Show everyone</button></p>
              : <p className="text-xs text-muted">Click a person to see their work below. Rest on a face for details or to set up a meeting.</p>}
          </div>
          <div className="relative">
            <ul ref={row} onScroll={check} aria-label="Team members" className="flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:thin]">
              {shown.map((person) => {
                const active = picked && String(picked.id) === String(person.id);
                const late = Number(person.overdue_tasks || 0);
                return (
                  <li key={person.id} className="shrink-0 snap-start">
                    <PersonHoverCard person={person} canMeet={String(person.id) !== String(meId)}
                      actions={[{ label: active ? 'Show everyone’s work' : `See ${firstName(person.name)}’s work`, run: () => pickPerson(person) }]}>
                    <button type="button" onClick={() => pickPerson(person)} aria-pressed={Boolean(active)} title={`Show ${person.name}’s work`}
                      className={`flex w-[104px] flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition ${active ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50 hover:bg-subtle'}`}>
                      <UserAvatar name={person.name} src={person.avatar} size="h-10 w-10 text-sm" />
                      <span className="w-full truncate text-sm font-medium">{firstName(person.name)}</span>
                      <span className="text-xs text-muted">{Number(person.current_tasks || 0)} open</span>
                      {late > 0 && <span className="text-xs font-semibold text-danger">{late} late</span>}
                    </button>
                    </PersonHoverCard>
                  </li>
                );
              })}
            </ul>
            {edges.left && <Arrow dir={-1} onClick={() => slide(-1)} />}
            {edges.right && <Arrow dir={1} onClick={() => slide(1)} />}
          </div>
        </div>
      )}
    </section>
  );
}
