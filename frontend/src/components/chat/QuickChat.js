import React, { useCallback, useEffect, useState } from 'react';
import { chat, teams as teamsApi } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import { threadName } from './quickChatUtils';

// Compact slide-in chat for quick conversations: team channels and 1:1 messages.
export default function QuickChat({ open, onClose, wsRef, socketVersion, onUnreadChange, onShareScreen }) {
  const self = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [teamList, setTeamList] = useState([]);
  const [teamId, setTeamId] = useState(() => readPreference('quick-chat-team', null));
  const [members, setMembers] = useState([]);
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [unread, setUnread] = useState({});
  const [incoming, setIncoming] = useState(null);

  useEffect(() => {
    if (!open || teamList.length) return;
    teamsApi.getAll().then((r) => {
      setTeamList(r.data);
      setTeamId((current) => (r.data.some((t) => String(t.id) === String(current)) ? current : r.data[0]?.id ?? null));
    }).catch(() => {});
  }, [open, teamList.length]);

  const loadThreads = useCallback(() => {
    if (!teamId) return;
    chat.threads(teamId).then((r) => setThreads(r.data.threads || [])).catch(() => setThreads([]));
  }, [teamId]);
  useEffect(() => {
    if (!open || !teamId) return;
    loadThreads();
    teamsApi.getMembers(teamId).then((r) => setMembers(r.data)).catch(() => setMembers([]));
  }, [open, teamId, loadThreads]);

  // One listener on the shared socket: route new messages to the open chat or count them as unread.
  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return undefined;
    const handle = (event) => {
      try {
        const { event: type, data } = JSON.parse(event.data);
        if (type === 'thread_created') loadThreads();
        if (type !== 'new_message' || !data) return;
        if (active && Number(data.thread_id) === Number(active.id) && open) setIncoming(data);
        else if (Number(data.user_id) !== Number(self.id) && Number(data.team_id) === Number(teamId)) setUnread((u) => ({ ...u, [data.thread_id]: (u[data.thread_id] || 0) + 1 }));
      } catch { /* ignore non-JSON frames */ }
    };
    ws.addEventListener('message', handle);
    return () => ws.removeEventListener('message', handle);
  }, [wsRef, socketVersion, active, open, teamId, loadThreads, self.id]);

  const refreshTotal = useCallback(() => chat.unread().then((r) => onUnreadChange(Object.values(r.data || {}).reduce((s, v) => s + Number(v || 0), 0))).catch(() => {}), [onUnreadChange]);
  const openThread = (thread) => { setActive(thread); setUnread((u) => ({ ...u, [thread.id]: 0 })); };
  const startDirect = async (person) => {
    try { const r = await chat.direct(teamId, person.id); loadThreads(); openThread(r.data); }
    catch (err) { notify(err.response?.data?.error || 'Could not start the conversation.'); }
  };
  const pickTeam = (id) => { setTeamId(id); writePreference('quick-chat-team', id); setActive(null); setThreads([]); setUnread({}); };

  if (!open) return null;
  return (
    <aside aria-label="Chat" className="fixed bottom-0 right-0 z-[60] flex w-full flex-col border-l border-line bg-surface shadow-pop sm:w-[380px]" style={{ top: 'var(--shell-header-height, 57px)' }}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        {active ? (
          <button type="button" aria-label="Back to conversations" onClick={() => { setActive(null); loadThreads(); }} className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">‹</button>
        ) : <span className="pl-1 text-[15px] font-semibold">Chat</span>}
        {active
          ? <span className="min-w-0 flex-1 truncate text-sm font-semibold">{active.thread_type === 'direct' ? '' : '# '}{threadName(active, members, self.id)}</span>
          : (
            <select aria-label="Team" value={teamId || ''} onChange={(e) => pickTeam(e.target.value)} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink">
              {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        {active?.thread_type === 'direct' && (
          <button type="button" title="Share your screen with this person"
            onClick={() => onShareScreen({ teamId, personId: Number(active.direct_user_one) === Number(self.id) ? active.direct_user_two : active.direct_user_one })} className="rounded-md border border-line px-2 py-1 text-xs font-medium text-muted hover:text-ink">Share screen</button>
        )}
        <button type="button" aria-label="Close chat" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>
      </header>
      {!teamId && <p className="p-6 text-center text-sm text-muted">Join a team to start chatting.</p>}
      {teamId && !active && <ConversationList threads={threads} members={members} selfId={self.id} unread={unread} onOpen={openThread} onStartDirect={startDirect} />}
      {teamId && active && <ConversationView key={active.id} teamId={teamId} thread={active} selfId={self.id} incoming={incoming} onRead={refreshTotal} />}
    </aside>
  );
}
