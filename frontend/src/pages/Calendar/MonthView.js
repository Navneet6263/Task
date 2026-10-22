import React from 'react';
import { toKey, todayKey } from './dates';
import { byStart, onDay } from './items';
import ItemChip from './ItemChip';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

export default function MonthView({ days, cursor, items, onCreate, onOpen, onShowDay }) {
  const today = todayKey();
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((day) => <div key={day} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = toKey(day);
          const dayItems = items.filter((item) => onDay(item, key)).sort(byStart);
          const outside = day.getMonth() !== cursor.getMonth();
          const isToday = key === today;
          return (
            <div key={key} role="button" tabIndex={0} aria-label={`Create on ${day.toDateString()}`}
              onClick={() => onCreate(key)} onKeyDown={(event) => { if (event.key === 'Enter') onCreate(key); }}
              className={`flex min-h-[112px] min-w-0 cursor-pointer flex-col gap-0.5 border-b border-r border-line p-1 hover:bg-accent-soft/40 focus:bg-subtle focus:outline-none [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 ${outside ? 'bg-canvas/70' : day.getDay() === 0 || day.getDay() === 6 ? 'bg-subtle/40' : ''}`}>
              <button type="button" onClick={(event) => { event.stopPropagation(); onShowDay(day); }}
                className={`mx-auto mb-0.5 grid h-6 min-w-[24px] place-items-center rounded-full px-1 text-xs font-semibold
                  ${isToday ? 'bg-accent text-accent-fg' : outside ? 'text-muted/60 hover:bg-subtle' : 'text-ink hover:bg-subtle'}`}>
                {day.getDate() === 1 ? day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : day.getDate()}
              </button>
              {dayItems.slice(0, MAX_VISIBLE).map((item) => <ItemChip key={item.key} item={item} onOpen={onOpen} />)}
              {dayItems.length > MAX_VISIBLE && (
                <button type="button" onClick={(event) => { event.stopPropagation(); onShowDay(day); }}
                  className="rounded px-1.5 text-left text-xs font-semibold text-muted hover:bg-subtle hover:text-ink">
                  +{dayItems.length - MAX_VISIBLE} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
