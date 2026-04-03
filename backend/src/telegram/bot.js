const TelegramBot = require('node-telegram-bot-api');
const db = require('../config/database');

let bot = null;

// State store for multi-step flows (in-memory, per chat)
const chatState = {};

const ROLE_MENUS = {
  admin: [
    [{ text: '📋 My Tasks' }, { text: '📊 All Team Tasks' }],
    [{ text: '➕ Create Task' }, { text: '✅ Approve Video' }],
    [{ text: '🔄 Update Status' }, { text: '🚪 Logout' }],
  ],
  manager: [
    [{ text: '📋 My Tasks' }, { text: '📊 All Team Tasks' }],
    [{ text: '➕ Create Task' }, { text: '✅ Approve Video' }],
    [{ text: '🔄 Update Status' }, { text: '🚪 Logout' }],
  ],
  person: [
    [{ text: '📋 My Tasks' }, { text: '🔄 Update Status' }],
    [{ text: '🚪 Logout' }],
  ],
};

const getMenu = (role) => ({
  reply_markup: { keyboard: ROLE_MENUS[role] || ROLE_MENUS.person, resize_keyboard: true },
});

const clearState = (chatId) => { delete chatState[chatId]; };

// ─── Session helpers ───
const getSession = async (chatId) => {
  const [rows] = await db.execute(
    `SELECT TOP 1 ts.*, u.name, u.email FROM telegram_sessions ts
     JOIN users u ON u.id = ts.user_id
     WHERE ts.chat_id = ? AND ts.is_active = TRUE`,
    [chatId]
  );
  return rows[0] || null;
};

const createSession = async (chatId, user) => {
  await db.execute(
    `MERGE telegram_sessions AS target
     USING (SELECT ? AS chat_id, ? AS user_id, ? AS employee_id, ? AS role, ? AS org_id) AS source
     ON target.chat_id = source.chat_id
     WHEN MATCHED THEN
       UPDATE SET
         user_id = source.user_id,
         employee_id = source.employee_id,
         role = source.role,
         org_id = source.org_id,
         is_active = 1,
         updated_at = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (chat_id, user_id, employee_id, role, org_id, is_active)
       VALUES (source.chat_id, source.user_id, source.employee_id, source.role, source.org_id, 1);`,
    [chatId, user.id, user.employee_id, user.role, user.org_id || null]
  );
};

const destroySession = async (chatId) => {
  await db.execute('UPDATE telegram_sessions SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?', [chatId]);
};

// ─── Task helpers ───
const formatTask = (t, index) => {
  const status = { TODO: '🔴', IN_PROGRESS: '🟡', DONE: '🟢', PENDING: '🟠' }[t.status] || '⚪';
  const due = t.due_date ? ` | Due: ${String(t.due_date).slice(0, 10)}` : '';
  return `${index}. ${status} *${escMd(t.title)}*\n   Priority: ${t.priority}${due}\n   ID: \`${t.id}\``;
};

const escMd = (text) => String(text || '').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

// ─── Handlers ───

const handleStart = async (chatId) => {
  clearState(chatId);
  const session = await getSession(chatId);
  if (session) {
    return bot.sendMessage(chatId, `Welcome back, ${session.name}! 👋`, getMenu(session.role));
  }
  chatState[chatId] = { step: 'awaiting_employee_id' };
  bot.sendMessage(chatId, '👋 Welcome to Task Manager Bot!\n\nPlease enter your *Employee ID* to login:', {
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true },
  });
};

const handleEmployeeLogin = async (chatId, employeeId) => {
  const [users] = await db.execute(
    'SELECT TOP 1 id, name, email, role, employee_id, org_id FROM users WHERE employee_id = ? AND is_deleted = FALSE',
    [employeeId.trim().toUpperCase()]
  );

  if (users.length === 0) {
    clearState(chatId);
    return bot.sendMessage(chatId, '❌ Invalid Employee ID. Try again with /start');
  }

  const user = users[0];
  await createSession(chatId, user);
  clearState(chatId);
  bot.sendMessage(chatId, `✅ Logged in as *${escMd(user.name)}* (${escMd(user.role)})\n\nChoose an option:`, {
    parse_mode: 'Markdown',
    ...getMenu(user.role),
  });
};

