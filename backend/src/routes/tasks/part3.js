const { express, db, authenticate, canAccessTeam, requireTeamAccess, getTaskDetail, listTeamTasks, ws, TASK_STATUSES, TASK_ISSUE_TYPES, normalizeText, normalizeDate, normalizeIssueType, normalizeReferenceImage, normalizeUserId, normalizeTaskPayload, canManageTaskForm, formatTaskFormOptions, ensureDefaultTaskFormOptions, TASK_OPTION_GROUPS, logActivity } = require('./taskSupport');
const router = express.Router();
const { getOrgLayout, parseCustom } = require('../../services/taskFormStore');
const { resolveTaskClient } = require('../../services/orgClients');
const { cleanCustomValues, isPastEditWindow } = require('../../services/taskFormLayout');
// Status changes stay possible after the edit window; everything else needs an admin.
const ALWAYS_EDITABLE = ['status', 'version', 'priority_locked'];
const { notifyTaskFollowers } = require('../../services/taskNotifications');

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

    if (!await requireTeamAccess(req, res, currentTask.team_id)) return;

    const layout = await getOrgLayout(currentTask.org_id);
    const isAdmin = ['admin', 'company_admin'].includes(req.userRole);
    if (layout && !isAdmin && isPastEditWindow(layout, currentTask.created_at) && Object.keys(req.body).some((key) => !ALWAYS_EDITABLE.includes(key))) {
      return res.status(423).json({ error: `This task is past its ${layout.settings.edit_window_days}-day edit window. Ask an admin to make changes.`, code: 'LOCKED' });
    }
    let nextCustomFields = currentTask.custom_fields || null;
    if (req.body.custom_fields !== undefined && layout) {
      try {
        const merged = { ...parseCustom(currentTask.custom_fields), ...cleanCustomValues(layout, req.body.custom_fields, { partial: true }) };
        nextCustomFields = Object.keys(merged).length ? JSON.stringify(merged) : null;
      } catch (error) {
        return res.status(error.status || 422).json({ error: error.message, fields: error.fields, code: 'VALIDATION_ERROR' });
      }
    }

    const nextAssignedTo = req.body.assigned_to === undefined ? currentTask.assigned_to : normalizeUserId(req.body.assigned_to);
    const nextTitle = req.body.title === undefined ? currentTask.title : normalizeText(req.body.title, 255);
    const nextDescription = req.body.description === undefined ? currentTask.description : normalizeText(req.body.description, 5000);
    const nextPriority = ['LOW', 'MEDIUM', 'HIGH'].includes(req.body.priority) ? req.body.priority : currentTask.priority;
    const nextStatus = TASK_STATUSES.includes(status) ? status : currentTask.status;
    const nextPriorityLocked = priority_locked === undefined ? Boolean(currentTask.priority_locked) : Boolean(priority_locked);
    const nextTaskType = req.body.task_type === undefined ? currentTask.task_type : normalizeText(req.body.task_type, 120);
    const nextProduct = req.body.product === undefined ? currentTask.product : normalizeText(req.body.product, 120);
    const nextCategory = req.body.category === undefined ? currentTask.category : normalizeText(req.body.category, 120);
    const nextAssignedDate = normalizeDate(req.body.assigned_date === undefined ? currentTask.assigned_date : req.body.assigned_date, 'assigned_date');
    const nextStartDate = normalizeDate(req.body.start_date === undefined ? currentTask.start_date : req.body.start_date, 'start_date');
    const nextDueDate = normalizeDate(req.body.due_date === undefined ? currentTask.due_date : req.body.due_date, 'due_date');
    const nextReferenceImage = req.body.reference_image === undefined ? currentTask.reference_image : normalizeReferenceImage(req.body.reference_image);

    let nextClientName = req.body.client_name === undefined ? currentTask.client_name : normalizeText(req.body.client_name, 255);
    if (req.body.client_name !== undefined && nextClientName !== currentTask.client_name) {
      try { nextClientName = await resolveTaskClient(currentTask.org_id, nextClientName, req.userRole, req.userId); }
      catch (error) { return res.status(error.status || 422).json({ error: error.message, fields: error.fields, code: 'VALIDATION_ERROR' }); }
    }
    const nextSeverity = req.body.severity === undefined ? currentTask.severity : normalizeText(req.body.severity, 20);
    const nextBugType = req.body.bug_type === undefined ? currentTask.bug_type : normalizeText(req.body.bug_type, 50);
    const nextEnvironment = req.body.environment === undefined ? currentTask.environment : normalizeText(req.body.environment, 30);
    const nextAffectedModule = req.body.affected_module === undefined ? currentTask.affected_module : normalizeText(req.body.affected_module, 255);
    const nextStepsToReproduce = req.body.steps_to_reproduce === undefined ? currentTask.steps_to_reproduce : normalizeText(req.body.steps_to_reproduce, 5000);
    const nextFeatureArea = req.body.feature_area === undefined ? currentTask.feature_area : normalizeText(req.body.feature_area, 50);
    const nextStoryPoints = req.body.story_points === undefined ? currentTask.story_points : normalizeText(req.body.story_points, 10);
    const nextFeaturePriority = req.body.feature_priority === undefined ? currentTask.feature_priority : normalizeText(req.body.feature_priority, 30);
    const nextAcceptanceCriteria = req.body.acceptance_criteria === undefined ? currentTask.acceptance_criteria : normalizeText(req.body.acceptance_criteria, 5000);
    const nextEnhancementType = req.body.enhancement_type === undefined ? currentTask.enhancement_type : normalizeText(req.body.enhancement_type, 50);
    const nextImpactLevel = req.body.impact_level === undefined ? currentTask.impact_level : normalizeText(req.body.impact_level, 20);
    const nextEffortEstimate = req.body.effort_estimate === undefined ? currentTask.effort_estimate : normalizeText(req.body.effort_estimate, 10);
    const nextImprovementDetail = req.body.improvement_detail === undefined ? currentTask.improvement_detail : normalizeText(req.body.improvement_detail, 5000);
    const nextStoryRole = req.body.story_role === undefined ? currentTask.story_role : normalizeText(req.body.story_role, 50);
    const nextEpic = req.body.epic === undefined ? currentTask.epic : normalizeText(req.body.epic, 255);
    const nextPersona = req.body.persona === undefined ? currentTask.persona : normalizeText(req.body.persona, 255);
    const nextStoryNotes = req.body.story_notes === undefined ? currentTask.story_notes : normalizeText(req.body.story_notes, 5000);

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
    if (version !== undefined && Number(currentTask.version) !== Number(version)) {
      return res.status(409).json({
        error: 'Task was modified by someone else. Please refresh.',
        code: 'CONFLICT',
        current_version: currentTask.version
      });
    }

    const [result] = await db.execute(
      `UPDATE tasks
       SET title=?, description=?, status=?, priority=?, priority_locked=?, assigned_to=?, task_type=?, product=?, category=?, start_date=?, assigned_date=?, due_date=?, reference_image=?, 
           client_name=?, severity=?, bug_type=?, environment=?, affected_module=?, steps_to_reproduce=?, 
           feature_area=?, story_points=?, feature_priority=?, acceptance_criteria=?, 
           enhancement_type=?, impact_level=?, effort_estimate=?, improvement_detail=?, 
           story_role=?, epic=?, persona=?, story_notes=?, custom_fields=?,
           completed_at=CASE WHEN ? = 'DONE' THEN CASE WHEN status = 'DONE' THEN completed_at ELSE CURRENT_TIMESTAMP END ELSE NULL END,
           version=version+1, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND is_deleted=FALSE AND version=?`,
      [
        nextTitle, nextDescription, nextStatus, nextPriority, nextPriorityLocked, nextAssignedTo, nextTaskType, nextProduct, nextCategory, nextStartDate, nextAssignedDate, nextDueDate, nextReferenceImage,
        nextClientName, nextSeverity, nextBugType, nextEnvironment, nextAffectedModule, nextStepsToReproduce,
        nextFeatureArea, nextStoryPoints, nextFeaturePriority, nextAcceptanceCriteria,
        nextEnhancementType, nextImpactLevel, nextEffortEstimate, nextImprovementDetail,
        nextStoryRole, nextEpic, nextPersona, nextStoryNotes, nextCustomFields,
        nextStatus, req.params.id, currentTask.version,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Update failed. Please refresh.', code: 'CONFLICT' });
    }

    const activity = nextStatus === 'DONE' && currentTask.status !== 'DONE' ? 'Task Completed' : 'Task Updated';
    await logActivity(req.userId, currentTask.team_id, req.params.id, activity, nextTitle, JSON.stringify(Object.fromEntries(Object.keys(req.body).filter(key => key !== 'version' && key !== 'reference_image' && String(currentTask[key] ?? '') !== String(req.body[key] ?? '')).map(key => [key, { before: currentTask[key] ?? null, after: req.body[key] }]))), 'User (Local)');
    ws.broadcast(currentTask.team_id, 'task_updated', { id: req.params.id, status: nextStatus, title: nextTitle });
    await notifyTaskFollowers({ ...currentTask, assigned_to: nextAssignedTo }, req.userId, `Task updated: ${nextTitle}`).catch(error => console.error('Task saved; notification delivery failed:', error.message));
    res.json({ message: 'Task updated', version: Number(currentTask.version) + 1 });
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
       (title, description, priority, status, assigned_to, assigned_by, team_id, task_type, product, category,
        start_date, assigned_date, due_date, reference_image, org_id, issue_type, reported_by, manager_assigned,
        client_name, severity, bug_type, environment, affected_module, steps_to_reproduce,
        feature_area, story_points, feature_priority, acceptance_criteria,
        enhancement_type, impact_level, effort_estimate, improvement_detail,
        story_role, epic, persona, story_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskPayload.title, taskPayload.description, taskPayload.priority, 'TODO',
        assignedTo, req.userId, taskTeamId,
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
        taskPayload.clientName, taskPayload.severity, taskPayload.bugType,
        taskPayload.environment, taskPayload.affectedModule, taskPayload.stepsToReproduce,
        taskPayload.featureArea, taskPayload.storyPoints, taskPayload.featurePriority,
        taskPayload.acceptanceCriteria, taskPayload.enhancementType, taskPayload.impactLevel,
        taskPayload.effortEstimate, taskPayload.improvementDetail,
        taskPayload.storyRole, taskPayload.epic, taskPayload.persona, taskPayload.storyNotes,
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
    if (!await requireTeamAccess(req, res, task[0].team_id)) return;

    // assign_to must be in same team
    const [member] = await db.execute(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [task[0].team_id, assign_to]
    );
    if (member.length === 0) return res.status(403).json({ error: 'Target user is not in your team' });

    const [fromUser] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    const [toUser]   = await db.execute('SELECT name FROM users WHERE id = ?', [assign_to]);

    await db.execute(
      'UPDATE tasks SET assigned_to = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [assign_to, req.params.id]
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

module.exports = router;
