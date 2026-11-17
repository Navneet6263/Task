import React, { useEffect, useState } from 'react';
import { Input } from '../../../ui';

// Time spent as hours + minutes, so 20 minutes is easy to enter. The form still gets decimal hours
// rounded to 2 places (what the server stores): 1 h 30 min → "1.5", 20 min → "0.33".
export const toHours = (h, m) => {
  const total = (Number(h) || 0) + (Number(m) || 0) / 60;
  return total > 0 ? String(Math.round(total * 100) / 100) : '';
};
export const splitHours = (value) => {
  const n = Number(value);
  if (!value || !(n > 0)) return { h: '', m: '' };
  let h = Math.floor(n);
  let m = Math.round((n - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return { h: String(h), m: m ? String(m) : '' };
};

export default function HoursInput({ id, value, onChange, label = 'Hours' }) {
  const [parts, setParts] = useState(() => splitHours(value));
  // Follow the form when it is reset or filled from outside; while typing the two boxes stay as written.
  useEffect(() => {
    setParts((prev) => (toHours(prev.h, prev.m) === String(value || '') ? prev : splitHours(value)));
  }, [value]);
  const change = (key, digits) => (event) => {
    const next = { ...parts, [key]: event.target.value.replace(/\D/g, '').slice(0, digits) };
    setParts(next);
    onChange(toHours(next.h, next.m));
  };
  const box = 'w-[72px] text-right font-mono tabular-nums';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex items-center gap-1.5">
        <Input id={id} aria-label={`${label}: hours`} inputMode="numeric" placeholder="0" className={box} value={parts.h} onChange={change('h', 2)} />
        <span className="text-sm text-muted">h</span>
      </label>
      <label className="flex items-center gap-1.5">
        <Input aria-label={`${label}: minutes`} inputMode="numeric" placeholder="0" className={box} value={parts.m} onChange={change('m', 3)} />
        <span className="text-sm text-muted">min</span>
      </label>
    </div>
  );
}