const handleMyTasks = async (chatId, session) => {
  const [tasks] = await db.execute(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date
     FROM tasks t WHERE t.assigned_to = ? AND t.is_deleted = FALSE
     ORDER BY CASE t.status
       WHEN 'IN_PROGRESS' THEN 0
       WHEN 'TODO' THEN 1
       WHEN 'PENDING' THEN 2
       WHEN 'DONE' THEN 3
       ELSE 4
     END, t.due_date ASC LIMIT 15`,
    [session.user_id]
  );

  if (tasks.length === 0) return bot.sendMessage(chatId, '📭 No tasks assigned to you.', getMenu(session.role));

  const list = tasks.map((t, i) => formatTask(t, i + 1)).join('\n\n');
  bot.sendMessage(chatId, `📋 *Your Tasks:*\n\n${list}`, { parse_mode: 'Markdown', ...getMenu(session.role) });
};

const handleAllTeamTasks = async (chatId, session) => {
  const [teams] = await db.execute(
    'SELECT team_id FROM team_members WHERE user_id = ?', [session.user_id]
  );
  if (teams.length === 0) return bot.sendMessage(chatId, '📭 You are not in any team.', getMenu(session.role));

  const teamIds = teams.map((t) => t.team_id);
  const placeholders = teamIds.map(() => '?').join(',');
  const [tasks] = await db.execute(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, u.name as assigned_to_name
     FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.team_id IN (${placeholders}) AND t.is_deleted = FALSE
     ORDER BY t.created_at DESC LIMIT 20`,
    teamIds
  );

  if (tasks.length === 0) return bot.sendMessage(chatId, '📭 No tasks in your teams.', getMenu(session.role));

  const list = tasks.map((t, i) => {
    const assignee = t.assigned_to_name ? ` → ${escMd(t.assigned_to_name)}` : '';
    return `${formatTask(t, i + 1)}${assignee}`;
  }).join('\n\n');

  bot.sendMessage(chatId, `📊 *Team Tasks:*\n\n${list}`, { parse_mode: 'Markdown', ...getMenu(session.role) });
};

const handleCreateTaskStart = async (chatId, session) => {
  // Get user's teams
  const [teams] = await db.execute(
    `SELECT t.id, t.name FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = ? AND t.is_deleted = FALSE`,
    [session.user_id]
  );

  if (teams.length === 0) return bot.sendMessage(chatId, '❌ You are not in any team.', getMenu(session.role));

  if (teams.length === 1) {
    chatState[chatId] = { step: 'create_title', team_id: teams[0].id };
    return bot.sendMessage(chatId, `Team: *${escMd(teams[0].name)}*\n\nEnter task *title*:`, {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true },
    });
  }

  // Multiple teams — let user pick
  const buttons = teams.map((t) => [{ text: t.name, callback_data: `pick_team_${t.id}` }]);
  chatState[chatId] = { step: 'create_pick_team' };
  bot.sendMessage(chatId, 'Select a team:', { reply_markup: { inline_keyboard: buttons } });
};

// Helper: send a create-flow step with Skip + Submit buttons
const sendCreateStep = (chatId, text, extraButtons = []) => {
  const rows = [...extraButtons, [{ text: '⏭ Skip', callback_data: 'c_skip' }, { text: '✅ Submit Now', callback_data: 'c_submit' }, { text: '❌ Cancel', callback_data: 'cancel_create' }]];
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
};

const handleCreateTitle = async (chatId, text) => {
  const state = chatState[chatId];
  state.title = text.trim();
  state.step = 'create_description';
  sendCreateStep(chatId, '📝 Enter *description* (or Skip):');
};

const handleCreateDescription = async (chatId, text) => {
  chatState[chatId].description = text.trim();
  askIssueType(chatId);
};

const askIssueType = (chatId) => {
  chatState[chatId].step = 'create_issue_type';
  sendCreateStep(chatId, '🔖 Select *issue type*:', [
    [{ text: '📋 Task', callback_data: 'cit_task' }, { text: '🐛 Bug', callback_data: 'cit_bug' }, { text: '📖 Story', callback_data: 'cit_story' }],
  ]);
};

