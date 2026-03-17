const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const ws = require('../websocket');
const router = express.Router();

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
    const { title, description, priority, assigned_to, team_id, due_date, issue_type } = req.body;
    if (!title || !team_id) return res.status(422).json({ error: 'title and team_id are required', code: 'VALIDATION_ERROR' });

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

    if (assigned_to) {
      const [assigneeMembership] = await db.execute(
        `SELECT tm.id
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.user_id = ? AND u.org_id = ? AND u.is_deleted = FALSE
         LIMIT 1`,
        [team_id, assigned_to, resolvedOrgId]
      );
      if (assigneeMembership.length === 0) {
        return res.status(403).json({ error: 'Assignee must belong to the same team and organization', code: 'FORBIDDEN' });
      }
    }

    let taskStatus = 'TODO';
    if (assigned_to) {
      const [locked] = await db.execute(
        `SELECT id FROM tasks WHERE assigned_to = ? AND team_id = ? AND priority_locked = TRUE AND status != 'DONE' AND is_deleted = FALSE`,
        [assigned_to, team_id]
      );
      if (locked.length > 0) taskStatus = 'PENDING';
    }

    const type = issue_type || 'task';
    const reportedBy = type === 'bug' ? req.userId : null;

    const [result] = await db.execute(
      'INSERT INTO tasks (title, description, priority, status, assigned_to, assigned_by, team_id, due_date, org_id, issue_type, reported_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description, priority || 'MEDIUM', taskStatus, assigned_to || null, req.userId, team_id, due_date || null, resolvedOrgId, type, reportedBy]
    );

    await logActivity(req.userId, team_id, result.insertId, type === 'bug' ? 'Bug Reported' : 'Task Assigned', title,
      type === 'bug' ? `Bug reported by ${req.userId}` : 'Task assigned', 'User (Local)');

    if (assigned_to) {
      await db.execute(
        'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
        [assigned_to, 'task_assigned', `New ${type} assigned: ${title}`, result.insertId]
      );
    }
    ws.broadcast(team_id, 'task_created', { id: result.insertId, title, status: taskStatus, team_id, issue_type: type });
    res.status(201).json({ id: result.insertId, title, status: taskStatus, issue_type: type });
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
      'UPDATE tasks SET picked_by = ?, picked_at = NOW(), assigned_to = ?, status = ? WHERE id = ?',
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
      'UPDATE tasks SET status = ?, resolved_at = NOW() WHERE id = ?',
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
    const { title, description, status, priority, priority_locked, assigned_to, due_date, version } = req.body;

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

    if (assigned_to) {
      const [assigneeMembership] = await db.execute(
        `SELECT tm.id
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.user_id = ? AND u.org_id = ? AND u.is_deleted = FALSE
         LIMIT 1`,
        [currentTask.team_id, assigned_to, currentTask.org_id]
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
      'UPDATE tasks SET title=?, description=?, status=?, priority=?, priority_locked=?, assigned_to=?, due_date=?, version=version+1 WHERE id=? AND is_deleted=FALSE',
      [title, description, status, priority, priority_locked || false, assigned_to || null, due_date || null, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Update failed. Please refresh.', code: 'CONFLICT' });
    }

    const activity = status === 'DONE' ? 'Task Completed' : 'Task Updated';
    await logActivity(req.userId, currentTask.team_id, req.params.id, activity, title, `Task ${activity.toLowerCase()}`, 'User (Local)');
    ws.broadcast(currentTask.team_id, 'task_updated', { id: req.params.id, status, title });
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

    const { title, description, priority, assigned_to, team_id, due_date } = req.body;
    if (!title || !assigned_to) return res.status(422).json({ error: 'title and assigned_to required' });

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
      [taskTeamId, assigned_to, team.org_id]
    );
    if (target.length === 0) return res.status(403).json({ error: 'Target user must be part of the same team' });

    const [result] = await db.execute(
      'INSERT INTO tasks (title, description, priority, status, assigned_to, assigned_by, team_id, due_date, org_id, manager_assigned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)',
      [title, description || null, priority || 'MEDIUM', 'TODO', assigned_to, req.userId, taskTeamId, due_date || null, team.org_id]
    );

    const [mgr] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    await db.execute(
      'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
      [assigned_to, 'task_assigned', `Manager ${mgr[0].name} assigned you a task: ${title}`, result.insertId]
    );

    await logActivity(req.userId, taskTeamId, result.insertId, 'Task Assigned', title,
      `Manager ${mgr[0].name} assigned task to ${target[0].name}`, 'User (Local)');

    if (taskTeamId) ws.broadcast(taskTeamId, 'task_created', { id: result.insertId, title, assigned_to });
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
      'UPDATE tasks SET assigned_to = ?, assigned_by = ?, version = version + 1 WHERE id = ?',
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
    await db.execute('UPDATE tasks SET priority_locked = ? WHERE id = ?', [newLock, req.params.id]);
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
      'UPDATE tasks SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?', [req.params.id]
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
