import React from 'react';
import { Button, CountBadge, Switch } from '../../ui';
import { BellIcon, formatNotificationTime } from '../LayoutParts';

export default function NotificationsMenu({ open, onToggle, unreadCount, onlyUnread, setOnlyUnread, items, onMarkAllRead, onOpenItem }) {
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Notifications" aria-expanded={open} className="relative">
        <BellIcon />
        {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5"><CountBadge count={unreadCount} max={9} /></span>}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-[150] mt-2 w-[min(360px,calc(100vw-24px))] rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h3 className="text-[15px] font-semibold">Notifications</h3>
              <p className="text-xs text-muted">{unreadCount} unread</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <Switch checked={onlyUnread} onChange={setOnlyUnread} label="Show unread only" /> Unread
            </label>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={onMarkAllRead} className="w-full border-b border-line px-4 py-2 text-left text-xs font-semibold text-accent hover:bg-subtle">
              Mark all as read
            </button>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">{onlyUnread ? 'No unread notifications' : 'No notifications yet'}</p>}
            {items.map((item) => (
              <div key={item.id} role="button" tabIndex={0} onClick={() => onOpenItem(item)} onKeyDown={(event) => { if (event.key === 'Enter') onOpenItem(item); }}
                className="flex cursor-pointer gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-subtle focus:bg-subtle focus:outline-none">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? 'bg-line' : 'bg-accent'}`} />
                <div className="min-w-0">
                  <p className={`text-sm ${item.is_read ? 'text-muted' : 'text-ink'}`}>{item.message}</p>
                  <time className="text-xs text-muted">{formatNotificationTime(item.created_at)}</time>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
