const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const TEAM_MESSAGE_LIMIT = 150;
const REVIEW_HISTORY_LIMIT = 20;

const canAccessTeam = async (req, teamId) => {
  if (req.userRole === 'company_admin') {
    const [[team]] = await db.execute(
      `SELECT t.id
       FROM teams t
       JOIN organizations o ON o.id = t.org_id
       WHERE t.id = ? AND t.is_deleted = FALSE AND o.company_admin_id = ?`,
      [teamId, req.companyAdminId]
    );
    return Boolean(team);
  }

  if (req.userRole === 'admin') {
    const [[team]] = await db.execute(
      'SELECT id FROM teams WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [teamId, req.orgId]
    );
    return Boolean(team);
  }

  const [membership] = await db.execute(
    'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, req.userId]
  );
  return membership.length > 0;
};

const canReviewTeam = async (req, teamId) => {
  if (['admin', 'company_admin', 'manager'].includes(req.userRole)) {
    return canAccessTeam(req, teamId);
  }

  const [[member]] = await db.execute(
    'SELECT is_reporting_manager FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, req.userId]
  );
  return Boolean(member?.is_reporting_manager);
};

const normalizeThreadType = (value) => String(value || 'group').trim().toLowerCase() || 'group';

const resolveDirectPartnerId = (thread, userId) => {
  if (normalizeThreadType(thread?.thread_type) !== 'direct') return null;
  return Number(thread.direct_user_one) === Number(userId) ? thread.direct_user_two : thread.direct_user_one;
};

const enrichThreads = async (threads, userId) => {
  if (!Array.isArray(threads) || threads.length === 0) return [];

  const partnerIds = Array.from(new Set(
    threads
      .map((thread) => resolveDirectPartnerId(thread, userId))
      .filter((value) => Number(value) > 0)
  ));

  const partnerMap = new Map();
  if (partnerIds.length > 0) {
    const placeholders = partnerIds.map(() => '?').join(',');
    const [partners] = await db.execute(
      `SELECT id, name, email, avatar, role
       FROM users
       WHERE id IN (${placeholders})`,
      partnerIds
    );
    partners.forEach((partner) => partnerMap.set(String(partner.id), partner));
  }

  return threads.map((thread) => {
    const threadType = normalizeThreadType(thread.thread_type);
    const partnerId = resolveDirectPartnerId(thread, userId);
    const partner = partnerId ? partnerMap.get(String(partnerId)) || null : null;

    return {
      ...thread,
      thread_type: threadType,
      direct_partner_id: partnerId || null,
      direct_partner_name: partner?.name || null,
      direct_partner_email: partner?.email || null,
      direct_partner_avatar: partner?.avatar || null,
      direct_partner_role: partner?.role || null,
      display_title: threadType === 'direct'
        ? (partner?.name || thread.title || 'Direct conversation')
        : thread.title,
    };
  });
};

const loadVisibleThreadRows = async (teamId, userId) => {
  const [threads] = await db.execute(
    `SELECT
        t.id,
        t.team_id,
        t.title,
        t.created_by,
        t.is_default,
        t.created_at,
        t.updated_at,
        COALESCE(t.thread_type, 'group') AS thread_type,
        t.direct_user_one,
        t.direct_user_two,
        u.name AS created_by_name,
        COALESCE(
          (
            SELECT MAX(m.created_at)
            FROM team_messages m
            WHERE m.team_id = t.team_id
              AND (
                m.thread_id = t.id
                OR (t.is_default = TRUE AND m.thread_id IS NULL)
              )
          ),
          t.last_message_at,
          t.created_at
        ) AS last_message_at,
        (
          SELECT COUNT(*)
          FROM team_messages m
          WHERE m.team_id = t.team_id
            AND (
              m.thread_id = t.id
              OR (t.is_default = TRUE AND m.thread_id IS NULL)
            )
        ) AS message_count,
        (
          SELECT TOP 1 m.message
          FROM team_messages m
          WHERE m.team_id = t.team_id
            AND (
              m.thread_id = t.id
              OR (t.is_default = TRUE AND m.thread_id IS NULL)
            )
          ORDER BY m.created_at DESC
        ) AS last_message,
        (
          SELECT COUNT(*)
          FROM team_messages m
          LEFT JOIN team_message_reads r ON r.message_id = m.id AND r.user_id = ?
          WHERE m.team_id = t.team_id
            AND (
              m.thread_id = t.id
              OR (t.is_default = TRUE AND m.thread_id IS NULL)
            )
            AND m.user_id != ?
            AND r.id IS NULL
        ) AS unread_count
      FROM team_discussion_threads t
      JOIN users u ON u.id = t.created_by
      WHERE t.team_id = ?
        AND (
          COALESCE(t.thread_type, 'group') <> 'direct'
          OR t.direct_user_one = ?
          OR t.direct_user_two = ?
        )
      ORDER BY
        CASE WHEN COALESCE(t.thread_type, 'group') = 'group' THEN 0 ELSE 1 END,
        t.is_default DESC,
        last_message_at DESC,
        t.created_at DESC`,
    [userId, userId, teamId, userId, userId]
  );

  return threads;
};

