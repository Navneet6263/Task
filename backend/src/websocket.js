const WebSocket = require('ws');
const db = require('./config/database');
const { canAccessTeam } = require('./utils/teamAccess');

// The app sends its sign-in token in the WebSocket sub-protocol header ("greentask, <token>"), not
// in the URL, so it never lands in Nginx or proxy access logs. The URL form still works for tabs
// opened before this change.
const PROTOCOL = 'greentask';
const RECHECK_MS = 60 * 1000;
const tokenFrom = (req, url) => {
  const offered = String(req.headers?.['sec-websocket-protocol'] || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (offered.includes(PROTOCOL)) return offered.find((p) => p !== PROTOCOL) || '';
  return url.searchParams.get('token') || '';
};
// Same live check as every API request: open session, account still there, role and organizations now.
const auth = () => require('./middleware/auth');

let wss = null;

const teamRooms = new Map();
const userSockets = new Map();

const normalizeTeamId = (teamId) => String(Number(teamId));

const addUserSocket = (userId, ws) => {
  const key = String(userId);
  if (!userSockets.has(key)) userSockets.set(key, new Set());
  userSockets.get(key).add(ws);
};

const removeUserSocket = (userId, ws) => {
  const key = String(userId);
  if (!userSockets.has(key)) return;
  userSockets.get(key).delete(ws);
  if (userSockets.get(key).size === 0) userSockets.delete(key);
};

const joinTeamRoom = (ws, teamId) => {
  const key = normalizeTeamId(teamId);
  if (!teamRooms.has(key)) teamRooms.set(key, new Set());
  teamRooms.get(key).add(ws);
  ws.teamIds.add(key);
};

const leaveTeamRoom = (ws, teamId) => {
  const key = normalizeTeamId(teamId);
  if (teamRooms.has(key)) {
    teamRooms.get(key).delete(ws);
    if (teamRooms.get(key).size === 0) teamRooms.delete(key);
  }
  ws.teamIds.delete(key);
};

const buildPreviewMessage = (ws, payload) => ({
  id: `preview:${payload.clientTempId}`,
  client_temp_id: payload.clientTempId,
  team_id: Number(payload.teamId),
  thread_id: Number(payload.threadId),
  message: String(payload.message || ''),
  created_at: new Date().toISOString(),
  reply_to: payload.reply_to || null,
  reply_text: payload.reply_text || null,
  reply_user_name: payload.reply_user_name || null,
  thread_type: payload.threadType || 'group',
  user_id: ws.userId,
  user_name: payload.userName || 'Teammate',
  optimistic: true,
  pending: true,
});

const packMessage = (event, data) =>
  JSON.stringify({ event, data, timestamp: new Date().toISOString() });

function init(server) {
  wss = new WebSocket.Server({
    server,
    maxPayload: 64 * 1024,
    handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false),
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = tokenFrom(req, url);
    ws.teamIds = new Set();
    ws.isAlive = true;

    // Messages can arrive while the session is being checked: each one waits for the answer.
    const ready = auth().authorize(token).then((result) => {
      if (!result.ok) { ws.close(1008, 'Invalid token'); return false; }
      const { decoded } = result;
      ws.decoded = decoded;
      ws.userId = decoded.id;
      ws.userRole = result.role;
      ws.orgId = auth().pickOrg(result, Number(url.searchParams.get('orgId')) || null, decoded.org_id ? Number(decoded.org_id) : null);
      ws.companyAdminId = decoded.company_admin_id || null;
      ws.expiresAt = decoded.exp ? decoded.exp * 1000 : 0;
      ws.checkedAt = Date.now();
      if (ws.readyState !== WebSocket.OPEN) return false;
      addUserSocket(ws.userId, ws);
      return true;
    }).catch(() => { ws.close(1011, 'Try again'); return false; });

    ws.on('message', async (message) => {
      try {
        if (!(await ready)) return;
        if (ws.expiresAt && Date.now() >= ws.expiresAt) return ws.close(1008, 'Token expired');
        const payload = JSON.parse(message);

        if (payload.type === 'join' && payload.teamId) {
          if (await canAccessTeam(ws, payload.teamId) && ws.readyState === WebSocket.OPEN) joinTeamRoom(ws, payload.teamId);
          else leaveTeamRoom(ws, payload.teamId);
          return;
        }

        if (payload.type === 'leave' && payload.teamId) {
          leaveTeamRoom(ws, payload.teamId);
          return;
        }

        if (payload.type === 'webrtc_signal' && payload.targetUserId) {
          if (!await canAccessTeam(ws, payload.teamId)) return;
          const [[session]] = await db.execute(
            `SELECT s.id FROM team_review_sessions s
             WHERE s.id = ? AND s.team_id = ? AND s.status = 'active'
               AND EXISTS (SELECT 1 FROM team_review_session_participants p WHERE p.session_id = s.id AND p.user_id = ? AND p.left_at IS NULL)
               AND EXISTS (SELECT 1 FROM team_review_session_participants p WHERE p.session_id = s.id AND p.user_id = ? AND p.left_at IS NULL)`,
            [payload.payload?.sessionId || 0, payload.teamId, ws.userId, payload.targetUserId]);
          if (!session) return;
          sendToUser(payload.targetUserId, 'webrtc_signal', {
            teamId: Number(payload.teamId),
            fromUserId: ws.userId,
            payload: payload.payload || {},
          });
          return;
        }

        if (payload.type === 'chat_preview' && payload.teamId && payload.threadId && payload.clientTempId) {
          // Only the authenticated HTTP message route may broadcast persisted messages.
          // Sender-side optimistic rendering is unaffected; untrusted routing/name fields are not relayed.
          return;
        }
      } catch (error) {}
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      Array.from(ws.teamIds).forEach((teamId) => leaveTeamRoom(ws, teamId));
      if (ws.userId) removeUserSocket(ws.userId, ws);
    });
  });

  // A signed-out, removed or demoted account loses its live connection within a minute.
  const recheck = (ws) => {
    if (!ws.decoded || Date.now() - (ws.checkedAt || 0) < RECHECK_MS) return;
    ws.checkedAt = Date.now();
    require('./services/sessions').check(ws.decoded).then((result) => {
      if (!result.ok || (ws.orgId && !(result.orgIds || []).includes(Number(ws.orgId)))) { ws.close(1008, 'Session ended'); return; }
      ws.userRole = result.role;
    }).catch(() => {});
  };

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive || (ws.expiresAt && Date.now() >= ws.expiresAt)) {
        ws.terminate();
        return;
      }

      ws.isAlive = false;
      ws.ping();
      recheck(ws);
    });
  }, 30000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}

