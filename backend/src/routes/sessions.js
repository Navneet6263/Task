const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const sessions = require('../services/sessions');

// Settings → Password & security: where this account is signed in, and signing devices out.
router.use(authenticate);
const route = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    console.error('[sessions]', error.message);
    res.status(500).json({ error: 'Could not complete the request. Try again.' });
  }
};

router.get('/', route(async (req, res) => {
  const rows = await sessions.listSessions(req.userId);
  // The session id is the secret part of a sign-in: only the row number leaves the server.
  res.json({
    sessions: rows.map(({ sid, ...row }) => ({ ...row, remember: Boolean(Number(row.remember)), current: sid === req.sessionId })),
  });
}));

// Log out from this device: the token stops working on the server too, not only in this browser.
router.post('/logout', route(async (req, res) => {
  if (req.sessionId) await sessions.revokeSession(req.sessionId, 'signed_out');
  res.json({ message: 'Signed out' });
}));

router.post('/others/revoke', route(async (req, res) => {
  const ended = await sessions.revokeUserSessions(req.userId, { exceptSid: req.sessionId, reason: 'signed_out_elsewhere' });
  res.json({ ended });
}));

router.delete('/:id', route(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Session not found' });
  const own = (await sessions.listSessions(req.userId)).find((row) => Number(row.id) === id);
  if (!own) return res.status(404).json({ error: 'Session not found' });
  await sessions.revokeSession(own.sid, own.sid === req.sessionId ? 'signed_out' : 'signed_out_elsewhere');
  res.json({ ended: 1, current: own.sid === req.sessionId });
}));

module.exports = router;
