import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Chip } from '../../ui';
import UserAvatar from '../account/UserAvatar';
import MeetingModal from './MeetingModal';

const OPEN_DELAY = 350;
const CLOSE_DELAY = 200;
const WIDTH = 288;

// Wraps a person's face. Resting the pointer on it (or tabbing to it) shows a small card: who they are,
// what they are carrying, and quick actions. Drawn above the page so a scrolling row never cuts it off.
//   actions: [{ label, run }] extra buttons (like "See their work"); canMeet: show "Schedule a meeting"
export default function PersonHoverCard({ person, actions = [], canMeet = true, children }) {
  const anchor = useRef(null);
  const timer = useRef(null);
  const [place, setPlace] = useState(null);
  const [meeting, setMeeting] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);
  // Only the face itself opens the card: events from the card or the meeting window (drawn elsewhere on the page) do not.
  const show = (e) => {
    if (meeting || (e?.target && !anchor.current?.contains(e.target))) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, r.left + r.width / 2 - WIDTH / 2));
      const below = r.bottom + 8;
      setPlace(below + 240 > window.innerHeight && r.top > 260 ? { left, bottom: window.innerHeight - r.top + 8 } : { left, top: below });
    }, OPEN_DELAY);
  };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setPlace(null), CLOSE_DELAY); };
  const stay = () => clearTimeout(timer.current);
  const first = String(person.name || '').split(' ')[0] || person.name;
  const open = Number(person.current_tasks || 0);
  const late = Number(person.overdue_tasks || 0);
  const done = person.done_30d === undefined ? null : Number(person.done_30d || 0);

  return (
    <>
    <span ref={anchor} className="inline-block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={(e) => { if (e.key === 'Escape') setPlace(null); }}>
      {children}
      {place && createPortal(
        <div role="dialog" aria-label={`About ${person.name}`} onMouseEnter={stay} onMouseLeave={hide}
          className="fixed z-[120] flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-left shadow-pop" style={{ width: WIDTH, ...place }}>
          <div className="flex items-center gap-3">
            <UserAvatar name={person.name} src={person.avatar} size="h-12 w-12 text-base" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{person.name}</p>
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                {person.is_reporting_manager ? <Chip tone="ok">Team leader</Chip> : null}
                <span className="truncate">{person.team_role || person.designation || 'Member'}</span>
              </p>
            </div>
          </div>
          {person.email && !/@no-email\.invalid$/i.test(person.email) && (
            <a href={`mailto:${person.email}`} className="truncate text-sm text-accent hover:underline">{person.email}</a>
          )}
          <dl className="grid grid-cols-3 rounded-md border border-line text-center">
            {[['Open', open, ''], ['Late', late, late ? 'text-danger' : ''], ['Done 30 d', done ?? '–', 'text-accent']].map(([label, value, tone]) => (
              <div key={label} className="border-r border-line px-1 py-1.5 last:border-r-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
                <dd className={`text-base font-semibold tabular-nums ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2">
            {actions.map((a) => <Button key={a.label} size="sm" onClick={() => { setPlace(null); a.run(); }}>{a.label}</Button>)}
            {canMeet && <Button size="sm" variant="primary" onClick={() => { setPlace(null); setMeeting(true); }}>Schedule a meeting with {first}</Button>}
          </div>
        </div>,
        document.body,
      )}
    </span>
    {meeting && <MeetingModal person={person} onClose={() => setMeeting(false)} />}
    </>
  );
}
