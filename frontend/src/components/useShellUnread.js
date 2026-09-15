import { useEffect } from 'react';
import api, { teams } from '../services/api';
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
      try { if (JSON.parse(event.data).event === 'new_message') { clearTimeout(timer); timer = setTimeout(refresh, 300); } } catch {}
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    ws?.addEventListener('message', message);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(interval); clearTimeout(timer); ws?.removeEventListener('message', message); document.removeEventListener('visibilitychange', refresh); };
  }, [wsRef, socketVersion, setCount]);
}
