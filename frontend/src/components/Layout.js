import React, { lazy, Suspense } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import GlobalSearch from './GlobalSearch';
import BrandLogo from './BrandLogo';
import UpdatesButton from './Updates/UpdatesButton';
import ToastHost from './ToastHost';
import useLayout from './useLayout';
import useHeaderOffset from './useHeaderOffset';
import { formatNotificationTime, MenuIcon, BellIcon, ChevronIcon } from './LayoutParts';
import './Layout.css';
const TeamChat = lazy(() => import('./TeamChat'));
const Layout = () => {
  const headerRef = useHeaderOffset();
  const { user, resolvedRole, wsRef, socketVersion, showNotif, setShowNotif, onlyUnread, setOnlyUnread, sidebarOpen, setSidebarOpen, sidebarCollapsed, chatLoaded, accessibleOrgs, activeOrgId, teamChatOpen, setTeamChatOpen, chatUnreadCount, setChatUnreadCount, unreadCount, handleMarkAllRead, openNotification, handleLogout, handleOrgSwitch, visibleNotifications, initials, formattedDate, navGroups, closeTransientUi, toggleSidebarCollapsed } = useLayout();
  return (
    <div className={`shell-root ${sidebarOpen ? 'shell-sidebar-open' : ''} ${sidebarCollapsed ? 'shell-sidebar-collapsed' : ''}`}>
      <ToastHost />
      <button
        type="button"
        className="shell-backdrop"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="shell-sidebar">
        <div className="shell-sidebar-body">
          {navGroups.map((group) => (
            <div key={group.label} className="shell-nav-group">
              <p className="shell-nav-group-label">{group.label}</p>
              <nav className="shell-nav">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => `shell-nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="shell-nav-icon">{item.icon}</span>
                    <span className="shell-nav-copy">
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </span>
                    <span className="shell-nav-arrow">
                      <ChevronIcon />
                    </span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </aside>

      <button
        type="button"
        className="shell-sidebar-collapse-btn"
        onClick={toggleSidebarCollapsed}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={sidebarCollapsed}
      >
        <ChevronIcon />
      </button>


        <header className="shell-header" ref={headerRef}>
          <div className="shell-header-left">
            <button type="button" className="shell-menu-btn" aria-label="Toggle menu" onClick={() => setSidebarOpen((prev) => !prev)}>
              <MenuIcon />
            </button>
            <div className="shell-header-brand"><BrandLogo /></div>
            <GlobalSearch />
            <UpdatesButton />
          </div>

          <div className="shell-header-right">
            <span className="shell-date-chip">{formattedDate}</span>

            {/* Team Chat, Notes & Screen Share Header Button */}
            <button
              type="button"
              className={`shell-teamchat-btn ${teamChatOpen ? 'is-active' : ''}`}
              onClick={() => setTeamChatOpen((prev) => !prev)}
              title="Team Chat, Notes & Screen Share"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Notes & Team Chat</span>
              {chatUnreadCount > 0 && (
                <span className="shell-teamchat-badge">{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</span>
              )}
            </button>

            {accessibleOrgs.length > 1 && (

              <select
                className="shell-org-switch"
                value={activeOrgId}
                onChange={(event) => handleOrgSwitch(event.target.value)}
                aria-label="Switch organization"
              >
                {accessibleOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}

            <div className="shell-notif-wrap">
              <button
                type="button"
                className="shell-notif-btn"
                onClick={() => setShowNotif((prev) => !prev)}
                aria-label="Notifications"
              >
                <BellIcon />
                {unreadCount > 0 && <span className="shell-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>

              {showNotif && (
                <div className="shell-notif-dropdown">
                  <div className="shell-notif-head">
                    <div>
                      <h3>Notifications</h3>
                      <p>{unreadCount} unread</p>
                    </div>
                    <div className="shell-notif-actions">
                      <button
                        type="button"
                        className={`shell-toggle ${onlyUnread ? 'is-on' : ''}`}
                        onClick={() => setOnlyUnread((prev) => !prev)}
                      >
                        <span />
                      </button>
                      <span>Unread</span>
                    </div>
                  </div>

                  {unreadCount > 0 && (
                    <button type="button" className="shell-mark-read-btn" onClick={handleMarkAllRead}>
                      Mark all as read
                    </button>
                  )}

                  <div className="shell-notif-list">
                    {visibleNotifications.length === 0 && (
                      <div className="shell-notif-empty">
                        <p>{onlyUnread ? 'No unread notifications' : 'No notifications yet'}</p>
                      </div>
                    )}

                    {visibleNotifications.map((item) => (
                      <div key={item.id} role="button" tabIndex={0} onClick={() => openNotification(item)} onKeyDown={event => { if (event.key === 'Enter') openNotification(item); }} className={`shell-notif-item ${item.is_read ? '' : 'is-unread'}`}>
                        <span className="shell-notif-dot" />
                        <div>
                          <p>{item.message}</p>
                          <time>{formatNotificationTime(item.created_at)}</time>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="shell-profile">
              <div className="shell-avatar">{initials}</div>
              <div className="shell-profile-meta">
                <p>{user.name || 'User'}</p>
                <span>{resolvedRole || 'member'}</span>
              </div>
            </div>

            <button type="button" className="shell-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

      <div className="shell-main">
        <main className="shell-content" onClick={closeTransientUi}>
          <Outlet />
        </main>
      </div>
      <div onClick={e => e.stopPropagation()}>
        {chatLoaded && <Suspense fallback={<span role="status">Loading chat...</span>}><TeamChat
          wsRef={wsRef}
          socketVersion={socketVersion}
          isOpen={teamChatOpen}
          onToggle={setTeamChatOpen}
          showFab={false}
          onUnreadChange={setChatUnreadCount}
        /></Suspense>}
      </div>

    </div>
  );
};
export default Layout;
