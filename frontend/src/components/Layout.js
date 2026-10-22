import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ToastHost from './ToastHost';
import useLayout from './useLayout';
import useHeaderOffset from './useHeaderOffset';
import Topbar from './shell/Topbar';
import Sidebar from './shell/Sidebar';
import QuickChat from './chat/QuickChat';
import NotesPanel from './notes/NotesPanel';
import ScreenShare from './screenShare/ScreenShare';

// Screens already rebuilt on the shared UI kit. Every other screen renders inside a
// light island so it stays readable in dark mode until it is redesigned.
const REDESIGNED_ROUTES = ['/timesheet', '/dashboard', '/calendar', '/my-tasks', '/reports', '/settings', '/team', '/communications', '/admin', '/audit-logs', '/pms-hub'];

const Layout = () => {
  const headerRef = useHeaderOffset();
  const shell = useLayout();
  const { pathname } = useLocation();
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

  return (
    <div className={`shell-root min-h-screen bg-canvas text-ink ${sidebarCollapsed ? 'shell-sidebar-collapsed' : ''}`}>
      <ToastHost />
      <Topbar ref={headerRef} shell={shell} panel={teamChatOpen ? 'screen' : panel} onPanel={togglePanel} />
      {sidebarOpen && (
        <button type="button" aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-black/40 lg:hidden" />
      )}
      <Sidebar
        navGroups={navGroups} open={sidebarOpen} collapsed={sidebarCollapsed}
        onNavigate={() => setSidebarOpen(false)} onToggleCollapsed={toggleSidebarCollapsed}
      />
      <div className={`shell-main transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'}`}>
        <main className="shell-content min-w-0 px-4 py-5 sm:px-6" onClick={closeTransientUi}>
          {redesigned ? <Outlet /> : <div className="theme-light min-h-[60vh] rounded-xl bg-canvas text-ink"><Outlet /></div>}
        </main>
      </div>
      <QuickChat open={panel === 'chat'} onClose={() => setPanel(null)} wsRef={wsRef} socketVersion={socketVersion} onUnreadChange={setChatUnreadCount} onShareScreen={shareWith} />
      <NotesPanel open={panel === 'notes'} onClose={() => setPanel(null)} />
      <ScreenShare open={teamChatOpen} preset={sharePreset} wsRef={wsRef} socketVersion={socketVersion}
        onOpen={() => { setPanel('screen'); setTeamChatOpen(true); }} onClose={() => { setTeamChatOpen(false); setPanel(null); }} />
    </div>
  );
};
export default Layout;
