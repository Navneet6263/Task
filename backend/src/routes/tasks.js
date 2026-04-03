const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const ws = require('../websocket');
const router = express.Router();

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const TASK_ISSUE_TYPES = ['task', 'bug', 'story'];
const TASK_OPTION_GROUPS = {
  task_type: 'task_types',
  product: 'products',
  category: 'categories',
};
const DEFAULT_TASK_FORM_OPTIONS = {
  task_type: [
    { label: 'Feature', parent_value: '' },
    { label: 'Improvement', parent_value: '' },
    { label: 'Testing', parent_value: '' },
    { label: 'Research', parent_value: '' },
  ],
  product: [
    { label: 'Dashboard', parent_value: '' },
    { label: 'UI/UX', parent_value: '' },
    { label: 'Backend API', parent_value: '' },
    { label: 'Mobile App', parent_value: '' },
    { label: 'Authentication', parent_value: '' },
    { label: 'Reports', parent_value: '' },
  ],
  category: [
    { label: 'New Feature', parent_value: 'Feature' },
    { label: 'Workflow', parent_value: 'Feature' },
    { label: 'Optimization', parent_value: 'Improvement' },
    { label: 'Refactor', parent_value: 'Improvement' },
    { label: 'Regression', parent_value: 'Testing' },
    { label: 'UAT', parent_value: 'Testing' },
    { label: 'Discovery', parent_value: 'Research' },
    { label: 'Documentation', parent_value: 'Research' },
  ],
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REFERENCE_IMAGE_LENGTH = 900000;

const normalizeText = (value, maxLength = 255) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizeDate = (value, fieldName) => {
  if (!value) return null;
  const normalized = String(value).trim().slice(0, 10);
  if (!DATE_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return normalized;
};

const normalizeIssueType = (value) => {
  if (!value) return 'task';
  const normalized = String(value).trim().toLowerCase();
  if (!TASK_ISSUE_TYPES.includes(normalized)) {
    throw new Error('issue_type must be task, bug, or story');
  }
  return normalized;
};

const normalizeReferenceImage = (value) => {
  if (!value) return null;
  if (typeof value !== 'string' || !value.startsWith('data:image/')) {
    throw new Error('reference_image must be a valid image');
  }
  if (value.length > MAX_REFERENCE_IMAGE_LENGTH) {
    throw new Error('Reference image is too large. Please upload a smaller image.');
  }
  return value;
};

const normalizeUserId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('assigned_to must be a valid user');
  }
  return normalized;
};

const normalizeTaskPayload = (payload = {}) => {
  const title = normalizeText(payload.title, 255);
  const description = normalizeText(payload.description, 5000);
  const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(payload.priority) ? payload.priority : 'MEDIUM';
  const taskType = normalizeText(payload.task_type, 120);
  const product = normalizeText(payload.product, 120);
  const category = normalizeText(payload.category, 120);
  const assignedDate = normalizeDate(payload.assigned_date, 'assigned_date') || new Date().toISOString().slice(0, 10);
  const startDate = normalizeDate(payload.start_date, 'start_date');
  const dueDate = normalizeDate(payload.due_date, 'due_date');

  if (startDate && dueDate && startDate > dueDate) {
    throw new Error('End date must be after start date');
  }
  if (assignedDate && dueDate && assignedDate > dueDate) {
    throw new Error('Assigned date must be on or before end date');
  }

  return {
    title,
    description,
    priority,
    issueType: normalizeIssueType(payload.issue_type),
    taskType,
    product,
    category,
    assignedDate,
    startDate,
    dueDate,
    referenceImage: normalizeReferenceImage(payload.reference_image),
  };
};

const canManageTaskForm = (role) => ['admin', 'manager', 'company_admin'].includes(role);

const formatTaskFormOptions = (rows) => {
  const grouped = { task_types: [], products: [], categories: [] };

  rows.forEach((row) => {
    const key = TASK_OPTION_GROUPS[row.option_group];
    if (!key) return;
    grouped[key].push({
      id: row.id,
      label: row.label,
      option_group: row.option_group,
      parent_value: row.parent_value || '',
      sort_order: row.sort_order || 0,
      is_active: Boolean(row.is_active),
    });
  });

  return grouped;
};

