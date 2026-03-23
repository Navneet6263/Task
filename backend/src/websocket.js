const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

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

const packMessage = (event, data) =>
  JSON.stringify({ event, data, timestamp: new Date().toISOString() });

function init(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = decoded.id;
      ws.userRole = decoded.role;
      ws.teamIds = new Set();
      ws.isAlive = true;
      addUserSocket(ws.userId, ws);
    } catch (error) {
      ws.close(1008, 'Invalid token');
      return;
    }

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message);

        if (payload.type === 'join' && payload.teamId) {
          joinTeamRoom(ws, payload.teamId);
          return;
        }

        if (payload.type === 'leave' && payload.teamId) {
          leaveTeamRoom(ws, payload.teamId);
          return;
        }

        if (payload.type === 'webrtc_signal' && payload.targetUserId) {
          sendToUser(payload.targetUserId, 'webrtc_signal', {
            teamId: Number(payload.teamId),
            fromUserId: ws.userId,
            payload: payload.payload || {},
          });
        }
      } catch (error) {}
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      Array.from(ws.teamIds).forEach((teamId) => leaveTeamRoom(ws, teamId));
      removeUserSocket(ws.userId, ws);
    });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
}

function broadcast(teamId, event, data) {
  const key = normalizeTeamId(teamId);
  if (!teamRooms.has(key)) return;

  const message = packMessage(event, data);
  teamRooms.get(key).forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
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
