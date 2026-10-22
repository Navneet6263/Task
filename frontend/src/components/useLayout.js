import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications, users, timesheet } from '../services/api';
import { updatesApi } from './Updates/updatesApi';
import useWorkspaceSocket from './useWorkspaceSocket';
import useShellUnread from './useShellUnread';
import { clearAuthentication } from '../services/preferences';
import { parseStoredUser, getTokenRole, GridIcon, ListIcon, TeamIcon, ReportsIcon, SettingsIcon, LogsIcon, PmsIcon, MailIcon, AdminIcon, ClockIcon, CalendarIcon } from './LayoutParts';
export default function useLayout() {
  const navigate = useNavigate();
  const hasCompanyToken = Boolean(localStorage.getItem('company_token'));
  const authToken = localStorage.getItem('company_token') || localStorage.getItem('token');
  const tokenRole = getTokenRole(authToken);
  const user = hasCompanyToken
    ? parseStoredUser(localStorage.getItem('company_user')) || parseStoredUser(localStorage.getItem('user')) || {}
    : parseStoredUser(localStorage.getItem('user')) || parseStoredUser(localStorage.getItem('company_user')) || {};
  const resolvedRole = tokenRole || user.role;
  const wsRef = useRef(null);
  const [socketVersion, setSocketVersion] = useState(0);

  const [notifList, setNotifList] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const unreadFilter = useRef(onlyUnread);
  unreadFilter.current = onlyUnread;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('shell_sidebar_collapsed') === 'true'
  );
  const [chatLoaded, setChatLoaded] = useState(false);
  const [accessibleOrgs, setAccessibleOrgs] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(localStorage.getItem('active_org_id') || '');
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);


  const [unreadCount, setUnreadCount] = useState(0);
  useShellUnread(wsRef, socketVersion, setChatUnreadCount);
  useEffect(() => { if (teamChatOpen) setChatLoaded(true); }, [teamChatOpen]);

  const fetchNotifications = useCallback(async () => {
    try {
      const [response, count] = await Promise.all([notifications.getAll({ unread: unreadFilter.current || undefined }), notifications.count()]);
      setUnreadCount(Number(count.data.unread || 0));
      setNotifList(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  }, []);

  useEffect(() => { if (showNotif) fetchNotifications(); }, [onlyUnread, showNotif, fetchNotifications]);

  useWorkspaceSocket({ wsRef, setSocketVersion, fetchNotifications, token: authToken, orgId: activeOrgId });
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    const loadOrgAccess = async () => {
      try {
        const response = await users.orgAccess();
        const orgs = Array.isArray(response.data?.organizations) ? response.data.organizations : [];
        const resolvedActive = String(response.data?.active_org_id || localStorage.getItem('active_org_id') || '');
        setAccessibleOrgs(orgs);
        if (resolvedActive) {
          setActiveOrgId(resolvedActive);
          localStorage.setItem('active_org_id', resolvedActive);
        }
      } catch (error) {}
    };

    loadOrgAccess();
  }, []);

  // Unread product updates, shown as a badge on Settings (where "What's new" lives).
  const [updatesUnread, setUpdatesUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => updatesApi.summary().then(({ data }) => { if (active) setUpdatesUnread(Number(data.unread || 0)); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 300000);
    window.addEventListener('workspace-updates-changed', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('workspace-updates-changed', refresh); };
  }, []);

  // Only organizations with the Timesheet add-on see its menu item.
  const [timesheetEnabled, setTimesheetEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    timesheet.status().then(response => { if (active) setTimesheetEnabled(Boolean(response.data?.enabled)); }).catch(() => {});
    return () => { active = false; };
  }, [activeOrgId]);

  const handleMarkAllRead = async () => {
    try {
      await notifications.readAll();
      setNotifList((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (error) {}
  };

  const openNotification = async item => {
    try { await notifications.read(item.id); fetchNotifications(); }
    catch { alert('Could not mark notification as read.'); }
    setShowNotif(false);
    if (item.task_id) navigate(`/dashboard?task=${item.task_id}`);
    else if (String(item.type || '').startsWith('calendar')) navigate('/calendar');
  };
  const handleLogout = () => {
    clearAuthentication();
    navigate('/login');
  };

  const handleOrgSwitch = (nextOrgId) => {
    setActiveOrgId(nextOrgId);
    localStorage.setItem('active_org_id', nextOrgId);
    window.location.reload();
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

  const isAdmin = resolvedRole === 'admin' || resolvedRole === 'company_admin';
  const navItems = useMemo(
    () => [
      {
        path: '/dashboard',
        label: 'Dashboard',
        note: 'Workspace pulse and quick actions',
        section: 'Main',
        icon: <GridIcon />,
      },
      {
        path: '/my-tasks',
        label: 'My Tasks',
        note: 'Assigned work and due dates',
        section: 'Main',
        icon: <ListIcon />,
      },
      {
        path: '/calendar',
        label: 'Calendar',
        note: 'Meetings, events and due dates',
        section: 'Main',
        icon: <CalendarIcon />,
      },
      {
        path: '/team',
        label: 'Team Management',
        note: 'Members, ownership, and structure',
        section: 'Main',
        icon: <TeamIcon />,
      },
      {
        path: '/reports',
        label: 'Reports',
        note: 'Velocity, workload, and delivery risk',
        section: 'Main',
        icon: <ReportsIcon />,
      },
      {
        path: '/communications',
        label: 'Communications',
        note: 'Client emails and messages',
        section: 'Main',
        icon: <MailIcon />,
      },
      ...(timesheetEnabled
        ? [
            {
              path: '/timesheet',
              label: 'Timesheet',
              note: 'Client work and hours per person',
              section: 'Main',
              icon: <ClockIcon />,
            },
          ]
        : []),
      {
        path: '/settings',
        label: 'Settings',
        note: "Profile, appearance, teams and what's new",
        section: 'Control',
        badge: updatesUnread,
        icon: <SettingsIcon />,
      },
      {
        path: '/audit-logs',
        label: 'Audit Logs',
        note: 'Review activity and changes',
        section: 'Control',
        icon: <LogsIcon />,
      },
      {
        path: '/pms-hub',
        label: 'My PMS Hub',
        note: 'Personal workspace overview',
        section: 'Control',
        icon: <PmsIcon />,
      },
      ...(isAdmin
        ? [
            {
              path: '/admin',
              label: 'Admin Panel',
              note: 'Organization level controls',
              section: 'Control',
              icon: <AdminIcon />,
            },
          ]
        : []),
    ],
    [isAdmin, timesheetEnabled, updatesUnread]
  );

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const navGroups = useMemo(() => {
    const groups = [];
    navItems.forEach((item) => {
      const existingGroup = groups.find((group) => group.label === item.section);
      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.push({ label: item.section, items: [item] });
      }
    });
    return groups;
  }, [navItems]);

  const closeTransientUi = () => {
    if (showNotif) setShowNotif(false);
    if (sidebarOpen) setSidebarOpen(false);
  };

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem('shell_sidebar_collapsed', String(next));
      return next;
    });
  };


  return { user, resolvedRole, wsRef, socketVersion, showNotif, setShowNotif, onlyUnread, setOnlyUnread, sidebarOpen, setSidebarOpen, sidebarCollapsed, chatLoaded, accessibleOrgs, activeOrgId, teamChatOpen, setTeamChatOpen, chatUnreadCount, setChatUnreadCount, unreadCount, fetchNotifications, handleMarkAllRead, openNotification, handleLogout, handleOrgSwitch, visibleNotifications, initials, formattedDate, navGroups, closeTransientUi, toggleSidebarCollapsed };
}
