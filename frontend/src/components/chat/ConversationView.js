import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { chat } from '../../services/api';
import { arrange, timeOf, upsert } from './quickChatUtils';

const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// One conversation: messages grouped by person and day, plus a composer.
export default function ConversationView({ teamId, thread, selfId, incoming, onRead }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setMessages([]); setReplyTo(null);
    chat.messages(teamId, thread.id).then((r) => {
      if (!active) return;
      setMessages(r.data.messages || []); setHasOlder((r.data.messages || []).length >= 50);
      chat.markRead(teamId, thread.id).then(onRead).catch(() => {});
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [teamId, thread.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live messages for this conversation arrive through the shared socket.
  useEffect(() => {
    if (!incoming || Number(incoming.thread_id) !== Number(thread.id)) return;
    setMessages((list) => upsert(list, { ...incoming, status: 'sent' }));
    if (Number(incoming.user_id) !== Number(selfId)) chat.markRead(teamId, thread.id).then(onRead).catch(() => {});
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { if (stickToBottom.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, [thread.id]);

  const loadOlder = async () => {
    const first = messages.find((m) => m.id);
    if (!first) return;
    const el = listRef.current, before = el.scrollHeight;
    stickToBottom.current = false;
    const r = await chat.messages(teamId, thread.id, first.id);
    const older = r.data.messages || [];
    setHasOlder(older.length >= 50);
    setMessages((list) => [...older, ...list]);
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - before; });
  };

  const send = async (body = text, retryOf = null) => {
    const message = body.trim();
    if (!message) return;
    const tempId = retryOf?.client_temp_id || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = { client_temp_id: tempId, user_id: selfId, user_name: 'You', message, created_at: new Date().toISOString(), thread_id: thread.id, reply_to: replyTo?.id || null, reply_text: replyTo?.message, reply_user_name: replyTo?.user_name, status: 'sending' };
    stickToBottom.current = true;
    setMessages((list) => upsert(list, optimistic));
    if (!retryOf) { setText(''); setReplyTo(null); }
    try {
      const r = await chat.send(teamId, { message, thread_id: thread.id, reply_to: optimistic.reply_to, client_temp_id: tempId });
      setMessages((list) => upsert(list, { ...r.data, status: 'sent' }));
    } catch { setMessages((list) => upsert(list, { ...optimistic, status: 'failed' })); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2" onScroll={(e) => { const el = e.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {hasOlder && <button type="button" onClick={loadOlder} className="mx-auto mb-2 block rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink">Load earlier messages</button>}
        {loading && <p role="status" className="py-8 text-center text-sm text-muted">Loading…</p>}
        {!loading && !messages.length && <p className="py-10 text-center text-sm text-muted">No messages yet. Start the conversation.</p>}
        {arrange(messages).map((item) => {
          if (item.type === 'day') return <div key={item.key} className="my-3 flex items-center gap-2 text-[11px] font-semibold text-muted"><span className="h-px flex-1 bg-line" />{item.label}<span className="h-px flex-1 bg-line" /></div>;
          const m = item.message, mine = Number(m.user_id) === Number(selfId);
          return (
            <div key={item.key} className={`group flex gap-2 ${mine ? 'flex-row-reverse' : ''} ${item.startsRun ? 'mt-2.5' : 'mt-0.5'}`}>
              {!mine && <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent ${item.startsRun ? '' : 'invisible'}`}>{initials(m.user_name)}</span>}
              <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {item.startsRun && !mine && <span className="mb-0.5 text-[11px] font-semibold text-muted">{m.user_name}</span>}
                <div className={`rounded-2xl px-3 py-1.5 text-sm leading-snug ${mine ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md bg-subtle text-ink'} ${m.status === 'failed' ? 'opacity-60' : ''}`}>
                  {m.reply_text && <div className={`mb-1 border-l-2 pl-2 text-xs ${mine ? 'border-accent-fg/50 opacity-80' : 'border-accent text-muted'}`}><b>{m.reply_user_name}</b> {String(m.reply_text).slice(0, 80)}</div>}
                  <span className="whitespace-pre-wrap break-words">{m.message}</span>
                </div>
                <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                  {m.status === 'sending' ? 'Sending…' : m.status === 'failed'
                    ? <button type="button" className="font-semibold text-danger underline" onClick={() => send(m.message, m)}>Not sent. Retry</button>
                    : timeOf(m.created_at)}
                  {m.id && <button type="button" className="opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus:opacity-100" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}>Reply</button>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-line p-2">
        {replyTo && (
          <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md bg-subtle px-2 py-1 text-xs">
            <span className="min-w-0 truncate">Replying to <b>{replyTo.user_name}</b>: {replyTo.message}</span>
            <button type="button" aria-label="Cancel reply" className="text-muted hover:text-ink" onClick={() => setReplyTo(null)}>&times;</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea ref={inputRef} rows={1} value={text} aria-label="Message" placeholder="Write a message… (Enter to send)"
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); e.target.style.height = 'auto'; } if (e.key === 'Escape') setReplyTo(null); }}
            className="max-h-[120px] min-h-[38px] flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted" />
          <button type="button" aria-label="Send" disabled={!text.trim()} onClick={() => send()} className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-accent text-accent-fg disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
