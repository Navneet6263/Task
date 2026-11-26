import { useEffect } from 'react';
import api, { teams } from '../services/api';
import { showChatNotice } from '../services/chatPresence';
export default function useShellUnread(wsRef, socketVersion, setCount) {
  useEffect(() => {
    let active = true, timer;
    const ws = wsRef.current;
    const refresh = () => {
      if (document.hidden) return;
      api.get('/chat/unread/counts').then(response => {
        if (active) setCount(Object.values(response.data || {}).reduce((sum, value) => sum + Number(value || 0), 0));
      }).catch(() => {});
    };
    teams.getAll().then(response => {
      if (active && ws?.readyState === WebSocket.OPEN) response.data.forEach(team => ws.send(JSON.stringify({ type: 'join', teamId: team.id })));
    }).catch(() => {});
    const message = event => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.event === 'new_message' || parsed.event === 'chat_notify') { clearTimeout(timer); timer = setTimeout(refresh, 300); }
        // A new message in any of my teams or a direct chat: a short notice, unless that chat is on screen.
        if (parsed.event === 'chat_notify') showChatNotice(parsed.data);
      } catch {}
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    ws?.addEventListener('message', message);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(interval); clearTimeout(timer); ws?.removeEventListener('message', message); document.removeEventListener('visibilitychange', refresh); };
  }, [wsRef, socketVersion, setCount]);
}
