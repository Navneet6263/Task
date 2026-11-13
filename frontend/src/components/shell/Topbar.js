import React, { forwardRef } from 'react';
import BrandLogo from '../BrandLogo';
import { MenuIcon } from '../LayoutParts';
import { Button, CountBadge, Select } from '../../ui';
import useTheme from '../../theme/useTheme';
import NotificationsMenu from './NotificationsMenu';
import UserAvatar, { useMyAvatar } from '../account/UserAvatar';
import { BuildingIcon, ChatIcon, LogoutIcon, MoonIcon, NoteIcon, PlusIcon, ScreenIcon, SearchIcon, SunIcon } from './icons';

const Topbar = forwardRef(function Topbar({ shell, panel, onPanel, onSearch, onCreate }, ref) {
  const { resolved, toggle } = useTheme();
  const {
    user, resolvedRole, initials, setSidebarOpen, chatUnreadCount, accessibleOrgs, activeOrgId,
    handleOrgSwitch, showNotif, setShowNotif, unreadCount, onlyUnread, setOnlyUnread, visibleNotifications, handleMarkAllRead,
    openNotification, handleLogout, sidebarCollapsed,
  } = shell;
  const orgName = accessibleOrgs.find((org) => String(org.id) === String(activeOrgId))?.name;
  const avatar = useMyAvatar();

  return (
    // z-[85]: above everything on the page (filter bars go up to z-80) so its menus never slide under page content,
    // and below full-screen windows (z-90 and up).
    <header ref={ref} className="sticky top-0 z-[85] flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur sm:px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Toggle menu" onClick={() => setSidebarOpen((prev) => !prev)}>
        <MenuIcon />
      </Button>
      {/* On desktop the brand column is as wide as the sidebar, so its divider continues the sidebar edge. */}
      <div className={`-my-2 flex shrink-0 items-center self-stretch lg:border-r lg:border-line ${sidebarCollapsed ? 'lg:pr-4' : 'lg:w-[224px]'}`}>
        <div className="shell-header-brand"><BrandLogo /></div>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 pl-1 lg:pl-3">
        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-md bg-subtle text-muted md:grid"><BuildingIcon /></span>
        {accessibleOrgs.length > 1 ? (
          <Select aria-label="Switch workspace" className="!w-auto max-w-[150px] py-1.5 font-semibold sm:max-w-[240px]" value={activeOrgId} onChange={(event) => handleOrgSwitch(event.target.value)}>
            {accessibleOrgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </Select>
        ) : (
          <div className="hidden min-w-0 leading-tight md:block">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Workspace</p>
            <p className="max-w-[260px] truncate text-[15px] font-semibold">{orgName || 'My workspace'}</p>
          </div>
        )}
      </div>

      {/* Search anywhere and create from anywhere, like Jira. */}
      <div className="mx-auto hidden min-w-0 max-w-md flex-1 items-center gap-2 px-2 md:flex">
        <button type="button" onClick={onSearch} aria-label="Search (Ctrl K)"
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-muted transition hover:border-accent/50 hover:text-ink">
          <SearchIcon size={15} /><span className="truncate">Search tasks, spaces, pages…</span>
          <kbd className="ml-auto shrink-0 whitespace-nowrap rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] leading-none">Ctrl K</kbd>
        </button>
        <Button variant="primary" size="sm" className="h-9" onClick={onCreate} title="Create a task (C)"><PlusIcon size={14} />Create</Button>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={onSearch} aria-label="Search"><SearchIcon size={16} /></Button>
        <Button variant="primary" size="icon" className="h-9 w-9 md:hidden" onClick={onCreate} aria-label="Create a task"><PlusIcon size={16} /></Button>
        <Button variant={panel === 'chat' ? 'primary' : 'secondary'} size="sm" className="h-9" onClick={() => onPanel('chat')} title="Quick chat with your team" aria-pressed={panel === 'chat'}>
          <ChatIcon /><span className="hidden md:inline">Chat</span><CountBadge count={chatUnreadCount} />
        </Button>
        <Button variant={panel === 'screen' ? 'primary' : 'ghost'} size="sm" className="h-9" onClick={() => onPanel('screen')} title="Share your screen 1:1 or with the team" aria-pressed={panel === 'screen'}>
          <ScreenIcon /><span className="hidden lg:inline">Share screen</span>
        </Button>
        <Button variant={panel === 'notes' ? 'primary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => onPanel('notes')} title="My notes" aria-label="My notes" aria-pressed={panel === 'notes'}>
          <NoteIcon />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}>
          {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>
        <NotificationsMenu open={showNotif} onToggle={() => setShowNotif((prev) => !prev)} unreadCount={unreadCount}
          onlyUnread={onlyUnread} setOnlyUnread={setOnlyUnread} items={visibleNotifications} onMarkAllRead={handleMarkAllRead} onOpenItem={openNotification} />
        <div className="ml-1 flex items-center gap-2 border-l border-line pl-2.5">
          {avatar ? <UserAvatar name={user.name} src={avatar} /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{initials}</span>}
          <div className="hidden leading-tight xl:block">
            <p className="max-w-[140px] truncate text-sm font-semibold">{user.name || 'User'}</p>
            <p className="text-xs capitalize text-muted">{String(resolvedRole || 'member').replace('_', ' ')}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-9" onClick={handleLogout} title="Logout">
          <LogoutIcon /><span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
});

export default Topbar;