const askPriority = (chatId) => {
  chatState[chatId].step = 'create_priority';
  sendCreateStep(chatId, '🎯 Select *priority*:', [
    [{ text: '🔴 HIGH', callback_data: 'pri_HIGH' }, { text: '🟡 MEDIUM', callback_data: 'pri_MEDIUM' }, { text: '🟢 LOW', callback_data: 'pri_LOW' }],
  ]);
};

const askTaskType = async (chatId, session) => {
  chatState[chatId].step = 'create_task_type';
  const [rows] = await db.execute(
    "SELECT label FROM task_form_options WHERE org_id = ? AND option_group = 'task_type' AND is_active = TRUE ORDER BY sort_order, label",
    [session.org_id]
  );
  if (rows.length === 0) return askProduct(chatId, session);
  const btns = rows.map((r) => [{ text: r.label, callback_data: `ctt_${r.label.slice(0, 40)}` }]);
  sendCreateStep(chatId, '🏷 Select *task type*:', btns);
};

const askProduct = async (chatId, session) => {
  chatState[chatId].step = 'create_product';
  const [rows] = await db.execute(
    "SELECT label FROM task_form_options WHERE org_id = ? AND option_group = 'product' AND is_active = TRUE ORDER BY sort_order, label",
    [session.org_id]
  );
  if (rows.length === 0) return askCategory(chatId, session);
  const btns = rows.map((r) => [{ text: r.label, callback_data: `cpd_${r.label.slice(0, 40)}` }]);
  sendCreateStep(chatId, '📦 Select *product/module*:', btns);
};

const askCategory = async (chatId, session) => {
  chatState[chatId].step = 'create_category';
  let query = "SELECT label FROM task_form_options WHERE org_id = ? AND option_group = 'category' AND is_active = TRUE";
  const params = [session.org_id];
  if (chatState[chatId].task_type) { query += ' AND (parent_value = ? OR parent_value = \'\')'; params.push(chatState[chatId].task_type); }
  query += ' ORDER BY sort_order, label';
  const [rows] = await db.execute(query, params);
  if (rows.length === 0) return askAssignee(chatId, session);
  const btns = rows.map((r) => [{ text: r.label, callback_data: `cca_${r.label.slice(0, 40)}` }]);
  sendCreateStep(chatId, '📂 Select *category*:', btns);
};

const askAssignee = async (chatId, session) => {
  chatState[chatId].step = 'create_assignee';
  const [members] = await db.execute(
    'SELECT u.id, u.name FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE tm.team_id = ? AND u.is_deleted = FALSE ORDER BY u.name',
    [chatState[chatId].team_id]
  );
  if (members.length === 0) return askDueDate(chatId);
  const btns = members.map((m) => [{ text: m.name, callback_data: `cas_${m.id}` }]);
  sendCreateStep(chatId, '👤 *Assign to* (or Skip for self):', btns);
};

const askDueDate = (chatId) => {
  chatState[chatId].step = 'create_due_date';
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const d3 = new Date(today); d3.setDate(d3.getDate() + 3);
  const d7 = new Date(today); d7.setDate(d7.getDate() + 7);
  const d14 = new Date(today); d14.setDate(d14.getDate() + 14);
  sendCreateStep(chatId, '📅 Select *due date* or type (YYYY\\-MM\\-DD):', [
    [
      { text: `Today (${fmt(today)})`, callback_data: `cdu_${fmt(today)}` },
      { text: `+3 days`, callback_data: `cdu_${fmt(d3)}` },
    ],
    [
      { text: `+7 days`, callback_data: `cdu_${fmt(d7)}` },
      { text: `+14 days`, callback_data: `cdu_${fmt(d14)}` },
    ],
  ]);
};

const askImage = (chatId) => {
  chatState[chatId].step = 'create_image';
  sendCreateStep(chatId, '🖼 Send a *reference image* (photo) or Skip:');
};