const ensureDefaultTaskFormOptions = async (orgId, userId = null) => {
  if (!orgId) return;

  const [[{ total }]] = await db.execute(
    'SELECT COUNT(*) as total FROM task_form_options WHERE org_id = ?',
    [orgId]
  );

  if (total > 0) return;

  for (const [group, options] of Object.entries(DEFAULT_TASK_FORM_OPTIONS)) {
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      await db.execute(
        `INSERT IGNORE INTO task_form_options
         (org_id, option_group, label, parent_value, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, group, option.label, option.parent_value || '', index + 1, userId]
      );
    }
  }
};

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

// Get tasks for a team with pagination
router.get('/team/:teamId', authenticate, async (req, res) => {
  try {
    let canAccess = false;

    if (req.userRole === 'admin') {
      const [[team]] = await db.execute(
        'SELECT id FROM teams WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
        [req.params.teamId, req.orgId]
      );
      canAccess = Boolean(team);
    } else if (req.userRole === 'company_admin') {
      const [[team]] = await db.execute(
        `SELECT t.id
         FROM teams t
         JOIN organizations o ON o.id = t.org_id
         WHERE t.id = ? AND t.is_deleted = FALSE AND o.company_admin_id = ?`,
        [req.params.teamId, req.companyAdminId]
      );
      canAccess = Boolean(team);
    } else {
      const [membership] = await db.execute(
        'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
        [req.params.teamId, req.userId]
      );
      canAccess = membership.length > 0;
    }

    if (!canAccess) {
      return res.status(403).json({ error: 'Not a team member', code: 'FORBIDDEN' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let where = 't.team_id = ? AND t.is_deleted = FALSE';
    let params = [req.params.teamId];
    if (status) { where += ' AND t.status = ?'; params.push(status); }

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM tasks t WHERE ${where}`, params
    );

    const [tasks] = await db.execute(
      `SELECT t.*, 
        u1.name as assigned_to_name, u1.avatar as assigned_to_avatar,
        u2.name as assigned_by_name,
        u3.name as reported_by_name,
        u4.name as picked_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.assigned_by = u2.id
       LEFT JOIN users u3 ON t.reported_by = u3.id
       LEFT JOIN users u4 ON t.picked_by = u4.id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: tasks,
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Get my tasks with pagination
router.get('/my', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.execute(
      'SELECT COUNT(*) as total FROM tasks WHERE assigned_to = ? AND is_deleted = FALSE',
      [req.userId]
    );

    const [tasks] = await db.execute(
      `SELECT t.*, te.name as team_name, u.name as assigned_by_name
       FROM tasks t
       LEFT JOIN teams te ON t.team_id = te.id
       LEFT JOIN users u ON t.assigned_by = u.id
       WHERE t.assigned_to = ? AND t.is_deleted = FALSE
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.userId, limit, offset]
    );

    res.json({
      data: tasks,
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Create task
router.post('/', authenticate, async (req, res) => {
  try {
    const { team_id } = req.body;
    const taskPayload = normalizeTaskPayload(req.body);
    const assignedTo = normalizeUserId(req.body.assigned_to);

    if (!taskPayload.title || !team_id) {
      return res.status(422).json({ error: 'title and team_id are required', code: 'VALIDATION_ERROR' });
    }

    let resolvedOrgId = req.orgId;
    let hasCreatorTeamAccess = false;

    if (req.userRole === 'company_admin') {
      const [[teamOrg]] = await db.execute(
        `SELECT t.org_id
         FROM teams t
         JOIN organizations o ON o.id = t.org_id
         WHERE t.id = ? AND t.is_deleted = FALSE AND o.company_admin_id = ?`,
        [team_id, req.companyAdminId]
      );
      if (!teamOrg) return res.status(403).json({ error: 'Team access denied', code: 'FORBIDDEN' });
      resolvedOrgId = teamOrg.org_id;
      hasCreatorTeamAccess = true;
    } else {
      const [[teamOrg]] = await db.execute(
        'SELECT org_id FROM teams WHERE id = ? AND is_deleted = FALSE',
        [team_id]
      );
      if (!teamOrg) return res.status(404).json({ error: 'Team not found', code: 'NOT_FOUND' });
      if (req.orgId && Number(teamOrg.org_id) !== Number(req.orgId)) {
        return res.status(403).json({ error: 'Team access denied', code: 'FORBIDDEN' });
      }
      resolvedOrgId = teamOrg.org_id;

      if (req.userRole === 'admin') {
        hasCreatorTeamAccess = true;
      } else {
        const [membership] = await db.execute(
          'SELECT id FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1',
          [team_id, req.userId]
        );
        hasCreatorTeamAccess = membership.length > 0;
      }
    }

    if (!resolvedOrgId) {
      return res.status(422).json({ error: 'Organization context missing', code: 'VALIDATION_ERROR' });
    }
    if (!hasCreatorTeamAccess) {
      return res.status(403).json({ error: 'You can assign tasks only in your own team', code: 'FORBIDDEN' });
    }

    if (assignedTo) {
      const [assigneeMembership] = await db.execute(
        `SELECT tm.id
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.user_id = ? AND u.org_id = ? AND u.is_deleted = FALSE
         LIMIT 1`,
        [team_id, assignedTo, resolvedOrgId]
      );
      if (assigneeMembership.length === 0) {
        return res.status(403).json({ error: 'Assignee must belong to the same team and organization', code: 'FORBIDDEN' });
      }
    }

    let taskStatus = 'TODO';
    if (assignedTo) {
      const [locked] = await db.execute(
        `SELECT id FROM tasks WHERE assigned_to = ? AND team_id = ? AND priority_locked = TRUE AND status != 'DONE' AND is_deleted = FALSE`,
        [assignedTo, team_id]
      );
      if (locked.length > 0) taskStatus = 'PENDING';
    }

    const type = taskPayload.issueType;
    const reportedBy = type === 'bug' ? req.userId : null;

    const [result] = await db.execute(
      `INSERT INTO tasks
       (title, description, priority, status, assigned_to, assigned_by, team_id, task_type, product, category, start_date, assigned_date, due_date, reference_image, org_id, issue_type, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskPayload.title,
        taskPayload.description,
        taskPayload.priority,
        taskStatus,
        assignedTo,
        req.userId,
        team_id,
        taskPayload.taskType,
        taskPayload.product,
        taskPayload.category,
        taskPayload.startDate,
        taskPayload.assignedDate,
        taskPayload.dueDate,
        taskPayload.referenceImage,
        resolvedOrgId,
        type,
        reportedBy,
      ]
    );

    await logActivity(req.userId, team_id, result.insertId, type === 'bug' ? 'Bug Reported' : 'Task Assigned', taskPayload.title,
      type === 'bug' ? `Bug reported by ${req.userId}` : 'Task assigned', 'User (Local)');

    if (assignedTo) {
      await db.execute(
        'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
        [assignedTo, 'task_assigned', `New ${type} assigned: ${taskPayload.title}`, result.insertId]
      );
    }
    ws.broadcast(team_id, 'task_created', { id: result.insertId, title: taskPayload.title, status: taskStatus, team_id, issue_type: type });
    res.status(201).json({ id: result.insertId, title: taskPayload.title, status: taskStatus, issue_type: type });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Pick a bug (developer picks it up)
router.patch('/:id/pick', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND issue_type = ? AND is_deleted = FALSE',
      [req.params.id, 'bug']
    );
    if (task.length === 0) return res.status(404).json({ error: 'Bug not found' });
    const [user] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    await db.execute(
      'UPDATE tasks SET picked_by = ?, picked_at = NOW(), assigned_to = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.userId, req.userId, 'IN_PROGRESS', req.params.id]
    );
    // Notify reporter
    if (task[0].reported_by) {
      await db.execute(
        'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
        [task[0].reported_by, 'task_updated', `${user[0].name} picked your bug: ${task[0].title}`, req.params.id]
      );
    }
    await logActivity(req.userId, task[0].team_id, req.params.id, 'Bug Picked', task[0].title, `Picked by ${user[0].name}`, 'User (Local)');
    ws.broadcast(task[0].team_id, 'task_updated', { id: req.params.id, picked_by: req.userId });
    res.json({ message: `Bug picked by ${user[0].name}` });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Resolve a bug
router.patch('/:id/resolve', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND issue_type = ? AND is_deleted = FALSE',
      [req.params.id, 'bug']
    );
    if (task.length === 0) return res.status(404).json({ error: 'Bug not found' });
    const [user] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    await db.execute(
      'UPDATE tasks SET status = ?, resolved_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['DONE', req.params.id]
    );
    if (task[0].reported_by) {
      await db.execute(
        'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
        [task[0].reported_by, 'task_updated', `Bug resolved by ${user[0].name}: ${task[0].title}`, req.params.id]
      );
    }
    await logActivity(req.userId, task[0].team_id, req.params.id, 'Bug Resolved', task[0].title, `Resolved by ${user[0].name}`, 'User (Local)');
    ws.broadcast(task[0].team_id, 'task_updated', { id: req.params.id, status: 'DONE' });
    res.json({ message: 'Bug resolved' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update task with optimistic locking
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status, priority_locked, version } = req.body;

    const [existing] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND is_deleted = FALSE', [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    }
    const currentTask = existing[0];

    if (req.userRole === 'company_admin') {
      const [[allowed]] = await db.execute(
        `SELECT t.id
         FROM tasks t
         JOIN organizations o ON o.id = t.org_id
         WHERE t.id = ? AND o.company_admin_id = ?`,
        [req.params.id, req.companyAdminId]
      );
      if (!allowed) return res.status(403).json({ error: 'Task access denied', code: 'FORBIDDEN' });
    } else if (req.userRole === 'admin') {
      if (!req.orgId || Number(currentTask.org_id) !== Number(req.orgId)) {
        return res.status(403).json({ error: 'Task access denied', code: 'FORBIDDEN' });
      }
    } else {
      const [membership] = await db.execute(
        'SELECT id FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1',
        [currentTask.team_id, req.userId]
      );
      if (membership.length === 0) {
        return res.status(403).json({ error: 'Task access denied', code: 'FORBIDDEN' });
      }
    }

    const nextAssignedTo = req.body.assigned_to === undefined
      ? currentTask.assigned_to
      : normalizeUserId(req.body.assigned_to);
    const nextTitle = req.body.title === undefined
      ? currentTask.title
      : normalizeText(req.body.title, 255);
    const nextDescription = req.body.description === undefined
      ? currentTask.description
      : normalizeText(req.body.description, 5000);
    const nextPriority = ['LOW', 'MEDIUM', 'HIGH'].includes(req.body.priority)
      ? req.body.priority
      : currentTask.priority;
    const nextStatus = TASK_STATUSES.includes(status) ? status : currentTask.status;
    const nextPriorityLocked = priority_locked === undefined
      ? Boolean(currentTask.priority_locked)
      : Boolean(priority_locked);
    const nextTaskType = req.body.task_type === undefined
      ? currentTask.task_type
      : normalizeText(req.body.task_type, 120);
    const nextProduct = req.body.product === undefined
      ? currentTask.product
      : normalizeText(req.body.product, 120);
    const nextCategory = req.body.category === undefined
      ? currentTask.category
      : normalizeText(req.body.category, 120);
    const nextAssignedDate = req.body.assigned_date === undefined
      ? currentTask.assigned_date
      : normalizeDate(req.body.assigned_date, 'assigned_date');
    const nextStartDate = req.body.start_date === undefined
      ? currentTask.start_date
      : normalizeDate(req.body.start_date, 'start_date');
    const nextDueDate = req.body.due_date === undefined
      ? currentTask.due_date
      : normalizeDate(req.body.due_date, 'due_date');
    const nextReferenceImage = req.body.reference_image === undefined
      ? currentTask.reference_image
      : normalizeReferenceImage(req.body.reference_image);

    if (!nextTitle) {
      return res.status(422).json({ error: 'title is required', code: 'VALIDATION_ERROR' });
    }
    if (nextStartDate && nextDueDate && String(nextStartDate).slice(0, 10) > String(nextDueDate).slice(0, 10)) {
      return res.status(422).json({ error: 'End date must be after start date', code: 'VALIDATION_ERROR' });
    }
    if (nextAssignedDate && nextDueDate && String(nextAssignedDate).slice(0, 10) > String(nextDueDate).slice(0, 10)) {
      return res.status(422).json({ error: 'Assigned date must be on or before end date', code: 'VALIDATION_ERROR' });
    }

    if (nextAssignedTo) {
      const [assigneeMembership] = await db.execute(
        `SELECT tm.id
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.user_id = ? AND u.org_id = ? AND u.is_deleted = FALSE
         LIMIT 1`,
        [currentTask.team_id, nextAssignedTo, currentTask.org_id]
      );
      if (assigneeMembership.length === 0) {
        return res.status(403).json({ error: 'Assignee must belong to the same team and organization', code: 'FORBIDDEN' });
      }
    }

    // Optimistic locking check
    if (version !== undefined && currentTask.version !== version) {
      return res.status(409).json({
        error: 'Task was modified by someone else. Please refresh.',
        code: 'CONFLICT',
        current_version: currentTask.version
      });
    }

    const [result] = await db.execute(
      `UPDATE tasks
       SET title=?, description=?, status=?, priority=?, priority_locked=?, assigned_to=?, task_type=?, product=?, category=?, start_date=?, assigned_date=?, due_date=?, reference_image=?, version=version+1, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND is_deleted=FALSE`,
      [
        nextTitle,
        nextDescription,
        nextStatus,
        nextPriority,
        nextPriorityLocked,
        nextAssignedTo,
        nextTaskType,
        nextProduct,
        nextCategory,
        nextStartDate,
        nextAssignedDate,
        nextDueDate,
        nextReferenceImage,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Update failed. Please refresh.', code: 'CONFLICT' });
    }

    const activity = nextStatus === 'DONE' ? 'Task Completed' : 'Task Updated';
    await logActivity(req.userId, currentTask.team_id, req.params.id, activity, nextTitle, `Task ${activity.toLowerCase()}`, 'User (Local)');
    ws.broadcast(currentTask.team_id, 'task_updated', { id: req.params.id, status: nextStatus, title: nextTitle });
    res.json({ message: 'Task updated', version: currentTask.version + 1 });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Manager assigns task within the same team and organization
router.post('/manager-assign', authenticate, async (req, res) => {
  try {
    if (req.userRole !== 'manager' && req.userRole !== 'admin')
      return res.status(403).json({ error: 'Only managers can use this' });

    const { team_id } = req.body;
    const taskPayload = normalizeTaskPayload(req.body);
    const assignedTo = normalizeUserId(req.body.assigned_to);
    if (!taskPayload.title || !assignedTo) return res.status(422).json({ error: 'title and assigned_to required' });

    // Use manager's team if team_id not provided
    let taskTeamId = team_id;
    if (!taskTeamId) {
      const [mt] = await db.execute(
        'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1', [req.userId]
      );
      taskTeamId = mt[0]?.team_id || null;
    }
    if (!taskTeamId) return res.status(422).json({ error: 'team_id required for assignment' });

    const [[team]] = await db.execute(
      'SELECT id, org_id FROM teams WHERE id = ? AND is_deleted = FALSE',
      [taskTeamId]
    );
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (req.orgId && Number(team.org_id) !== Number(req.orgId)) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    if (req.userRole === 'manager') {
      const [managerMembership] = await db.execute(
        'SELECT id FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1',
        [taskTeamId, req.userId]
      );
      if (managerMembership.length === 0) {
        return res.status(403).json({ error: 'Manager can assign only inside their own team' });
      }
    }

    const [target] = await db.execute(
      `SELECT u.id, u.name
       FROM users u
       JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
       WHERE u.id = ? AND u.org_id = ? AND u.is_deleted = FALSE`,
      [taskTeamId, assignedTo, team.org_id]
    );
    if (target.length === 0) return res.status(403).json({ error: 'Target user must be part of the same team' });

    const reportedBy = taskPayload.issueType === 'bug' ? req.userId : null;
    const [result] = await db.execute(
      `INSERT INTO tasks
       (title, description, priority, status, assigned_to, assigned_by, team_id, task_type, product, category, start_date, assigned_date, due_date, reference_image, org_id, issue_type, reported_by, manager_assigned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        taskPayload.title,
        taskPayload.description,
        taskPayload.priority,
        'TODO',
        assignedTo,
        req.userId,
        taskTeamId,
        taskPayload.taskType,
        taskPayload.product,
        taskPayload.category,
        taskPayload.startDate,
        taskPayload.assignedDate,
        taskPayload.dueDate,
        taskPayload.referenceImage,
        team.org_id,
        taskPayload.issueType,
        reportedBy,
      ]
    );

    const [mgr] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    await db.execute(
      'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
      [assignedTo, 'task_assigned', `Manager ${mgr[0].name} assigned you a task: ${taskPayload.title}`, result.insertId]
    );

    await logActivity(req.userId, taskTeamId, result.insertId, 'Task Assigned', taskPayload.title,
      `Manager ${mgr[0].name} assigned task to ${target[0].name}`, 'User (Local)');

    if (taskTeamId) ws.broadcast(taskTeamId, 'task_created', { id: result.insertId, title: taskPayload.title, assigned_to: assignedTo });
    res.status(201).json({ id: result.insertId, message: `Task assigned to ${target[0].name}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all org users for manager-assign dropdown
router.get('/org-users', authenticate, async (req, res) => {
  try {
    if (req.userRole !== 'manager' && req.userRole !== 'admin')
      return res.status(403).json({ error: 'Managers only' });
    const [users] = await db.execute(
      'SELECT id, name, email, role FROM users WHERE org_id = ? AND is_deleted = FALSE AND role != ? ORDER BY name',
      [req.orgId, 'admin']
    );
    res.json(users);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Reassign task to another team member (employee-to-employee)
router.patch('/:id/reassign', authenticate, async (req, res) => {
  try {
    const { assign_to } = req.body;
    if (!assign_to) return res.status(422).json({ error: 'assign_to required' });

    // Task must exist and belong to current user
    const [task] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND assigned_to = ? AND is_deleted = FALSE',
      [req.params.id, req.userId]
    );
    if (task.length === 0) return res.status(403).json({ error: 'You can only reassign your own tasks' });

    // assign_to must be in same team
    const [member] = await db.execute(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [task[0].team_id, assign_to]
    );
    if (member.length === 0) return res.status(403).json({ error: 'Target user is not in your team' });

    const [fromUser] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    const [toUser]   = await db.execute('SELECT name FROM users WHERE id = ?', [assign_to]);

    await db.execute(
      'UPDATE tasks SET assigned_to = ?, assigned_by = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [assign_to, req.userId, req.params.id]
    );

    const desc = `${fromUser[0].name} reassigned task to ${toUser[0].name}`;
    await logActivity(req.userId, task[0].team_id, req.params.id, 'Task Assigned', task[0].title, desc, 'User (Local)');

    // Notify new assignee
    await db.execute(
      'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
      [assign_to, 'task_assigned', `${fromUser[0].name} assigned you: ${task[0].title}`, req.params.id]
    );

    ws.broadcast(task[0].team_id, 'task_updated', { id: req.params.id, assigned_to: assign_to });
    res.json({ message: `Task reassigned to ${toUser[0].name}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Toggle priority lock
router.patch('/:id/priority-lock', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND assigned_to = ? AND is_deleted = FALSE',
      [req.params.id, req.userId]
    );
    if (task.length === 0) return res.status(403).json({ error: 'Not your task', code: 'FORBIDDEN' });

    const newLock = !task[0].priority_locked;
    await db.execute('UPDATE tasks SET priority_locked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newLock, req.params.id]);
    await logActivity(req.userId, task[0].team_id, req.params.id, 'Priority Lock',
      task[0].title, `Priority lock ${newLock ? 'activated' : 'deactivated'}`, 'User (Local)');
    res.json({ priority_locked: newLock });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Soft delete task
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT id, team_id FROM tasks WHERE id = ? AND is_deleted = FALSE', [req.params.id]
    );
    if (task.length === 0) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });

    const teamId = task[0].team_id;
    await db.execute(
      'UPDATE tasks SET is_deleted = TRUE, deleted_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]
    );
    if (teamId) ws.broadcast(teamId, 'task_deleted', { id: req.params.id });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

async function logActivity(userId, teamId, taskId, activity, taskDetails, description, automatedBy) {
  try {
    await db.execute(
      'INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, teamId, taskId, activity, taskDetails, description, automatedBy]
    );
  } catch (e) {}
}

module.exports = router;
