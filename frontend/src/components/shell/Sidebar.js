import React from 'react';
import { NavLink } from 'react-router-dom';
import { CountBadge, NewTag } from '../../ui';
import { ChevronIcon } from '../LayoutParts';

const NEW_ITEMS = ['/timesheet', '/calendar'];

export default function Sidebar({ navGroups, open, collapsed, onNavigate, onToggleCollapsed }) {
  return (
    <aside
      className={`shell-sidebar fixed bottom-0 left-0 z-30 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-200
        top-[var(--shell-header-height,57px)] ${collapsed ? 'lg:w-16' : 'lg:w-60'} w-64 ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      aria-label="Main navigation"
    >
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.label}</p>}
            <nav className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.path} to={item.path} onClick={onNavigate} title={collapsed ? item.label : item.note}
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${collapsed ? 'lg:justify-center' : ''}
                    ${isActive ? 'bg-accent-soft font-semibold text-ink' : 'font-medium text-muted hover:bg-subtle hover:text-ink'}`}>
                  <span className="shrink-0">{item.icon}</span>
                  <span className={`flex flex-1 items-center justify-between gap-2 truncate ${collapsed ? 'lg:hidden' : ''}`}>
                    {item.label}{NEW_ITEMS.includes(item.path) && <NewTag />}{item.badge > 0 && <CountBadge count={item.badge} tone="accent" />}
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>
      <button type="button" onClick={onToggleCollapsed} aria-pressed={collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden items-center justify-center gap-2 border-t border-line py-2.5 text-xs text-muted hover:bg-subtle hover:text-ink lg:flex">
        <span className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}><ChevronIcon /></span>
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  );
}
