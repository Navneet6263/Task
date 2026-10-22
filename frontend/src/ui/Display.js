import React from 'react';

const CHIP_TONES = {
  ok: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-subtle text-muted',
};

export function Chip({ tone = 'neutral', children }) {
  return <span className={`mr-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_TONES[tone]}`}>{children}</span>;
}

const BANNER_TONES = {
  ok: 'bg-accent-soft', warn: 'bg-warn-soft', info: 'bg-info-soft', danger: 'bg-danger-soft', neutral: 'bg-subtle',
};

export function Banner({ tone = 'neutral', action, children }) {
  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-3.5 py-2.5 text-sm text-ink ${BANNER_TONES[tone]}`}>
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  );
}

export function Card({ className = '', children }) {
  return <section className={`rounded-lg border border-line bg-surface ${className}`}>{children}</section>;
}

export function CardHeader({ title, aside }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}

export function StatTile({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ children = 'Loading...' }) {
  return <p role="status" className="py-6 text-sm text-muted">{children}</p>;
}

export function ErrorText({ children, onRetry }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}{onRetry && <> <button type="button" className="font-medium underline" onClick={onRetry}>Retry</button></>}
    </p>
  );
}
