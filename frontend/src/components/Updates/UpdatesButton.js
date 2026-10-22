import React, { useEffect, useState } from 'react';
import { ExternalIcon } from '../shell/icons';
import { updatesApi } from './updatesApi';

// Link that opens the Product updates page in a new tab, with the unread count.
export default function UpdatesButton({ label = 'Open updates' }) {
  const [counts, setCounts] = useState({ unread: 0, reports: 0 });
  useEffect(() => {
    let controller;
    const refresh = () => {
      if (document.hidden) return;
      controller?.abort(); controller = new AbortController();
      const current = controller;
      updatesApi.summary(current.signal).then(({ data }) => {
        if (!current.signal.aborted) setCounts(data);
      }).catch(() => {}); // The updates page shows a visible error and retry if the API is unavailable.
    };
    const start = setTimeout(refresh, 0), interval = setInterval(refresh, 60000);
    window.addEventListener('workspace-updates-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(start); clearInterval(interval); controller?.abort();
      window.removeEventListener('workspace-updates-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return (
    <a className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-fg hover:brightness-110"
      href="/updates" target="_blank" rel="noopener noreferrer"
      title="Product updates — opens in a new tab" aria-label="Product updates (opens in a new tab)">
      {label}
      {counts.unread > 0 && <span className="rounded-full bg-accent-fg/20 px-1.5 text-[11px] font-bold leading-[18px]" aria-label={`${counts.unread} unread updates`}>{counts.unread > 99 ? '99+' : counts.unread}</span>}
      <ExternalIcon />
    </a>
  );
}
