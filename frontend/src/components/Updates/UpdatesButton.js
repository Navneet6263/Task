import React, { useEffect, useState } from 'react';
import { updatesApi } from './updatesApi';
import './Updates.css';

export default function UpdatesButton() {
  const [counts, setCounts] = useState({ unread: 0, reports: 0 });
  useEffect(() => {
    let controller;
    const refresh = () => {
      if (document.hidden) return;
      controller?.abort(); controller = new AbortController();
      const current = controller;
      updatesApi.summary(current.signal).then(({ data }) => {
        if (!current.signal.aborted) setCounts(data);
      }).catch(() => {}); // The dialog offers a visible error and retry if the API is unavailable.
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
  return <>
    <a className="updates-trigger" href="/updates" target="_blank" rel="noopener noreferrer"
      title="Product updates — opens in a new tab" aria-label="Updates (opens in a new tab)">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z" />
      </svg>
      Updates
      {counts.unread > 0 && <span className="updates-count" aria-label={`${counts.unread} unread updates`}>{counts.unread > 99 ? '99+' : counts.unread}</span>}
      {counts.reports > 0 && <span className="updates-report-count">{counts.reports} reports</span>}
    </a>
  </>;
}
