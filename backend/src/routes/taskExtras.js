const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const extras = require('../services/taskExtras');

const router = express.Router();
router.use(authenticate);

const route = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong' }); }
};
const canManageLabels = (req) => ['admin', 'manager', 'company_admin'].includes(req.userRole);

// The organization's task prefix (for keys like ACC-142) and its labels.
router.get('/meta', route(async (req, res) => {
  if (!req.orgId) return res.json({ prefix: 'TASK', labels: [], colors: extras.COLORS });
  res.json({ prefix: await extras.orgPrefix(req.orgId), labels: await extras.labelsOf(req.orgId), colors: extras.COLORS });
}));

// Admins pick the letters in task keys, e.g. ACC for ACC-142.
router.put('/meta/prefix', route(async (req, res) => {
  if (!['admin', 'company_admin'].includes(req.userRole)) return res.status(403).json({ error: 'Only admins can change task keys' });
  const prefix = String(req.body.prefix || '').trim().toUpperCase();
  if (prefix && !/^[A-Z]{2,6}$/.test(prefix)) return res.status(422).json({ error: 'Use 2 to 6 letters, like ACC' });
  await db.execute('UPDATE organizations SET task_prefix = ? WHERE id = ?', [prefix || null, req.orgId]);
  res.json({ prefix: await extras.orgPrefix(req.orgId) });
}));

router.post('/labels', route(async (req, res) => {
  if (!req.orgId) return res.status(422).json({ error: 'Select an organization first' });
  res.status(201).json(await extras.createLabel(req.orgId, req.userId, req.body));
}));

router.patch('/labels/:id', route(async (req, res) => {
  if (!canManageLabels(req)) return res.status(403).json({ error: 'Only admins and managers can edit labels' });
  const name = String(req.body.name || '').trim().slice(0, 40);
  const color = extras.COLORS.includes(req.body.color) ? req.body.color : null;
  if (!name && !color) return res.status(422).json({ error: 'Nothing to change' });
  await db.execute(`UPDATE task_labels SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND org_id = ?`,
    [name || null, color, Number(req.params.id), req.orgId]);
  res.json({ labels: await extras.labelsOf(req.orgId) });
}));

router.delete('/labels/:id', route(async (req, res) => {
  if (!canManageLabels(req)) return res.status(403).json({ error: 'Only admins and managers can delete labels' });
  await db.execute('DELETE FROM task_labels WHERE id = ? AND org_id = ?', [Number(req.params.id), req.orgId]);
  res.json({ labels: await extras.labelsOf(req.orgId) });
}));

// Badges for many cards at once: ?ids=1,2,3
router.get('/summary', route(async (req, res) => { res.json(await extras.summaries(req, req.query.ids)); }));
router.get('/search', route(async (req, res) => { res.json(await extras.search(req, req.query.q, req.query.team_id)); }));

router.get('/:taskId', route(async (req, res) => { res.json(await extras.detail(req, req.params.taskId)); }));

router.put('/:taskId/labels', route(async (req, res) => {
  const task = await extras.visibleTask(req, req.params.taskId);
  await extras.setLabels(task, req.body.label_ids);
  res.json(await extras.detail(req, task.id));
}));

router.post('/:taskId/subtasks', route(async (req, res) => {
  const id = await extras.addSubtask(req, req.params.taskId, req.body);
  res.status(201).json({ id, ...(await extras.detail(req, req.params.taskId)) });
}));

router.put('/:taskId/parent', route(async (req, res) => {
  await extras.setParent(req, req.params.taskId, req.body.parent_id ? Number(req.body.parent_id) : null);
  res.json(await extras.detail(req, req.params.taskId));
}));

router.post('/:taskId/links', route(async (req, res) => {
  await extras.addLink(req, req.params.taskId, req.body);
  res.status(201).json(await extras.detail(req, req.params.taskId));
}));

router.delete('/:taskId/links/:linkId', route(async (req, res) => {
  await extras.removeLink(req, req.params.taskId, req.params.linkId);
  res.json(await extras.detail(req, req.params.taskId));
}));

// Right after "Create task": its labels, parent and links in one call.
router.post('/:taskId/apply', route(async (req, res) => {
  const task = await extras.visibleTask(req, req.params.taskId);
  const problems = [];
  if (Array.isArray(req.body.label_ids) && req.body.label_ids.length) await extras.setLabels(task, req.body.label_ids);
  if (req.body.parent_id) await extras.setParent(req, task.id, Number(req.body.parent_id)).catch((e) => problems.push(e.message));
  for (const link of (Array.isArray(req.body.links) ? req.body.links : []).slice(0, 10)) {
    await extras.addLink(req, task.id, link).catch((e) => problems.push(e.message));
  }
  res.json({ ...(await extras.detail(req, task.id)), problems });
}));

module.exports = router;
