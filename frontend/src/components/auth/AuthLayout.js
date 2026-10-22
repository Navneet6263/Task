import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../BrandLogo';
import useTheme from '../../theme/useTheme';
import { MoonIcon, SunIcon } from '../shell/icons';
import AuthShowcase from './AuthShowcase';

// Shared frame for sign-in, sign-up and password pages: form on the left, brand panel on the right.
// Heights divide by 0.9 because the body is zoomed to 90%.
export default function AuthLayout({ variant = 'workspace', topAction, wide = false, children }) {
  const { resolved, toggle } = useTheme();
  return (
    <div className="min-h-[calc(100vh/0.9)] bg-canvas text-ink lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="flex min-h-[calc(100vh/0.9)] flex-col px-5 py-5 sm:px-10">
        <header className="flex items-center gap-3">
          <Link to="/login" aria-label="GreenTask sign in" className="rounded-md"><BrandLogo large /></Link>
          <div className="ml-auto flex items-center gap-2">
            {topAction}
            <button type="button" onClick={toggle} aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:bg-subtle hover:text-ink">
              {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>
        <main className={`mx-auto flex w-full flex-1 flex-col justify-center py-10 ${wide ? 'max-w-[640px]' : 'max-w-[420px]'}`}>{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>© {new Date().getFullYear()} GreenTask</span>
          <span>Tasks, time tracking and teamwork in one place</span>
        </footer>
      </div>
      <AuthShowcase variant={variant} />
    </div>
  );
}

export function TopLink({ to, children }) {
  return <Link to={to} className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-subtle hover:text-ink sm:inline-flex">{children}</Link>;
}
