const db = require('../config/database');

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

let cachedSchemaName = '';

const getSchemaName = async () => {
  if (cachedSchemaName) return cachedSchemaName;
  if (process.env.DB_NAME) {
    cachedSchemaName = process.env.DB_NAME;
    return cachedSchemaName;
  }

  const [[row]] = await db.query('SELECT DATABASE() AS schema_name');
  cachedSchemaName = row?.schema_name || '';
  return cachedSchemaName;
};

const tableExists = async (tableName) => {
  const schemaName = await getSchemaName();
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [schemaName, tableName]
  );
  return rows.length > 0;
};

const columnExists = async (tableName, columnName) => {
  const schemaName = await getSchemaName();
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [schemaName, tableName, columnName]
  );
  return rows.length > 0;
};

const indexExists = async (tableName, indexName) => {
  const schemaName = await getSchemaName();
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [schemaName, tableName, indexName]
  );
  return rows.length > 0;
};

const ensureColumn = async (tableName, columnName, definition) => {
  if (await columnExists(tableName, columnName)) return;
  await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

const ensureIndex = async (tableName, indexName, definition) => {
  if (await indexExists(tableName, indexName)) return;
  await db.query(`ALTER TABLE ${tableName} ADD ${definition}`);
};

const ensureTaskWorkspaceSchema = async () => {
  if (!(await tableExists('tasks'))) return;

  await ensureColumn('tasks', 'org_id', 'INT NULL');
  await ensureColumn('tasks', 'issue_type', `VARCHAR(50) NOT NULL DEFAULT 'task'`);
  await ensureColumn('tasks', 'reported_by', 'INT NULL');
  await ensureColumn('tasks', 'picked_by', 'INT NULL');
  await ensureColumn('tasks', 'picked_at', 'TIMESTAMP NULL DEFAULT NULL');
  await ensureColumn('tasks', 'resolved_at', 'TIMESTAMP NULL DEFAULT NULL');
  await ensureColumn('tasks', 'manager_assigned', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn('tasks', 'task_type', 'VARCHAR(120) DEFAULT NULL');
  await ensureColumn('tasks', 'product', 'VARCHAR(120) DEFAULT NULL');
  await ensureColumn('tasks', 'category', 'VARCHAR(120) DEFAULT NULL');
  await ensureColumn('tasks', 'start_date', 'DATE DEFAULT NULL');
  await ensureColumn('tasks', 'assigned_date', 'DATE DEFAULT NULL');
  await ensureColumn('tasks', 'reference_image', 'LONGTEXT DEFAULT NULL');

  await ensureIndex('tasks', 'idx_tasks_org_id', 'INDEX idx_tasks_org_id (org_id)');
  await ensureIndex('tasks', 'idx_tasks_issue_type', 'INDEX idx_tasks_issue_type (issue_type)');
  await ensureIndex('tasks', 'idx_tasks_assigned_date', 'INDEX idx_tasks_assigned_date (assigned_date)');

  if (await columnExists('teams', 'org_id')) {
    await db.query(`
      UPDATE tasks t
      JOIN teams te ON te.id = t.team_id
      SET t.org_id = te.org_id
      WHERE t.org_id IS NULL
    `);
  }

  await db.query(`
    UPDATE tasks
    SET assigned_date = DATE(created_at)
    WHERE assigned_date IS NULL
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS task_form_options (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      option_group VARCHAR(40) NOT NULL,
      label VARCHAR(120) NOT NULL,
      parent_value VARCHAR(120) DEFAULT '',
      sort_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_task_form_org_group (org_id, option_group, is_active),
      INDEX idx_task_form_parent (org_id, option_group, parent_value)
    )
  `);

  await ensureIndex(
    'task_form_options',
    'uniq_task_form_option',
    'UNIQUE KEY uniq_task_form_option (org_id, option_group, label, parent_value)'
  );
};

const ensureBaseChatTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS team_discussion_threads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      title VARCHAR(160) NOT NULL,
      created_by INT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      last_message_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_team_default (team_id, is_default),
      INDEX idx_team_last_message (team_id, last_message_at)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      user_id INT NOT NULL,
      thread_id INT NULL,
      message TEXT NOT NULL,
      reply_to INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to) REFERENCES team_messages(id) ON DELETE SET NULL,
      INDEX idx_team_id (team_id),
      INDEX idx_created_at (created_at),
      INDEX idx_thread_id (thread_id),
      INDEX idx_team_thread_created (team_id, thread_id, created_at)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_message_reads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_read (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES team_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_reads_user (user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_review_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      thread_id INT NULL,
      sharer_id INT NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      status ENUM('active', 'awaiting_review', 'approved', 'rejected', 'cancelled') DEFAULT 'active',
      decision ENUM('approved', 'rejected') DEFAULT NULL,
      ended_by INT DEFAULT NULL,
      decision_by INT DEFAULT NULL,
      decision_remark TEXT DEFAULT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL DEFAULT NULL,
      decision_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (sharer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ended_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (decision_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_review_team_status (team_id, status, started_at),
      INDEX idx_review_thread (thread_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_review_session_participants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('sharer', 'viewer') NOT NULL DEFAULT 'viewer',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      left_at TIMESTAMP NULL DEFAULT NULL,
      UNIQUE KEY unique_session_participant (session_id, user_id, role),
      FOREIGN KEY (session_id) REFERENCES team_review_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_review_participant_user (user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_review_session_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      actor_id INT DEFAULT NULL,
      event_type VARCHAR(50) NOT NULL,
      details TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES team_review_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_review_event_session (session_id, created_at)
    )
  `);
};

const ensureLegacyCompatibility = async () => {
  if (!(await tableExists('team_messages'))) return;

  await ensureColumn('team_messages', 'thread_id', 'INT NULL AFTER user_id');
  await ensureIndex('team_messages', 'idx_thread_id', 'INDEX idx_thread_id (thread_id)');
  await ensureIndex(
    'team_messages',
    'idx_team_thread_created',
    'INDEX idx_team_thread_created (team_id, thread_id, created_at)'
  );
  await ensureIndex('team_message_reads', 'idx_reads_user', 'INDEX idx_reads_user (user_id)');
};

const seedDefaultThreads = async () => {
  await db.query(`
    INSERT INTO team_discussion_threads (team_id, title, created_by, is_default, last_message_at)
    SELECT t.id, 'General', t.created_by, TRUE, CURRENT_TIMESTAMP
    FROM teams t
    WHERE t.is_deleted = FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM team_discussion_threads d
        WHERE d.team_id = t.id AND d.is_default = TRUE
      )
  `);
};

const seedDefaultTaskFormOptions = async () => {
  if (!(await tableExists('task_form_options'))) return;
  if (!(await columnExists('teams', 'org_id'))) return;

  const [orgRows] = await db.query(`
    SELECT org_id, MIN(created_by) AS created_by
    FROM teams
    WHERE org_id IS NOT NULL
    GROUP BY org_id
  `);

  for (const row of orgRows) {
    for (const [group, options] of Object.entries(DEFAULT_TASK_FORM_OPTIONS)) {
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        await db.execute(
          `INSERT IGNORE INTO task_form_options
           (org_id, option_group, label, parent_value, sort_order, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.org_id, group, option.label, option.parent_value || '', index + 1, row.created_by || null]
        );
      }
    }
  }
};

const ensureCollaborationSchema = async () => {
  await ensureBaseChatTables();
  await ensureTaskWorkspaceSchema();
  await ensureLegacyCompatibility();
  await seedDefaultThreads();
  await seedDefaultTaskFormOptions();
};

module.exports = { ensureCollaborationSchema };
