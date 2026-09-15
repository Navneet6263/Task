const { express, db, authenticate, canAccessTeam, requireTeamAccess, getTaskDetail, listTeamTasks, ws, TASK_STATUSES, TASK_ISSUE_TYPES, normalizeText, normalizeDate, normalizeIssueType, normalizeReferenceImage, normalizeUserId, normalizeTaskPayload, canManageTaskForm, formatTaskFormOptions, ensureDefaultTaskFormOptions, TASK_OPTION_GROUPS, logActivity } = require('./taskSupport');
const router = express.Router();

router.get('/form-options', authenticate, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(422).json({ error: 'Organization context missing', code: 'VALIDATION_ERROR' });
    }

    await ensureDefaultTaskFormOptions(req.orgId, req.userId);

    const [rows] = await db.execute(
      `SELECT id, option_group, label, parent_value, sort_order, is_active
       FROM task_form_options
       WHERE org_id = ? AND is_active = TRUE
       ORDER BY option_group, sort_order, label`,
      [req.orgId]
    );

    res.json(formatTaskFormOptions(rows));
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

router.post('/form-options', authenticate, async (req, res) => {
  try {
    if (!canManageTaskForm(req.userRole)) {
      return res.status(403).json({ error: 'Only admin or manager can update task form options', code: 'FORBIDDEN' });
    }
    if (!req.orgId) {
      return res.status(422).json({ error: 'Organization context missing', code: 'VALIDATION_ERROR' });
    }

    const optionGroup = String(req.body.option_group || '').trim();
    const label = normalizeText(req.body.label, 120);
    if (!TASK_OPTION_GROUPS[optionGroup]) {
      return res.status(422).json({ error: 'option_group must be task_type, product, or category', code: 'VALIDATION_ERROR' });
    }
    if (!label) {
      return res.status(422).json({ error: 'label is required', code: 'VALIDATION_ERROR' });
    }

    await ensureDefaultTaskFormOptions(req.orgId, req.userId);

    const parentValue = optionGroup === 'category' ? (normalizeText(req.body.parent_value, 120) || '') : '';
    const sortOrder = Number.isFinite(Number(req.body.sort_order))
      ? Number(req.body.sort_order)
      : null;

    const [[position]] = await db.execute(
      `SELECT COALESCE(MAX(sort_order), 0) AS last_sort
       FROM task_form_options
       WHERE org_id = ? AND option_group = ? AND parent_value = ?`,
      [req.orgId, optionGroup, parentValue]
    );

    const [result] = await db.execute(
      `INSERT INTO task_form_options
       (org_id, option_group, label, parent_value, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.orgId, optionGroup, label, parentValue, sortOrder || Number(position?.last_sort || 0) + 1, req.userId]
    );

    res.status(201).json({
      id: result.insertId,
      option_group: optionGroup,
      label,
      parent_value: parentValue,
    });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

router.put('/form-options/:id', authenticate, async (req, res) => {
  try {
    if (!canManageTaskForm(req.userRole)) {
      return res.status(403).json({ error: 'Only admin or manager can update task form options', code: 'FORBIDDEN' });
    }
    if (!req.orgId) {
      return res.status(422).json({ error: 'Organization context missing', code: 'VALIDATION_ERROR' });
    }

    const [[existing]] = await db.execute(
      `SELECT id, option_group, label, parent_value, sort_order, is_active
       FROM task_form_options
       WHERE id = ? AND org_id = ?
       LIMIT 1`,
      [req.params.id, req.orgId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Option not found', code: 'NOT_FOUND' });
    }

    const nextGroup = TASK_OPTION_GROUPS[req.body.option_group]
      ? String(req.body.option_group).trim()
      : existing.option_group;
    const nextLabel = req.body.label === undefined
      ? existing.label
      : normalizeText(req.body.label, 120);

    if (!nextLabel) {
      return res.status(422).json({ error: 'label is required', code: 'VALIDATION_ERROR' });
    }

    const nextParentValue = nextGroup === 'category'
      ? (req.body.parent_value === undefined
          ? (existing.parent_value || '')
          : (normalizeText(req.body.parent_value, 120) || ''))
      : '';
    const nextSortOrder = Number.isFinite(Number(req.body.sort_order))
      ? Number(req.body.sort_order)
      : existing.sort_order;
    const nextIsActive = req.body.is_active === undefined ? existing.is_active : Boolean(req.body.is_active);

    await db.execute(
      `UPDATE task_form_options
       SET option_group = ?, label = ?, parent_value = ?, sort_order = ?, is_active = ?
       WHERE id = ? AND org_id = ?`,
      [nextGroup, nextLabel, nextParentValue, nextSortOrder, nextIsActive, req.params.id, req.orgId]
    );

    res.json({
      id: Number(req.params.id),
      option_group: nextGroup,
      label: nextLabel,
      parent_value: nextParentValue,
      sort_order: nextSortOrder,
      is_active: nextIsActive,
    });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

router.delete('/form-options/:id', authenticate, async (req, res) => {
  try {
    if (!canManageTaskForm(req.userRole)) {
      return res.status(403).json({ error: 'Only admin or manager can update task form options', code: 'FORBIDDEN' });
    }
    if (!req.orgId) {
      return res.status(422).json({ error: 'Organization context missing', code: 'VALIDATION_ERROR' });
    }

    const [result] = await db.execute(
      'DELETE FROM task_form_options WHERE id = ? AND org_id = ?',
      [req.params.id, req.orgId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Option not found', code: 'NOT_FOUND' });
    }

    res.json({ message: 'Option deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// GET /api/tasks/clients - Get distinct client names for autocomplete
router.get('/clients', authenticate, async (req, res) => {
  try {
    const orgId = req.orgId;
    if (!orgId) return res.status(403).json({ error: 'Org ID required' });

    const [rows] = await db.execute(
      `SELECT DISTINCT client_name 
       FROM tasks 
       WHERE org_id = ? AND client_name IS NOT NULL AND client_name != '' AND is_deleted = FALSE
         AND (? = 1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = tasks.team_id AND tm.user_id = ?))
       ORDER BY client_name ASC`,
      [orgId, ['admin', 'company_admin'].includes(req.userRole) ? 1 : 0, req.userId]
    );
    res.json(rows.map(r => r.client_name));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tasks for a team with pagination
router.get('/team/:teamId', authenticate, async (req, res) => {
  try {
    if (!await requireTeamAccess(req, res, req.params.teamId)) return;
    res.json(await listTeamTasks(req.params.teamId, req.query, req.userId));
  } catch (error) {
    res.status(error.status || 400).json({
      error: error.message,
      code: error.code || 'BAD_REQUEST',
    });
  }
});

router.get('/detail/:taskId', authenticate, async (req, res) => {
  try {
    const task = await getTaskDetail(req.params.taskId, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    if (!await requireTeamAccess(req, res, task.team_id)) return;
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Personal list uses the same bounded, filtered query and accurate summary as the dashboard.
router.get('/my', authenticate, async (req, res) => {
  try {
    res.json(await listTeamTasks(null, req.query, req.userId, req.orgId));
  } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
});

router.patch('/:id/view', authenticate, async (req, res) => {
  try {
    const task = await getTaskDetail(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!await requireTeamAccess(req, res, task.team_id)) return;
    const lastCommentId = Number(req.body.last_comment_id || 0);
    if (!Number.isSafeInteger(lastCommentId) || lastCommentId < 0 || lastCommentId > 2147483647) return res.status(422).json({ error: 'Invalid read cursor' });
    await db.execute(`MERGE task_reads WITH (HOLDLOCK) AS target
      USING (SELECT ? AS task_id, ? AS user_id,
        COALESCE((SELECT MAX(id) FROM task_comments WHERE task_id = ? AND id <= ?), 0) AS last_comment_id) AS source
      ON target.task_id = source.task_id AND target.user_id = source.user_id
      WHEN MATCHED THEN UPDATE SET last_viewed_at = CURRENT_TIMESTAMP,
        last_comment_id = CASE WHEN target.last_comment_id > source.last_comment_id THEN target.last_comment_id ELSE source.last_comment_id END
      WHEN NOT MATCHED THEN INSERT (task_id, user_id, last_viewed_at, last_comment_id)
      VALUES (source.task_id, source.user_id, CURRENT_TIMESTAMP, source.last_comment_id);`, [task.id, req.userId, task.id, lastCommentId]);
    res.json({ message: 'Task marked as read' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// Create task

module.exports = router;
