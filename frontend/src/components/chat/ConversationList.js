import React, { useState } from 'react';
import { threadName } from './quickChatUtils';

const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function Row({ name, sub, unread, onOpen, square }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-subtle">
      <span className={`grid h-8 w-8 shrink-0 place-items-center text-[11px] font-bold ${square ? 'rounded-md bg-subtle text-muted' : 'rounded-full bg-accent-soft text-accent'}`}>{square ? '#' : initials(name)}</span>
      <span className="min-w-0 flex-1"><span className={`block truncate text-sm ${unread ? 'font-bold' : 'font-medium'}`}>{name}</span>{sub && <span className="block truncate text-xs text-muted">{sub}</span>}</span>
      {unread > 0 && <span className="min-w-[18px] rounded-full bg-accent px-1.5 text-center text-[10px] font-bold leading-[18px] text-accent-fg">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}

// Channels and direct messages of the selected team, plus a way to start a new 1:1 chat.
export default function ConversationList({ threads, members, selfId, unread, onOpen, onStartDirect }) {
  const [query, setQuery] = useState('');
  const match = (name) => name.toLowerCase().includes(query.trim().toLowerCase());
  const channels = threads.filter((t) => t.thread_type !== 'direct').filter((t) => match(threadName(t, members, selfId)));
  const directs = threads.filter((t) => t.thread_type === 'direct');
  const directWith = new Set(directs.map((t) => Number(Number(t.direct_user_one) === Number(selfId) ? t.direct_user_two : t.direct_user_one)));
  const people = members.filter((m) => Number(m.id) !== Number(selfId) && !directWith.has(Number(m.id)) && match(m.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2"><input aria-label="Search conversations" placeholder="Search people or channels" value={query} onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-line bg-subtle px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:bg-surface" /></div>
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Channels</p>
        {channels.map((t) => <Row key={t.id} square name={threadName(t, members, selfId)} sub={t.thread_type === 'group' && !t.is_default ? t.created_by_name && `Started by ${t.created_by_name}` : 'Whole team'} unread={unread[t.id] || 0} onOpen={() => onOpen(t)} />)}
        {!channels.length && <p className="px-2 py-1 text-xs text-muted">No channels match.</p>}
        <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Direct messages</p>
        {directs.filter((t) => match(threadName(t, members, selfId))).map((t) => <Row key={t.id} name={threadName(t, members, selfId)} unread={unread[t.id] || 0} onOpen={() => onOpen(t)} />)}
        {people.map((m) => <Row key={`p${m.id}`} name={m.name} sub="Start a conversation" onOpen={() => onStartDirect(m)} />)}
        {!directs.length && !people.length && <p className="px-2 py-1 text-xs text-muted">No one matches.</p>}
      </div>
    </div>
  );
}
