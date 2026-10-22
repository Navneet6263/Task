import { useEffect } from 'react';
import { WS_BASE_URL } from '../services/runtimeConfig';
import { notify } from '../services/feedback';

export default function useWorkspaceSocket({ wsRef, setSocketVersion, fetchNotifications, token, orgId }) {
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let socket = null;
    let timer;
    let retries = 0;
    const hasCurrentToken = () => token === (
      localStorage.getItem('company_token') || localStorage.getItem('token')
    );
    const retry = () => {
      if (stopped || !hasCurrentToken()) return;
      retries += 1;
      const delay = retries <= 5 ? Math.min(60000, 5000 * (2 ** (retries - 1))) : 120000;
      if (retries > 5) retries = 0;
      timer = setTimeout(connect, delay);
    };
    const connect = () => {
      if (stopped || !hasCurrentToken()) return;
      try {
        const query = new URLSearchParams({ token, orgId: orgId || '' });
        const ws = new WebSocket(`${WS_BASE_URL}?${query}`);
        socket = ws;
        wsRef.current = ws;
        ws.onopen = () => {
          if (stopped || !hasCurrentToken()) { ws.close(); return; }
          retries = 0;
          setSocketVersion(version => version + 1);
        };
        ws.onmessage = event => {
          if (stopped || !hasCurrentToken()) return;
          try {
            const message = JSON.parse(event.data);
            if (['task_created', 'task_updated', 'overdue_alert', 'calendar_updated', 'calendar_reminder'].includes(message.event)) {
              fetchNotifications();
            }
            if (['calendar_updated', 'calendar_reminder'].includes(message.event)) {
              window.dispatchEvent(new CustomEvent('calendar:changed'));
              if (message.event === 'calendar_reminder' && message.data?.message) notify(message.data.message, 'success');
            }
          } catch { /* Ignore non-JSON messages, not connection failures. */ }
        };
        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
          retry();
        };
      } catch { retry(); }
    };

    // StrictMode's initial setup/cleanup finishes before we start a handshake.
    timer = setTimeout(connect, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (!socket) return;
      if (wsRef.current === socket) wsRef.current = null;
      socket.onmessage = null;
      socket.onclose = null;
      const retiringSocket = socket;
      // Closing CONNECTING sockets aborts the handshake and produces a browser error.
      // A retired socket cannot update the UI or retry; close it once it opens.
      retiringSocket.onopen = () => retiringSocket.close();
      if (retiringSocket.readyState === WebSocket.OPEN) retiringSocket.close();
    };
  }, [wsRef, setSocketVersion, fetchNotifications, token, orgId]);
}
