const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let wss = null;

// Map: teamId -> Set of ws clients
const teamRooms = new Map();

function init(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = decoded.id;
      ws.isAlive = true;
    } catch (e) {
      ws.close(1008, 'Invalid token');
      return;
    }

    ws.on('message', (msg) => {
      try {
        const { type, teamId } = JSON.parse(msg);
        if (type === 'join' && teamId) {
          ws.teamId = teamId;
          if (!teamRooms.has(teamId)) teamRooms.set(teamId, new Set());
          teamRooms.get(teamId).add(ws);
        }
      } catch (e) {}
    });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      if (ws.teamId && teamRooms.has(ws.teamId)) {
        teamRooms.get(ws.teamId).delete(ws);
      }
    });
  });

  // Heartbeat to clean dead connections
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
}

function broadcast(teamId, event, data) {
  if (!teamRooms.has(teamId)) return;
  const msg = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  teamRooms.get(teamId).forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

module.exports = { init, broadcast };
