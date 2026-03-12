import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { notifications } from '../services/api';
import './Layout.css';

const Layout = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const wsRef = useRef(null);

  const [notifList, setNotifList] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');

  const unreadCount = notifList.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await notifications.getAll();
      setNotifList(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  }, []);

  const connectWS = useCallback(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('company_token');
    if (!token) return;

    const ws = new WebSocket(`ws://localhost:5000?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (['task_created', 'task_updated', 'overdue_alert'].includes(msg.event)) {
          fetchNotifications();
        }
      } catch (error) {}
    };

    ws.onclose = () => {
      const activeToken = localStorage.getItem('token') || localStorage.getItem('company_token');
      if (activeToken) setTimeout(connectWS, 5000);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
    connectWS();
    return () => wsRef.current?.close();
  }, [fetchNotifications, connectWS]);

  const handleMarkAllRead = async () => {
    try {
      await notifications.readAll();
      setNotifList((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (error) {}
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const visibleNotifications = useMemo(
    () => (onlyUnread ? notifList.filter((item) => !item.is_read) : notifList),
    [onlyUnread, notifList]
  );

  const initials = useMemo(() => {
    if (!user?.name) return 'US';
    return user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }, [user?.name]);

  const isAdmin = user.role === 'admin';
  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <GridIcon /> },
    { path: '/my-tasks', label: 'My Tasks', icon: <ListIcon /> },
    { path: '/team', label: 'Team Management', icon: <TeamIcon /> },
    { path: '/reports', label: 'Reports', icon: <ReportsIcon /> },
    { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
    { path: '/audit-logs', label: 'Audit Logs', icon: <LogsIcon /> },
    { path: '/pms-hub', label: 'My PMS Hub', icon: <PmsIcon /> },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin Panel', icon: <AdminIcon /> }] : []),
  ];

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const closeTransientUi = () => {
    if (showNotif) setShowNotif(false);
    if (sidebarOpen) setSidebarOpen(false);
  };

  return (
    <div className={`shell-root ${sidebarOpen ? 'shell-sidebar-open' : ''}`}>
      <button
        type="button"
        className="shell-backdrop"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="shell-sidebar">
        <div className="shell-brand">
          <div className="shell-brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 3L10 10M10 10L17 3M10 10L10 20M10 10L3 17M10 10L17 17"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <p className="shell-brand-sub">workspace</p>
            <h2 className="shell-brand-title">NavTask</h2>
          </div>
        </div>

        <nav className="shell-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `shell-nav-item ${isActive ? 'is-active' : ''}`}
            >
              <span className="shell-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shell-upgrade-card">
          <p className="shell-upgrade-title">Boost Team Flow</p>
          <p className="shell-upgrade-text">Track velocity, bottlenecks, and delivery confidence in one place.</p>
          <button type="button" className="shell-upgrade-btn">
            Plan Sprint
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <div className="shell-header-left">
            <button type="button" className="shell-menu-btn" onClick={() => setSidebarOpen((prev) => !prev)}>
              <MenuIcon />
            </button>
            <div className="shell-search">
              <SearchIcon />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks, teams, members"
                aria-label="Search"
              />
            </div>
          </div>

          <div className="shell-header-right">
            <span className="shell-date-chip">{formattedDate}</span>

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
                      <div key={item.id} className={`shell-notif-item ${item.is_read ? '' : 'is-unread'}`}>
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
                <span>{user.role || 'member'}</span>
              </div>
            </div>

            <button type="button" className="shell-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <main className="shell-content" onClick={closeTransientUi}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const formatNotificationTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="7" height="7" rx="1.2" />
    <rect x="14" y="3" width="7" height="7" rx="1.2" />
    <rect x="3" y="14" width="7" height="7" rx="1.2" />
    <rect x="14" y="14" width="7" height="7" rx="1.2" />
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1.1" fill="currentColor" />
    <circle cx="3.5" cy="12" r="1.1" fill="currentColor" />
    <circle cx="3.5" cy="18" r="1.1" fill="currentColor" />
  </svg>
);

const TeamIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.2a4 4 0 0 1 0 7.6" />
  </svg>
);

const ReportsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const LogsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const PmsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const AdminIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export default Layout;
