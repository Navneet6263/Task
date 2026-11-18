const express = require('express');
const { authenticate } = require('../middleware/auth');
const bugFlow = require('../services/bugFlow');

// Bug tracking module: Developer / QA per team, and the Pick → Mark fixed → Pass / Fail buttons.
const router = express.Router();
router.use(authenticate);

const route = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong' }); }
};

// Is the module on for this workspace? The app hides all bug-flow buttons when it is not.
router.get('/status', route(async (req, res) => {
  res.json({ enabled: await bugFlow.isOn(req.orgId), wip_limit: bugFlow.WIP_LIMIT });
}));

router.get('/teams/:teamId/board', route(async (req, res) => {
  res.json(await bugFlow.board(req, Number(req.params.teamId)));
}));

router.get('/teams/:teamId/roles', route(async (req, res) => {
  res.json(await bugFlow.rolesOfTeam(req, Number(req.params.teamId)));
}));

router.put('/teams/:teamId/roles/:userId', route(async (req, res) => {
  res.json(await bugFlow.setRole(req, Number(req.params.teamId), Number(req.params.userId), req.body?.work_role ?? null));
}));

router.get('/:taskId', route(async (req, res) => {
  res.json(await bugFlow.view(req, req.params.taskId));
}));

router.post('/:taskId/:action', route(async (req, res) => {
  res.json(await bugFlow.act(req, req.params.taskId, req.params.action, req.body?.note));
}));

module.exports = router;
