import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastHost from '../../components/ToastHost';
import { Loading } from '../../ui';
import useConsole from './useConsole';
import { readConsolePref, writeConsolePref } from './consoleUtils';
import { ConsoleIcon, ConsoleNav, ConsoleTopbar } from './ConsoleChrome';
import Overview from './overview/Overview';
import Companies from './companies/Companies';
import Activity from './Activity';
import Access from './Access';

// Platform admin console: approve companies, set limits and modules, and review admin activity.
export default function SuperAdminConsole() {
  const navigate = useNavigate();
  const signOut = useCallback(() => {
    localStorage.removeItem('sa_token'); localStorage.removeItem('sa_user');
    navigate('/login?mode=system-admin', { replace: true });
  }, [navigate]);
  const sa = useConsole({ onSignedOut: signOut });
  const [section, setSection] = useState(() => readConsolePref('section', 'overview'));
  const [focus, setFocus] = useState(null);
  const [customizing, setCustomizing] = useState(false);
  const current = section === 'access' && !sa.isMaster ? 'overview' : section;

  // `nextFocus` opens Companies on a status filter and, optionally, one company.
  const go = (next, nextFocus) => {
    setSection(next); writeConsolePref('section', next);
    if (nextFocus) setFocus({ ...nextFocus, at: Date.now() });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const actions = current === 'overview' && (
    <button type="button" onClick={() => setCustomizing(true)} aria-pressed={customizing}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110">
      <ConsoleIcon name="sliders" /><span className="hidden sm:inline">Customize</span>
    </button>
  );

  return (
    <div className="min-h-[calc(100vh/0.9)] bg-canvas text-ink lg:pl-64">
      <ToastHost />
      <ConsoleNav section={current} onGo={go} me={sa.me} isMaster={sa.isMaster} pending={sa.data.pending_count} onSignOut={signOut} />
      <ConsoleTopbar section={current} refreshing={sa.refreshing} lastLoaded={sa.lastLoaded} onRefresh={() => sa.reload()} actions={actions} />
      <main key={current} className="mx-auto w-full max-w-[1400px] px-4 py-6 motion-safe:animate-fade-up sm:px-6">
        {sa.loading ? <Loading>Loading the console…</Loading> : (
          <>
            {current === 'overview' && <Overview sa={sa} go={go} customizing={customizing} onCloseCustomize={() => setCustomizing(false)} />}
            {current === 'companies' && <Companies sa={sa} focus={focus} />}
            {current === 'activity' && <Activity sa={sa} />}
            {current === 'access' && <Access sa={sa} />}
          </>
        )}
      </main>
    </div>
  );
}