const getThreads = async (teamId, userId) => {
  await ensureDefaultThread(teamId, userId);
  const rows = await loadVisibleThreadRows(teamId, userId);
  return enrichThreads(rows, userId);
};

const getThreadById = async (teamId, threadId, userId) => {
  const [rows] = await db.execute(
    `SELECT
        t.id,
        t.team_id,
        t.title,
        t.created_by,
        t.is_default,
        t.created_at,
        t.updated_at,
        COALESCE(t.thread_type, 'group') AS thread_type,
        t.direct_user_one,
        t.direct_user_two,
        u.name AS created_by_name,
        t.last_message_at,
        0 AS message_count,
        NULL AS last_message,
        0 AS unread_count
      FROM team_discussion_threads t
      JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
        AND t.team_id = ?
        AND (
          COALESCE(t.thread_type, 'group') <> 'direct'
          OR t.direct_user_one = ?
          OR t.direct_user_two = ?
        )`,
    [threadId, teamId, userId, userId]
  );

  if (rows.length === 0) return null;
  const [thread] = await enrichThreads(rows, userId);
  return thread || null;
};

const ensureDefaultThread = async (teamId, userId) => {
  const [[existing]] = await db.execute(
    `SELECT TOP 1 id
     FROM team_discussion_threads
     WHERE team_id = ? AND is_default = TRUE
     ORDER BY id ASC`,
    [teamId]
  );

  if (existing?.id) {
    return getThreadById(teamId, existing.id, userId);
  }

  const [result] = await db.execute(
    `INSERT INTO team_discussion_threads (team_id, title, created_by, is_default, last_message_at, thread_type)
     VALUES (?, 'General', ?, TRUE, CURRENT_TIMESTAMP, 'group')`,
    [teamId, userId]
  );

  return getThreadById(teamId, result.insertId, userId);
};

const resolveThread = async (teamId, threadId, userId) => {
  if (!threadId) return ensureDefaultThread(teamId, userId);
  return getThreadById(teamId, threadId, userId);
};

const createOrGetDirectThread = async (teamId, userId, targetUserId) => {
  const targetId = Number(targetUserId);
  if (!targetId || targetId === Number(userId)) {
    throw new Error('Choose a different teammate');
  }

  const [[target]] = await db.execute(
    `SELECT u.id, u.name, u.email, u.avatar, u.role
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.user_id = ? AND u.is_deleted = FALSE`,
    [teamId, targetId]
  );

  if (!target) {
    throw new Error('Selected teammate is not available in this team');
  }

  const [firstUserId, secondUserId] = [Number(userId), targetId].sort((a, b) => a - b);
  const [[existing]] = await db.execute(
    `SELECT TOP 1 id
     FROM team_discussion_threads
     WHERE team_id = ?
       AND COALESCE(thread_type, 'group') = 'direct'
       AND direct_user_one = ?
       AND direct_user_two = ?`,
    [teamId, firstUserId, secondUserId]
  );

  if (existing?.id) {
    return getThreadById(teamId, existing.id, userId);
  }

  const [result] = await db.execute(
    `INSERT INTO team_discussion_threads
      (team_id, title, created_by, is_default, last_message_at, thread_type, direct_user_one, direct_user_two)
     VALUES (?, ?, ?, FALSE, CURRENT_TIMESTAMP, 'direct', ?, ?)`,
    [teamId, 'Direct conversation', userId, firstUserId, secondUserId]
  );

  return getThreadById(teamId, result.insertId, userId);
};

