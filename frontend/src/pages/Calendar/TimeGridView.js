import React, { useEffect, useRef, useState } from 'react';
import { hourLabel, minutesOf, pad, timeLabel, toKey, todayKey } from './dates';
import { byStart, onDay, toneOf } from './items';
import ItemChip from './ItemChip';

const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Greedy lane layout so overlapping events sit side by side.
function layout(dayItems, dayKey) {
  const placed = dayItems.map((item) => {
    const start = item.start.slice(0, 10) < dayKey ? 0 : minutesOf(item.start);
    const end = item.end.slice(0, 10) > dayKey ? 1440 : Math.max(start + 20, minutesOf(item.end));
    return { item, start, end };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const lanes = [];
  placed.forEach((entry) => {
    let lane = lanes.findIndex((laneEnd) => laneEnd <= entry.start);
    if (lane === -1) { lane = lanes.length; lanes.push(entry.end); } else lanes[lane] = entry.end;
    entry.lane = lane;
  });
  return placed.map((entry) => ({ ...entry, lanes: lanes.length || 1 }));
}

function useNowMinutes() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  return now.getHours() * 60 + now.getMinutes();
}

export default function TimeGridView({ days, items, onCreate, onOpen, onShowDay }) {
  const scrollRef = useRef(null);
  const nowMinutes = useNowMinutes();
  const today = todayKey();
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 7.5; }, []);
  const cols = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const keys = days.map(toKey);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid border-b border-line" style={cols}>
        <div />
        {days.map((day, index) => {
          const isToday = keys[index] === today;
          return (
            <button key={keys[index]} type="button" onClick={() => onShowDay(day)} className="flex flex-col items-center gap-0.5 py-2 hover:bg-subtle">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? 'text-accent' : 'text-muted'}`}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-lg font-semibold ${isToday ? 'bg-accent text-accent-fg' : ''}`}>{day.getDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="grid border-b border-line" style={cols}>
        <div className="py-1 pr-2 text-right text-[10px] text-muted">all-day</div>
        {keys.map((key) => (
          <div key={key} role="button" tabIndex={-1} onClick={() => onCreate(key)} className="flex min-h-[28px] min-w-0 cursor-pointer flex-col gap-0.5 border-l border-line p-0.5">
            {items.filter((item) => item.allDay && onDay(item, key)).sort(byStart).map((item) => <ItemChip key={item.key} item={item} onOpen={onOpen} />)}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ ...cols, height: HOUR_PX * 24 }}>
          <div className="relative">
            {HOURS.map((h) => <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: h * HOUR_PX }}>{hourLabel(h)}</span>)}
          </div>
          {keys.map((key) => (
            <div key={key} className="relative border-l border-line">
              {HOURS.map((h) => (
                <div key={h} role="button" tabIndex={-1} aria-label={`Create at ${hourLabel(h) || '12 AM'}`} onClick={() => onCreate(key, `${key}T${pad(h)}:00`)}
                  className="absolute inset-x-0 cursor-pointer border-t border-line/70 hover:bg-subtle/60" style={{ top: h * HOUR_PX, height: HOUR_PX }} />
              ))}
              {layout(items.filter((item) => !item.allDay && onDay(item, key)), key).map(({ item, start, end, lane, lanes }) => {
                const tone = toneOf(item);
                return (
                  <button key={item.key} type="button" onClick={() => onOpen(item)} title={item.title}
                    className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs shadow-sm hover:brightness-95 ${tone.block} ${item.declined ? 'opacity-60' : ''}`}
                    style={{ top: (start / 60) * HOUR_PX + 1, height: Math.max(20, ((end - start) / 60) * HOUR_PX - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}>
                    <span className={`block truncate font-semibold ${item.declined ? 'line-through' : ''}`}>{item.title}</span>
                    {end - start >= 45 && <span className="block truncate text-[10px] text-muted">{timeLabel(item.start)} – {timeLabel(item.end)}</span>}
                  </button>
                );
              })}
              {key === today && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMinutes / 60) * HOUR_PX }}>
                  <span className="-ml-1 h-2 w-2 rounded-full bg-danger" /><span className="h-px flex-1 bg-danger" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
