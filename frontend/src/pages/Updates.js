import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import UpdatesDialog from '../components/Updates/UpdatesDialog';
import { MoonIcon, SunIcon } from '../components/shell/icons';
import useTheme from '../theme/useTheme';
import { Button, buttonClass } from '../ui';

const TIPS = [
  ['Read the guide', 'Open any update to see why it helps and how to use it, step by step.'],
  ['Report a problem', 'If something does not work, send a private bug task to one person you choose.'],
  ['Track your reports', 'Reports assigned to you are under My private reports and in My Tasks.'],
];

// Product updates, opened in its own tab from Settings → What's new.
export default function UpdatesPage() {
  const { resolved, toggle } = useTheme();
  useEffect(() => {
    const previous = document.title; document.title = 'Product updates | GreenTask';
    const syncAccount = event => {
      if (!event.key || ['token', 'company_token', 'user', 'company_user', 'active_org_id'].includes(event.key)) window.location.reload();
    };
    window.addEventListener('storage', syncAccount);
    return () => { document.title = previous; window.removeEventListener('storage', syncAccount); };
  }, []);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <BrandLogo />
          <span className="hidden h-6 w-px bg-line sm:block" />
          <span className="hidden text-sm font-medium text-muted sm:block">Product updates</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
            </Button>
            <Link to="/dashboard" className={buttonClass('secondary', 'md', 'h-9')}>← Back to dashboard</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <UpdatesDialog fullPage />
        <aside className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-semibold">How this page works</p>
            <ol className="mt-3 flex flex-col gap-3">
              {TIPS.map(([title, text], index) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{index + 1}</span>
                  <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{text}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <p className="px-1 text-xs text-muted">Updates are written by GreenTask admins. Unread updates are highlighted until you open their guide.</p>
        </aside>
      </main>
    </div>
  );
}
