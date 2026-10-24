const { express, db, authenticate, canAccessTeam, requireTeamAccess, getTaskDetail, listTeamTasks, ws, TASK_STATUSES, TASK_ISSUE_TYPES, normalizeText, normalizeDate, normalizeIssueType, normalizeReferenceImage, normalizeUserId, normalizeTaskPayload, canManageTaskForm, formatTaskFormOptions, ensureDefaultTaskFormOptions, TASK_OPTION_GROUPS, logActivity } = require('./taskSupport');
const router = express.Router();
const { getOrgLayout } = require('../../services/taskFormStore');
const { resolveTaskClient, resolveAgent } = require('../../services/orgClients');
const { cleanCustomValues, missingCoreFields, buildTitle } = require('../../services/taskFormLayout');
const timeLogs = require('./timeLogs');

router.post('/', authenticate, async (req, res) => {
  try {
    const { team_id } = req.body;
    const taskPayload = normalizeTaskPayload(req.body);
    const assignedTo = normalizeUserId(req.body.assigned_to);

    if (!team_id) {
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

    // The client must come from the organization's list when it is "pick only" (Settings → Clients).
    try {
      taskPayload.clientName = await resolveTaskClient(resolvedOrgId, taskPayload.clientName, req.userRole, req.userId);
      taskPayload.agentFirmId = await resolveAgent(resolvedOrgId, req.body.agent_firm_id, taskPayload.clientName);
    } catch (error) {
      return res.status(error.status || 422).json({ error: error.message, fields: error.fields, code: 'VALIDATION_ERROR' });
    }

    // Organizations with a designed form: check its fields, store custom values, and log hours.
    const layout = await getOrgLayout(resolvedOrgId);
    let customFields = null;
    let loggedHours = null;
    if (layout) {
      try {
        customFields = cleanCustomValues(layout, req.body.custom_fields);
        missingCoreFields(layout, { ...req.body, client_name: taskPayload.clientName, assigned_to: assignedTo, agent_firm_id: taskPayload.agentFirmId });
      } catch (error) {
        return res.status(error.status || 422).json({ error: error.message, fields: error.fields, code: 'VALIDATION_ERROR' });
      }
      if (!taskPayload.title && layout.settings.title_pattern) {
        taskPayload.title = buildTitle(layout.settings.title_pattern, { ...customFields, client_name: taskPayload.clientName, priority: taskPayload.priority, due_date: taskPayload.dueDate });
      }
      if (layout.settings.time_tracking && req.body.hours !== undefined && req.body.hours !== null && req.body.hours !== '') {
        loggedHours = Math.round(Number(req.body.hours) * 100) / 100;
        if (!(loggedHours > 0 && loggedHours <= 24)) return res.status(422).json({ error: 'Hours worked must be more than 0 and at most 24', fields: { hours: 'Enter 0.25 to 24 hours' }, code: 'VALIDATION_ERROR' });
      }
      const hoursField = layout.fields.find((f) => f.key === 'hours' && !f.hidden);
      if (hoursField?.required && loggedHours === null) return res.status(422).json({ error: `${hoursField.label} is required`, fields: { hours: `${hoursField.label} is required` }, code: 'VALIDATION_ERROR' });
    }
    if (!taskPayload.title) {
      return res.status(422).json({ error: 'title and team_id are required', code: 'VALIDATION_ERROR' });
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
       (title, description, priority, status, assigned_to, assigned_by, team_id, task_type, product, category,
        start_date, assigned_date, due_date, reference_image, org_id, issue_type, reported_by,
        client_name, severity, bug_type, environment, affected_module, steps_to_reproduce,
        feature_area, story_points, feature_priority, acceptance_criteria,
        enhancement_type, impact_level, effort_estimate, improvement_detail,
        story_role, epic, persona, story_notes, custom_fields, agent_firm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskPayload.title, taskPayload.description, taskPayload.priority, taskStatus,
        assignedTo, req.userId, team_id,
        taskPayload.taskType, taskPayload.product, taskPayload.category,
        taskPayload.startDate, taskPayload.assignedDate, taskPayload.dueDate,
        taskPayload.referenceImage, resolvedOrgId, type, reportedBy,
        taskPayload.clientName, taskPayload.severity, taskPayload.bugType,
        taskPayload.environment, taskPayload.affectedModule, taskPayload.stepsToReproduce,
        taskPayload.featureArea, taskPayload.storyPoints, taskPayload.featurePriority,
        taskPayload.acceptanceCriteria, taskPayload.enhancementType, taskPayload.impactLevel,
        taskPayload.effortEstimate, taskPayload.improvementDetail,
        taskPayload.storyRole, taskPayload.epic, taskPayload.persona, taskPayload.storyNotes,
        customFields && Object.keys(customFields).length ? JSON.stringify(customFields) : null, taskPayload.agentFirmId ?? null,
      ]
    );

    if (loggedHours !== null) {
      // Hours go to the person doing the work when a manager or admin logs for them, otherwise to the creator.
      const worker = assignedTo && timeLogs.canLogForOthers(req.userRole) ? assignedTo : req.userId;
      const workDate = Object.entries(customFields || {}).find(([key, value]) => /date_worked|work_date/.test(key) && value)?.[1] || timeLogs.today();
      await db.execute(
        'INSERT INTO task_time_logs (org_id, task_id, user_id, hours, work_date, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [resolvedOrgId, result.insertId, worker, loggedHours, workDate > timeLogs.today() ? timeLogs.today() : workDate, null, req.userId]
      );
    }

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
    if (!await requireTeamAccess(req, res, task[0].team_id)) return;
    if (task[0].picked_by && Number(task[0].picked_by) !== Number(req.userId)) return res.status(409).json({ error: 'This bug is already picked by another teammate' });
    const [user] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    const [picked] = await db.execute(
      'UPDATE tasks SET picked_by = ?, picked_at = NOW(), assigned_to = ?, status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?',
      [req.userId, req.userId, 'IN_PROGRESS', req.params.id, task[0].version]
    );
    if (!picked.affectedRows) return res.status(409).json({ error: 'Bug changed. Refresh and try again.' });
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
    if (!await requireTeamAccess(req, res, task[0].team_id)) return;
    if (!['admin', 'company_admin'].includes(req.userRole) && Number(task[0].assigned_to) !== Number(req.userId)) return res.status(403).json({ error: 'Only the assignee or administrator can resolve this bug' });
    const [user] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    const [resolved] = await db.execute(
      'UPDATE tasks SET status = ?, resolved_at = NOW(), completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?',
      ['DONE', req.params.id, task[0].version]
    );
    if (!resolved.affectedRows) return res.status(409).json({ error: 'Bug changed. Refresh and try again.' });
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

module.exports = router;