const getMessages = async (teamId, thread) => {
  const whereClause = thread?.is_default
    ? 'AND (m.thread_id = ? OR m.thread_id IS NULL)'
    : 'AND m.thread_id = ?';

  const [messages] = await db.execute(
    `SELECT
        m.id,
        m.team_id,
        m.thread_id,
        m.message,
        m.created_at,
        m.reply_to,
        COALESCE(t.thread_type, 'group') AS thread_type,
        u.id AS user_id,
        u.name AS user_name,
        rm.message AS reply_text,
        ru.name AS reply_user_name
      FROM team_messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN team_messages rm ON m.reply_to = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      LEFT JOIN team_discussion_threads t ON t.id = m.thread_id
      WHERE m.team_id = ?
      ${whereClause}
      ORDER BY m.created_at ASC
      LIMIT ${TEAM_MESSAGE_LIMIT}`,
    [teamId, thread.id]
  );

  return messages;
};

const createSessionEvent = async (sessionId, actorId, eventType, details = null) => {
  await db.execute(
    `INSERT INTO team_review_session_events (session_id, actor_id, event_type, details)
     VALUES (?, ?, ?, ?)`,
    [sessionId, actorId || null, eventType, details]
  );
};

const getSessionCore = async (sessionId) => {
  const [[session]] = await db.execute(
    `SELECT
        s.id,
        s.team_id,
        s.thread_id,
        s.sharer_id,
        s.note,
        s.status,
        s.decision,
        s.ended_by,
        s.decision_by,
        s.decision_remark,
        s.started_at,
        s.ended_at,
        s.decision_at,
        sharer.name AS sharer_name,
        ended.name AS ended_by_name,
        reviewer.name AS decision_by_name,
        th.title AS thread_title
      FROM team_review_sessions s
      JOIN users sharer ON sharer.id = s.sharer_id
      LEFT JOIN users ended ON ended.id = s.ended_by
      LEFT JOIN users reviewer ON reviewer.id = s.decision_by
      LEFT JOIN team_discussion_threads th ON th.id = s.thread_id
      WHERE s.id = ?`,
    [sessionId]
  );

  return session || null;
};

const attachParticipantsAndEvents = async (session) => {
  if (!session) return null;

  const [participants] = await db.execute(
    `SELECT
        p.id,
        p.user_id,
        p.role,
        p.joined_at,
        p.left_at,
        u.name AS user_name,
        u.role AS user_role
      FROM team_review_session_participants p
      JOIN users u ON u.id = p.user_id
      WHERE p.session_id = ?
      ORDER BY CASE WHEN p.role = 'sharer' THEN 0 ELSE 1 END, p.joined_at ASC`,
    [session.id]
  );

  const [events] = await db.execute(
    `SELECT
        e.id,
        e.event_type,
        e.details,
        e.created_at,
        e.actor_id,
        u.name AS actor_name
      FROM team_review_session_events e
      LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.session_id = ?
      ORDER BY e.created_at ASC`,
    [session.id]
  );

  return {
    ...session,
    participants,
    events,
  };
};

const getSessionDetails = async (sessionId) => {
  const session = await getSessionCore(sessionId);
  return attachParticipantsAndEvents(session);
};

const getHistory = async (teamId) => {
  const [sessions] = await db.execute(
    `SELECT id
     FROM team_review_sessions
     WHERE team_id = ?
     ORDER BY started_at DESC
     LIMIT ${REVIEW_HISTORY_LIMIT}`,
    [teamId]
  );

  const detailed = [];
  for (const session of sessions) {
    const payload = await getSessionDetails(session.id);
    if (payload) detailed.push(payload);
  }
  return detailed;
};

