import React from 'react';
import BrandLogo from '../../components/BrandLogo';
import { MoonIcon, SunIcon, LogoutIcon } from '../../components/shell/icons';
import useTheme from '../../theme/useTheme';
import { CountBadge } from '../../ui';
import { initials, timeAgo } from './consoleUtils';

const PATHS = {
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  companies: 'M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M16 9h3a1 1 0 0 1 1 1v11M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1M3 21h18',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  access: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
};
export const ConsoleIcon = ({ name, size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={PATHS[name]} /></svg>
);

export const SECTIONS = [
  ['overview', 'Overview', 'Platform health at a glance'],
  ['companies', 'Companies', 'Approve, limit and manage company accounts'],
  ['activity', 'Activity', 'Everything platform admins have done'],
  ['access', 'Admin access', 'Who can sign in to this console'],
];

// Left navigation on desktop, a scrolling tab row on small screens.
export function ConsoleNav({ section, onGo, me, isMaster, pending, onSignOut }) {
  const items = SECTIONS.filter(([key]) => key !== 'access' || isMaster);
  const link = ([key, label]) => {
    const active = section === key;
    return (
      <button key={key} type="button" onClick={() => onGo(key)} aria-current={active ? 'page' : undefined}
        className={`group relative flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${active ? 'bg-accent-soft font-semibold text-ink' : 'font-medium text-muted hover:bg-subtle hover:text-ink'}`}>
        <span className={`absolute left-0 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300 lg:block ${active ? 'opacity-100' : 'scale-y-0 opacity-0'}`} />
        <ConsoleIcon name={key} className={active ? 'text-accent' : ''} />{label}
        {key === 'companies' && pending > 0 && <span className="ml-auto"><CountBadge count={pending} tone="danger" /></span>}
      </button>
    );
  };
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <BrandLogo />
          <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-canvas">Console</span>
        </div>
        <nav aria-label="Console" className="flex flex-1 flex-col gap-0.5 px-3 py-4">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Manage</p>
          {items.map(link)}
        </nav>
        <div className="m-3 rounded-xl border border-line bg-canvas p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">{initials(me.name || me.email)}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{me.name || 'Platform admin'}</span>
              <span className="block truncate text-xs text-muted">{me.email}</span>
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isMaster ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>{isMaster ? 'Master access' : 'Delegated access'}</span>
            <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-danger"><LogoutIcon />Sign out</button>
          </div>
        </div>
      </aside>
      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 px-4 pt-3"><BrandLogo compact /><span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase text-canvas">Console</span>
          <button type="button" onClick={onSignOut} className="ml-auto text-xs font-medium text-muted hover:text-danger">Sign out</button></div>
        <nav aria-label="Console" className="flex gap-1 overflow-x-auto px-3 py-2">{items.map(link)}</nav>
      </div>
    </>
  );
}

// Page title row with refresh, theme and page-specific actions.
export function ConsoleTopbar({ section, refreshing, lastLoaded, onRefresh, actions }) {
  const { resolved, toggle } = useTheme();
  const [, title, subtitle] = SECTIONS.find(([key]) => key === section) || SECTIONS[0];
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface/80 px-4 py-4 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">{subtitle}{lastLoaded && <span className="hidden sm:inline"> · Updated {timeAgo(lastLoaded)}</span>}</p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button type="button" onClick={onRefresh} disabled={refreshing} title="Refresh data"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:border-muted disabled:opacity-60">
          <ConsoleIcon name="refresh" className={refreshing ? 'animate-spin' : ''} /><span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <button type="button" onClick={toggle} aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink">{resolved === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
      </div>
    </header>
  );
}