const handleCreateConfirm = async (chatId, session) => {
  const s = chatState[chatId];
  const assignee = s.assigned_to || session.user_id;
  const issueType = s.issue_type || 'task';
  const reportedBy = issueType === 'bug' ? session.user_id : null;
  try {
    const [result] = await db.execute(
      `INSERT INTO tasks (title, description, priority, status, issue_type, task_type, product, category, assigned_to, assigned_by, team_id, org_id, assigned_date, start_date, due_date, reference_image, reported_by)
       VALUES (?, ?, ?, 'TODO', ?, ?, ?, ?, ?, ?, ?, ?, CAST(GETDATE() AS DATE), CAST(GETDATE() AS DATE), ?, ?, ?)`,
      [s.title, s.description || null, s.priority || 'MEDIUM', issueType, s.task_type || null, s.product || null, s.category || null, assignee, session.user_id, s.team_id, session.org_id, s.due_date || null, s.reference_image || null, reportedBy]
    );
    clearState(chatId);
    const lines = [
      `✅ *Task Created*`,
      ``,
      `*Title:* ${escMd(s.title)}`,
      s.description ? `*Desc:* ${escMd(s.description.slice(0, 60))}` : null,
      `*Type:* ${escMd(issueType)}`,
      s.task_type ? `*Task Type:* ${escMd(s.task_type)}` : null,
      s.product ? `*Product:* ${escMd(s.product)}` : null,
      s.category ? `*Category:* ${escMd(s.category)}` : null,
      `*Priority:* ${s.priority || 'MEDIUM'}`,
      s.due_date ? `*Due:* ${s.due_date}` : null,
      `*ID:* \`${result.insertId}\``,
    ].filter(Boolean).join('\n');
    bot.sendMessage(chatId, lines, { parse_mode: 'Markdown', ...getMenu(session.role) });
  } catch (e) {
    clearState(chatId);
    bot.sendMessage(chatId, `❌ Failed: ${e.message}`, getMenu(session.role));
  }
};

// Create flow: which step comes after skip
const CREATE_STEP_ORDER = [
  'create_description', 'create_issue_type', 'create_priority',
  'create_task_type', 'create_product', 'create_category',
  'create_assignee', 'create_due_date', 'create_image',
];

const advanceCreateStep = async (chatId, session) => {
  const state = chatState[chatId];
  const currentIdx = CREATE_STEP_ORDER.indexOf(state.step);
  const nextStep = CREATE_STEP_ORDER[currentIdx + 1];
  if (!nextStep) return handleCreateConfirm(chatId, session);

  switch (nextStep) {
    case 'create_description': state.step = nextStep; return sendCreateStep(chatId, '📝 Enter *description* (or Skip):');
    case 'create_issue_type': return askIssueType(chatId);
    case 'create_priority': return askPriority(chatId);
    case 'create_task_type': return askTaskType(chatId, session);
    case 'create_product': return askProduct(chatId, session);
    case 'create_category': return askCategory(chatId, session);
    case 'create_assignee': return askAssignee(chatId, session);
    case 'create_due_date': return askDueDate(chatId);
    case 'create_image': return askImage(chatId);
    default: return handleCreateConfirm(chatId, session);
  }
};

const handleUpdateStatusStart = async (chatId, session) => {
  const [tasks] = await db.execute(
    `SELECT id, title, status FROM tasks
     WHERE assigned_to = ? AND status != 'DONE' AND is_deleted = FALSE
     ORDER BY created_at DESC LIMIT 10`,
    [session.user_id]
  );

  if (tasks.length === 0) return bot.sendMessage(chatId, '📭 No active tasks to update.', getMenu(session.role));

  const buttons = tasks.map((t) => [{
    text: `${t.title.slice(0, 30)} [${t.status}]`,
    callback_data: `upd_task_${t.id}`,
  }]);

  chatState[chatId] = { step: 'update_pick_task' };
  bot.sendMessage(chatId, 'Select task to update:', { reply_markup: { inline_keyboard: buttons } });
};