const getActiveSession = async (teamId) => {
  const [[session]] = await db.execute(
    `SELECT TOP 1 id
     FROM team_review_sessions
     WHERE team_id = ? AND status IN ('active', 'awaiting_review')
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, started_at DESC`,
    [teamId]
  );

  if (!session) return null;
  return getSessionDetails(session.id);
};

const broadcastSession = async (req, sessionId) => {
  const payload = await getSessionDetails(sessionId);
  const ws = req.app.get('ws');
  if (payload && ws) ws.broadcast(payload.team_id, 'review_session_updated', payload);
  return payload;
};

const getSessionById = async (sessionId) => {
  const [[session]] = await db.execute(
    `SELECT id, team_id, thread_id, sharer_id, status
     FROM team_review_sessions
     WHERE id = ?`,
    [sessionId]
  );
  return session || null;
};

router.get('/unread/counts', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT m.team_id, COUNT(*) AS unread
       FROM team_messages m
       JOIN team_members tm ON tm.team_id = m.team_id AND tm.user_id = ?
       LEFT JOIN team_message_reads r ON r.message_id = m.id AND r.user_id = ?
       LEFT JOIN team_discussion_threads t ON t.id = m.thread_id
       WHERE r.id IS NULL
         AND m.user_id != ?
         AND (
           t.id IS NULL
           OR COALESCE(t.thread_type, 'group') <> 'direct'
           OR t.direct_user_one = ?
           OR t.direct_user_two = ?
         )
       GROUP BY m.team_id`,
      [req.userId, req.userId, req.userId, req.userId, req.userId]
    );

    const counts = {};
    rows.forEach((row) => {
      counts[row.team_id] = row.unread;
    });

    res.json(counts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:teamId/threads', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const threads = await getThreads(teamId, req.userId);
    res.json({ threads });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId/threads', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(422).json({ error: 'Thread title required' });

    const [result] = await db.execute(
      `INSERT INTO team_discussion_threads (team_id, title, created_by, is_default, last_message_at, thread_type)
       VALUES (?, ?, ?, FALSE, CURRENT_TIMESTAMP, 'group')`,
      [teamId, title, req.userId]
    );

    const thread = await getThreadById(teamId, result.insertId, req.userId);
    const ws = req.app.get('ws');
    if (ws && thread) ws.broadcast(teamId, 'thread_created', thread);

    res.json(thread);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId/direct-thread', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const thread = await createOrGetDirectThread(teamId, req.userId, req.body?.target_user_id);
    if (!thread) return res.status(400).json({ error: 'Unable to create direct conversation' });

    const ws = req.app.get('ws');
    if (ws) {
      const recipients = Array.from(new Set([thread.direct_user_one, thread.direct_user_two].filter(Boolean)));
      recipients.forEach((recipientId) => ws.sendToUser(recipientId, 'thread_created', thread));
    }

    res.json(thread);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:teamId/review-sessions/active', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const session = await getActiveSession(teamId);
    res.json({
      session,
      can_review: await canReviewTeam(req, teamId),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:teamId/review-sessions', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const sessions = await getHistory(teamId);
    res.json({
      sessions,
      can_review: await canReviewTeam(req, teamId),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId/review-sessions', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const [[existing]] = await db.execute(
      `SELECT TOP 1 id
       FROM team_review_sessions
       WHERE team_id = ? AND status = 'active'
       ORDER BY started_at DESC`,
      [teamId]
    );

    if (existing) {
      return res.status(409).json({ error: 'An active review session is already running' });
    }

    const thread = await resolveThread(teamId, Number(req.body?.thread_id || 0), req.userId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const note = String(req.body?.note || '').trim() || null;
    const [result] = await db.execute(
      `INSERT INTO team_review_sessions (team_id, thread_id, sharer_id, note, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [teamId, thread.id, req.userId, note]
    );

    await db.execute(
      `MERGE team_review_session_participants AS target
       USING (SELECT ? AS session_id, ? AS user_id, 'sharer' AS role) AS source
       ON target.session_id = source.session_id
         AND target.user_id = source.user_id
         AND target.role = source.role
       WHEN MATCHED THEN
         UPDATE SET left_at = NULL
       WHEN NOT MATCHED THEN
         INSERT (session_id, user_id, role)
         VALUES (source.session_id, source.user_id, source.role);`,
      [result.insertId, req.userId]
    );

    await createSessionEvent(result.insertId, req.userId, 'session_started', note || 'Live review started');

    const payload = await broadcastSession(req, result.insertId);
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/review-sessions/:sessionId/join', authenticate, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!(await canAccessTeam(req, session.team_id))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    if (session.status !== 'active') {
      return res.status(422).json({ error: 'This session is no longer live' });
    }

    if (session.sharer_id !== req.userId) {
      await db.execute(
        `MERGE team_review_session_participants AS target
         USING (SELECT ? AS session_id, ? AS user_id, 'viewer' AS role) AS source
         ON target.session_id = source.session_id
           AND target.user_id = source.user_id
           AND target.role = source.role
         WHEN MATCHED THEN
           UPDATE SET left_at = NULL
         WHEN NOT MATCHED THEN
           INSERT (session_id, user_id, role)
           VALUES (source.session_id, source.user_id, source.role);`,
        [sessionId, req.userId]
      );

      await createSessionEvent(sessionId, req.userId, 'viewer_joined', 'Joined live review');
    }

    const payload = await broadcastSession(req, sessionId);
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/review-sessions/:sessionId/leave', authenticate, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!(await canAccessTeam(req, session.team_id))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    await db.execute(
      `UPDATE team_review_session_participants
       SET left_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND user_id = ? AND role = 'viewer' AND left_at IS NULL`,
      [sessionId, req.userId]
    );

    if (session.sharer_id !== req.userId) {
      await createSessionEvent(sessionId, req.userId, 'viewer_left', 'Left live review');
    }

    const payload = await broadcastSession(req, sessionId);
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/review-sessions/:sessionId/end', authenticate, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!(await canAccessTeam(req, session.team_id))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const canReview = await canReviewTeam(req, session.team_id);
    if (session.sharer_id !== req.userId && !canReview) {
      return res.status(403).json({ error: 'Only the sharer or a manager can end this session' });
    }

    await db.execute(
      `UPDATE team_review_sessions
       SET status = 'awaiting_review',
           ended_by = ?,
           ended_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`,
      [req.userId, sessionId]
    );

    await db.execute(
      `UPDATE team_review_session_participants
       SET left_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND left_at IS NULL`,
      [sessionId]
    );

    const reason = String(req.body?.reason || '').trim() || 'Session disconnected';
    await createSessionEvent(sessionId, req.userId, 'session_ended', reason);

    const payload = await broadcastSession(req, sessionId);
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/review-sessions/:sessionId/decision', authenticate, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const session = await getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!(await canAccessTeam(req, session.team_id))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    if (!(await canReviewTeam(req, session.team_id))) {
      return res.status(403).json({ error: 'Only a manager can review this session' });
    }

    if (session.sharer_id === req.userId) {
      return res.status(422).json({ error: 'Sharer cannot review their own session' });
    }

    if (session.status !== 'awaiting_review') {
      return res.status(422).json({ error: 'Session is not waiting for review' });
    }

    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const remark = String(req.body?.remark || '').trim();
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(422).json({ error: 'Decision must be approved or rejected' });
    }
    if (!remark) return res.status(422).json({ error: 'Remark is required' });

    await db.execute(
      `UPDATE team_review_sessions
       SET status = ?, decision = ?, decision_by = ?, decision_remark = ?, decision_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [decision, decision, req.userId, remark, sessionId]
    );

    await createSessionEvent(sessionId, req.userId, `session_${decision}`, remark);

    const payload = await broadcastSession(req, sessionId);
    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:teamId', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const thread = await resolveThread(teamId, Number(req.query.thread_id || 0), req.userId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const messages = await getMessages(teamId, thread);
    res.json({ thread, messages });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const message = String(req.body?.message || '').trim();
    const clientTempId = String(req.body?.client_temp_id || '').trim() || null;
    if (!message) return res.status(422).json({ error: 'Message required' });

    const thread = await resolveThread(teamId, Number(req.body?.thread_id || 0), req.userId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const replyTo = req.body?.reply_to ? Number(req.body.reply_to) : null;
    const [result] = await db.execute(
      `INSERT INTO team_messages (team_id, user_id, thread_id, message, reply_to)
       VALUES (?, ?, ?, ?, ?)`,
      [teamId, req.userId, thread.id, message, replyTo]
    );

    await db.execute(
      'INSERT IGNORE INTO team_message_reads (message_id, user_id) VALUES (?, ?)',
      [result.insertId, req.userId]
    );

    await db.execute(
      `UPDATE team_discussion_threads
       SET last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [thread.id]
    );

    const [[newMessage]] = await db.execute(
      `SELECT
          m.id,
          m.team_id,
          m.thread_id,
          m.message,
          m.created_at,
          m.reply_to,
          COALESCE(t.thread_type, 'group') AS thread_type,
          u.id AS user_id,
          u.name AS user_name,
          rm.message AS reply_text,
          ru.name AS reply_user_name
       FROM team_messages m
       JOIN users u ON m.user_id = u.id
       LEFT JOIN team_messages rm ON m.reply_to = rm.id
       LEFT JOIN users ru ON rm.user_id = ru.id
       LEFT JOIN team_discussion_threads t ON t.id = m.thread_id
       WHERE m.id = ?`,
      [result.insertId]
    );

    const payload = clientTempId ? { ...newMessage, client_temp_id: clientTempId } : newMessage;
    const ws = req.app.get('ws');
    if (ws && normalizeThreadType(thread.thread_type) === 'direct') {
      const recipients = Array.from(new Set([thread.direct_user_one, thread.direct_user_two].filter(Boolean)));
      recipients.forEach((recipientId) => ws.sendToUser(recipientId, 'new_message', payload));
    } else if (ws) {
      ws.broadcast(teamId, 'new_message', payload);
    }

    res.json(payload);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId/read', authenticate, async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    if (!(await canAccessTeam(req, teamId))) {
      return res.status(403).json({ error: 'Team access denied' });
    }

    const requestedThreadId = Number(req.body?.thread_id || req.query?.thread_id || 0);
    let unread = [];

    if (requestedThreadId) {
      const thread = await resolveThread(teamId, requestedThreadId, req.userId);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });

      const whereClause = thread.is_default
        ? 'AND (m.thread_id = ? OR m.thread_id IS NULL)'
        : 'AND m.thread_id = ?';

      [unread] = await db.execute(
        `SELECT m.id
         FROM team_messages m
         LEFT JOIN team_message_reads r ON r.message_id = m.id AND r.user_id = ?
         WHERE m.team_id = ? AND r.id IS NULL
         ${whereClause}`,
        [req.userId, teamId, thread.id]
      );
    } else {
      [unread] = await db.execute(
        `SELECT m.id
         FROM team_messages m
         LEFT JOIN team_message_reads r ON r.message_id = m.id AND r.user_id = ?
         LEFT JOIN team_discussion_threads t ON t.id = m.thread_id
         WHERE m.team_id = ? AND r.id IS NULL
           AND (
             t.id IS NULL
             OR COALESCE(t.thread_type, 'group') <> 'direct'
             OR t.direct_user_one = ?
             OR t.direct_user_two = ?
           )`,
        [req.userId, teamId, req.userId, req.userId]
      );
    }

    if (unread.length > 0) {
      const values = unread.map((message) => `(${message.id}, ${req.userId})`).join(',');
      await db.execute(
        `INSERT IGNORE INTO team_message_reads (message_id, user_id)
         VALUES ${values}`
      );
    }

    res.json({ marked: unread.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