function broadcast(teamId, event, data, options = {}) {
  // Company webhooks hear every task change, whether or not anyone has the team open.
  try { require('./services/webhooks').onTaskEvent(teamId, event, data); } catch (error) { console.error('[webhooks]', error.message); }
  const key = normalizeTeamId(teamId);
  if (!teamRooms.has(key)) return;

  const excludeSocket = options.excludeSocket || null;
  const message = packMessage(event, data);
  // One roster query per broadcast, not one query per connected employee.
  // Re-check membership so a removed teammate cannot keep receiving room data.
  return db.execute(`SELECT t.org_id, o.company_admin_id, tm.user_id
    FROM teams t JOIN organizations o ON o.id = t.org_id
    LEFT JOIN team_members tm ON tm.team_id = t.id
    WHERE t.id = ? AND t.is_deleted = FALSE`, [Number(teamId)]).then(([roster]) => {
    const team = roster[0];
    const memberIds = new Set(roster.map(row => Number(row.user_id)));
    teamRooms.get(key)?.forEach(socket => {
      const allowed = team && (socket.userRole === 'company_admin'
        ? Number(socket.companyAdminId) === Number(team.company_admin_id)
        : Number(socket.orgId) === Number(team.org_id) && (socket.userRole === 'admin' || memberIds.has(Number(socket.userId))));
      if (!allowed) { leaveTeamRoom(socket, teamId); return; }
      if (socket === excludeSocket || (socket.expiresAt && Date.now() >= socket.expiresAt)) return;
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    });
  }).catch(error => console.error('Room broadcast authorization failed:', error.message));
}

function sendToUser(userId, event, data) {
  const key = String(userId);
  if (!userSockets.has(key)) return;

  const message = packMessage(event, data);
  userSockets.get(key).forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

module.exports = { init, broadcast, sendToUser };
