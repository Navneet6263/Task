const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { handoverOptions, handOver, handedOverBy } = require('../../services/handover');

// Hand a task over to another team of the company (services/handover.js).
const route = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (!error.status) console.error('[handover]', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not hand the task over. Try again.', ...(error.fields ? { fields: error.fields } : {}) });
  }
};

// My Tasks → Handed over: read-only status of what I handed over.
router.get('/handed-over', authenticate, route(async (req, res) => {
  res.json(await handedOverBy(req.userId));
}));

router.get('/:id/handover', authenticate, route(async (req, res) => {
  res.json(await handoverOptions(req, req.params.id));
}));

router.post('/:id/handover', authenticate, route(async (req, res) => {
  const result = await handOver(req, req.params.id, req.body || {});
  res.json({ message: `Handed over to ${result.team.name} (${result.to.name}).`, ...result });
}));

module.exports = router;