const handleApproveVideoStart = async (chatId, session) => {
  // Get pending review sessions from user's teams
  const [teams] = await db.execute(
    'SELECT team_id FROM team_members WHERE user_id = ?', [session.user_id]
  );
  if (teams.length === 0) return bot.sendMessage(chatId, '📭 No teams found.', getMenu(session.role));

  const teamIds = teams.map((t) => t.team_id);
  const placeholders = teamIds.map(() => '?').join(',');

  const [sessions] = await db.execute(
    `SELECT rs.id, rs.note, rs.started_at, u.name as sharer_name, t.name as team_name
     FROM team_review_sessions rs
     JOIN users u ON u.id = rs.sharer_id
     JOIN teams t ON t.id = rs.team_id
     WHERE rs.team_id IN (${placeholders}) AND rs.status = 'awaiting_review'
     ORDER BY rs.started_at DESC LIMIT 10`,
    teamIds
  );

  if (sessions.length === 0) return bot.sendMessage(chatId, '📭 No pending video reviews.', getMenu(session.role));

  const buttons = sessions.map((s) => [{
    text: `${s.sharer_name} - ${(s.note || 'No note').slice(0, 25)} (${s.team_name})`,
    callback_data: `review_${s.id}`,
  }]);

  chatState[chatId] = { step: 'approve_pick' };
  bot.sendMessage(chatId, '🎬 *Pending Video Reviews:*\nSelect one to approve/reject:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
};

const handleLogout = async (chatId) => {
  clearState(chatId);
  await destroySession(chatId);
  bot.sendMessage(chatId, '👋 Logged out successfully. Use /start to login again.', {
    reply_markup: { remove_keyboard: true },
  });
};

// ─── Callback query handler ───
const handleCallback = async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = await getSession(chatId);
  if (!session) return bot.answerCallbackQuery(query.id, { text: 'Session expired. /start' });

  bot.answerCallbackQuery(query.id);

  // Team pick for create task
  if (data.startsWith('pick_team_')) {
    const teamId = parseInt(data.replace('pick_team_', ''));
    chatState[chatId] = { step: 'create_title', team_id: teamId };
    return bot.sendMessage(chatId, 'Enter task *title*:', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
  }

  // Skip current create step
  if (data === 'c_skip') {
    const state = chatState[chatId];
    if (!state || !state.step?.startsWith('create_')) return;
    return advanceCreateStep(chatId, session);
  }

  // Submit now from any create step
  if (data === 'c_submit') {
    const state = chatState[chatId];
    if (!state || !state.title) return bot.sendMessage(chatId, '❌ Title is required first.');
    return handleCreateConfirm(chatId, session);
  }

  if (data === 'cancel_create') {
    clearState(chatId);
    return bot.sendMessage(chatId, '❌ Cancelled.', getMenu(session.role));
  }

  // Issue type pick
  if (data.startsWith('cit_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.issue_type = data.replace('cit_', '');
    return askPriority(chatId);
  }

  // Priority pick
  if (data.startsWith('pri_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.priority = data.replace('pri_', '');
    return askTaskType(chatId, session);
  }

  // Task type pick
  if (data.startsWith('ctt_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.task_type = data.replace('ctt_', '');
    return askProduct(chatId, session);
  }

  // Product pick
  if (data.startsWith('cpd_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.product = data.replace('cpd_', '');
    return askCategory(chatId, session);
  }

  // Category pick
  if (data.startsWith('cca_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.category = data.replace('cca_', '');
    return askAssignee(chatId, session);
  }

  // Assignee pick
  if (data.startsWith('cas_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.assigned_to = parseInt(data.replace('cas_', ''));
    return askDueDate(chatId);
  }

  // Due date pick
  if (data.startsWith('cdu_')) {
    const state = chatState[chatId];
    if (!state) return;
    state.due_date = data.replace('cdu_', '');
    return askImage(chatId);
  }

  // Task pick for status update
  if (data.startsWith('upd_task_')) {
    const taskId = parseInt(data.replace('upd_task_', ''));
    chatState[chatId] = { step: 'update_pick_status', task_id: taskId };
    return bot.sendMessage(chatId, 'Select new status:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔴 TODO', callback_data: 'st_TODO' }, { text: '🟡 IN PROGRESS', callback_data: 'st_IN_PROGRESS' }],
          [{ text: '🟢 DONE', callback_data: 'st_DONE' }, { text: '🟠 PENDING', callback_data: 'st_PENDING' }],
        ],
      },
    });
  }

  // Status update
  if (data.startsWith('st_')) {
    const state = chatState[chatId];
    if (!state || state.step !== 'update_pick_status') return;
    const newStatus = data.replace('st_', '');
    try {
      await db.execute('UPDATE tasks SET status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = FALSE', [newStatus, state.task_id]);
      clearState(chatId);
      bot.sendMessage(chatId, `✅ Task status updated to *${escMd(newStatus)}*`, { parse_mode: 'Markdown', ...getMenu(session.role) });
    } catch (e) {
      clearState(chatId);
      bot.sendMessage(chatId, `❌ Failed: ${e.message}`, getMenu(session.role));
    }
    return;
  }

  // Video review approve/reject
  if (data.startsWith('review_')) {
    const sessionId = parseInt(data.replace('review_', ''));
    chatState[chatId] = { step: 'review_decision', review_session_id: sessionId };
    return bot.sendMessage(chatId, 'Choose action:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Approve', callback_data: 'rv_approve' }, { text: '❌ Reject', callback_data: 'rv_reject' }],
          [{ text: '⬅️ Back', callback_data: 'rv_cancel' }],
        ],
      },
    });
  }

  if (data === 'rv_approve' || data === 'rv_reject') {
    const state = chatState[chatId];
    if (!state || state.step !== 'review_decision') return;
    const decision = data === 'rv_approve' ? 'approved' : 'rejected';
    try {
      await db.execute(
        `UPDATE team_review_sessions SET status = ?, decision = ?, decision_by = ?, decision_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'awaiting_review'`,
        [decision, decision, session.user_id, state.review_session_id]
      );
      clearState(chatId);
      const emoji = decision === 'approved' ? '✅' : '❌';
      bot.sendMessage(chatId, `${emoji} Video review *${escMd(decision)}*`, { parse_mode: 'Markdown', ...getMenu(session.role) });
    } catch (e) {
      clearState(chatId);
      bot.sendMessage(chatId, `❌ Failed: ${e.message}`, getMenu(session.role));
    }
    return;
  }

  if (data === 'rv_cancel') {
    clearState(chatId);
    return bot.sendMessage(chatId, 'Cancelled.', getMenu(session.role));
  }
};

