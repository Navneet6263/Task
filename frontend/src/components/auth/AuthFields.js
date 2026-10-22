import React, { useState } from 'react';
import { inputClass } from '../../ui';

const PATHS = {
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  badge: 'M3 6h18v12H3zM7 10h4M7 14h6M15 10h2',
  hash: 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16',
  building: 'M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M16 9h3a1 1 0 0 1 1 1v11M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1M3 21h18',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  key: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 10v11M12 15h3M12 18h2',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
};

export function AuthIcon({ name, size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

const fieldId = (label) => `auth-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const box = `${inputClass} h-11 rounded-lg transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20`;

function Frame({ label, id, icon, hint, right, className = '', children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>{right}
      </div>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AuthIcon name={icon} /></span>}
        {children}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Text input with a label, optional leading icon and hint.
export function AuthInput({ label, icon, hint, right, className, id, ...props }) {
  const inputId = id || fieldId(label);
  return (
    <Frame label={label} id={inputId} icon={icon} hint={hint} right={right} className={className}>
      <input id={inputId} className={`${box} ${icon ? 'pl-9' : ''}`} {...props} />
    </Frame>
  );
}

export function AuthSelect({ label, icon, hint, className, children, id, ...props }) {
  const inputId = id || fieldId(label);
  return (
    <Frame label={label} id={inputId} icon={icon} hint={hint} className={className}>
      <select id={inputId} className={`${box} ${icon ? 'pl-9' : ''}`} {...props}>{children}</select>
    </Frame>
  );
}

export function AuthTextarea({ label, hint, className, id, ...props }) {
  const inputId = id || fieldId(label);
  return (
    <Frame label={label} id={inputId} hint={hint} className={className}>
      <textarea id={inputId} className={`${inputClass} min-h-[88px] resize-y rounded-lg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20`} {...props} />
    </Frame>
  );
}

export const passwordScore = (value) => [value.length >= 8, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
const LEVELS = [['Too weak', 'bg-danger', 'text-danger'], ['Weak', 'bg-danger', 'text-danger'], ['Fair', 'bg-warn', 'text-warn'], ['Good', 'bg-info', 'text-info'], ['Strong', 'bg-accent', 'text-accent']];

export function StrengthMeter({ value }) {
  const score = passwordScore(value);
  const [text, bar, tone] = LEVELS[score];
  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((step) => <span key={step} className={`h-1 rounded-full ${score >= step ? bar : 'bg-line'}`} />)}
      </div>
      <span className={`w-16 text-right text-xs font-semibold ${tone}`}>{text}</span>
    </div>
  );
}

// Password input with show/hide and an optional strength meter.
export function PasswordInput({ label = 'Password', right, hint, strength = false, className, id, value, ...props }) {
  const [show, setShow] = useState(false);
  const inputId = id || fieldId(label);
  return (
    <div className={className}>
      <Frame label={label} id={inputId} icon="lock" right={right} hint={hint}>
        <input id={inputId} type={show ? 'text' : 'password'} value={value} className={`${box} pl-9 pr-16`} {...props} />
        <button type="button" onClick={() => setShow((prev) => !prev)} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-xs font-semibold text-muted hover:bg-subtle hover:text-ink">
          {show ? 'Hide' : 'Show'}
        </button>
      </Frame>
      {strength && value && <StrengthMeter value={value} />}
    </div>
  );
}

export function AuthAlert({ tone = 'danger', children }) {
  if (!children) return null;
  const tones = { danger: 'border-danger/30 bg-danger-soft text-danger', ok: 'border-accent/30 bg-accent-soft text-accent', info: 'border-info/30 bg-info-soft text-info' };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${tones[tone]}`}>
      <AuthIcon name={tone === 'danger' ? 'alert' : 'check'} className="mt-0.5 shrink-0" /><span className="min-w-0 text-ink">{children}</span>
    </div>
  );
}

export function SubmitButton({ busy = false, busyText, children, className = '', disabled = false, ...props }) {
  return (
    <button type="submit" {...props} disabled={busy || disabled}
      className={`group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70 ${className}`}>
      {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />{busyText || children}</>
        : <>{children}<AuthIcon name="arrow" className="transition group-hover:translate-x-0.5" /></>}
    </button>
  );
}

export function AuthHeading({ eyebrow, title, children }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>}
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
      {children && <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function TextLink({ children, ...props }) {
  return <button type="button" className="text-sm font-semibold text-accent hover:underline" {...props}>{children}</button>;
}
