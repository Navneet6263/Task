import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import ToastHost from './ToastHost';
import useLayout from './useLayout';
import useHeaderOffset from './useHeaderOffset';
import Topbar from './shell/Topbar';
import Sidebar from './shell/Sidebar';
import QuickChat from './chat/QuickChat';
import NotesPanel from './notes/NotesPanel';
import ScreenShare from './screenShare/ScreenShare';
import EmailReminder from './account/EmailReminder';
import CommandPalette from './shell/CommandPalette';
import WorkTypePicker from './shell/WorkTypePicker';
import { useTaskMeta } from './taskExtras/taskExtrasStore';

// Screens already rebuilt on the shared UI kit. Every other screen renders inside a
// light island so it stays readable in dark mode until it is redesigned.
const REDESIGNED_ROUTES = ['/spaces', '/bulk-upload', '/timesheet', '/dashboard', '/calendar', '/my-tasks', '/reports', '/settings', '/team', '/communications', '/admin', '/audit-logs', '/pms-hub'];

const Layout = () => {
  const headerRef = useHeaderOffset();
  const shell = useLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    wsRef, socketVersion, sidebarOpen, setSidebarOpen, sidebarCollapsed,
    teamChatOpen, setTeamChatOpen, setChatUnreadCount, navGroups, closeTransientUi, toggleSidebarCollapsed,
  } = shell;
  const redesigned = REDESIGNED_ROUTES.some((route) => pathname.startsWith(route));
  // One side panel at a time: quick chat, notes, or the screen-share room.
  const [panel, setPanel] = useState(null);
  const [sharePreset, setSharePreset] = useState(null);
  const togglePanel = (name) => {
    const next = panel === name ? null : name;
    setPanel(next);
    setTeamChatOpen(next === 'screen');
  };
  const shareWith = (preset) => { setSharePreset({ ...preset, at: Date.now() }); setPanel('screen'); setTeamChatOpen(true); };

  // Search anywhere (Ctrl+K) and create a task from any page (C), like Jira.
  // Create opens the one full Create task form: in the open space, else on the Dashboard.
  const [searching, setSearching] = useState(false);
  const openCreate = useCallback(() => {
    setSearching(false);
    const space = pathname.match(/^\/spaces\/[^/]+/);
    navigate(space ? `${space[0]}?create=1` : '/dashboard?create=1');
  }, [pathname, navigate]);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching(true); }
      else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'c' && !document.querySelector('[role="dialog"]')) { e.preventDefault(); openCreate(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCreate]);
  // Admins are asked once what kind of work the company does (skippable).
  const meta = useTaskMeta();
  const [askedWork, setAskedWork] = useState(false);
  const isAdminUser = ['admin', 'company_admin'].includes(shell.resolvedRole);
  const askWorkType = isAdminUser && meta.ask_work_type === true && !askedWork;

  return (
    <div className={`shell-root min-h-screen bg-canvas text-ink ${sidebarCollapsed ? 'shell-sidebar-collapsed' : ''}`}>
      <ToastHost />
      <Topbar ref={headerRef} shell={shell} panel={teamChatOpen ? 'screen' : panel} onPanel={togglePanel} onSearch={() => setSearching(true)} onCreate={openCreate} />
      {sidebarOpen && (
        <button type="button" aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-black/40 lg:hidden" />
      )}
      <Sidebar
        navGroups={navGroups} open={sidebarOpen} collapsed={sidebarCollapsed}
        onNavigate={() => setSidebarOpen(false)} onToggleCollapsed={toggleSidebarCollapsed}
      />
      <div className={`shell-main transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'}`}>
        <main className="shell-content min-w-0 px-4 py-5 sm:px-6" onClick={closeTransientUi}>
          <EmailReminder />
          {redesigned ? <Outlet /> : <div className="theme-light min-h-[60vh] rounded-xl bg-canvas text-ink"><Outlet /></div>}
        </main>
      </div>
      <QuickChat open={panel === 'chat'} onClose={() => setPanel(null)} wsRef={wsRef} socketVersion={socketVersion} onUnreadChange={setChatUnreadCount} onShareScreen={shareWith} />
      <NotesPanel open={panel === 'notes'} onClose={() => setPanel(null)} />
      {searching && <CommandPalette navGroups={navGroups} onClose={() => setSearching(false)} onCreate={openCreate} />}
      {askWorkType && <WorkTypePicker onDone={() => setAskedWork(true)} />}
      <ScreenShare open={teamChatOpen} preset={sharePreset} wsRef={wsRef} socketVersion={socketVersion}
        onOpen={() => { setPanel('screen'); setTeamChatOpen(true); }} onClose={() => { setTeamChatOpen(false); setPanel(null); }} />
    </div>
  );
};
export default Layout;