// ─── Photo handler for reference image ───
const handlePhoto = async (msg) => {
  const chatId = msg.chat.id;
  const state = chatState[chatId];
  if (!state || state.step !== 'create_image') return;
  const session = await getSession(chatId);
  if (!session) return;

  const photo = msg.photo[msg.photo.length - 1];
  const fileLink = await bot.getFileLink(photo.file_id);
  state.reference_image = fileLink;
  return handleCreateConfirm(chatId, session);
};

// ─── Main message handler ───
const handleMessage = async (msg) => {
  if (msg.photo) return handlePhoto(msg);
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (text === '/start') return handleStart(chatId);

  // Check if in login flow
  const state = chatState[chatId];
  if (state?.step === 'awaiting_employee_id') return handleEmployeeLogin(chatId, text);

  // Must be logged in for everything else
  const session = await getSession(chatId);
  if (!session) {
    return bot.sendMessage(chatId, '⚠️ Please login first. Send /start');
  }

  // Create task multi-step text inputs
  if (state?.step === 'create_title') return handleCreateTitle(chatId, text);
  if (state?.step === 'create_description') return handleCreateDescription(chatId, text);
  if (state?.step === 'create_due_date') {
    state.due_date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
    return askImage(chatId);
  }

  // Menu buttons
  const isAdmin = ['admin', 'manager'].includes(session.role);

  switch (text) {
    case '📋 My Tasks': return handleMyTasks(chatId, session);
    case '📊 All Team Tasks':
      if (!isAdmin) return bot.sendMessage(chatId, '❌ Access denied.', getMenu(session.role));
      return handleAllTeamTasks(chatId, session);
    case '➕ Create Task':
      if (!isAdmin) return bot.sendMessage(chatId, '❌ Access denied.', getMenu(session.role));
      return handleCreateTaskStart(chatId, session);
    case '✅ Approve Video':
      if (!isAdmin) return bot.sendMessage(chatId, '❌ Access denied.', getMenu(session.role));
      return handleApproveVideoStart(chatId, session);
    case '🔄 Update Status': return handleUpdateStatusStart(chatId, session);
    case '🚪 Logout': return handleLogout(chatId);
    default:
      bot.sendMessage(chatId, 'Use the menu buttons below 👇', getMenu(session.role));
  }
};

// ─── Init ───
const startBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN not set, bot disabled');
    return null;
  }

  bot = new TelegramBot(token, { polling: true });
  bot.on('message', handleMessage);
  bot.on('callback_query', handleCallback);
  bot.on('polling_error', (err) => console.error('[Telegram] Polling error:', err.message));

  console.log('[Telegram] Bot started ✅');
  return bot;
};

module.exports = { startBot };
