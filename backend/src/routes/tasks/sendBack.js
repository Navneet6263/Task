const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { sendBack, sendBackInfo } = require('../../services/sendBack');

// The assignee returns a task that is not their work, with a reason (services/sendBack.js).
const route = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (!error.status) console.error('[send-back]', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not send the task back. Try again.', ...(error.fields ? { fields: error.fields } : {}) });
  }
};

router.get('/:id/send-back', authenticate, route(async (req, res) => {
  res.json(await sendBackInfo(req, req.params.id));
}));

router.post('/:id/send-back', authenticate, route(async (req, res) => {
  const result = await sendBack(req, req.params.id, req.body || {});
  res.json({ message: `Sent back to ${result.to.name}.`, ...result });
}));

module.exports = router;
