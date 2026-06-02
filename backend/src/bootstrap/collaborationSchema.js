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

let cachedDatabaseName = '';

const getDatabaseName = async () => {
  if (cachedDatabaseName) return cachedDatabaseName;
  if (process.env.DB_NAME) {
    cachedDatabaseName = process.env.DB_NAME;
    return cachedDatabaseName;
  }

  const [[row]] = await db.query('SELECT DB_NAME() AS schema_name');
  cachedDatabaseName = row?.schema_name || '';
  return cachedDatabaseName;
};

const tableExists = async (tableName) => {
  const databaseName = await getDatabaseName();
  const [rows] = await db.execute(
    `SELECT TOP 1 1 AS found
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_CATALOG = ? AND TABLE_NAME = ?`,
    [databaseName, tableName]
  );
  return rows.length > 0;
};

const columnExists = async (tableName, columnName) => {
  const databaseName = await getDatabaseName();
  const [rows] = await db.execute(
    `SELECT TOP 1 1 AS found
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_CATALOG = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName]
  );
  return rows.length > 0;
};

const indexExists = async (tableName, indexName) => {
  const [rows] = await db.execute(
    `SELECT TOP 1 1 AS found
     FROM sys.indexes
     WHERE object_id = OBJECT_ID(?) AND name = ?`,
    [`dbo.${tableName}`, indexName]
  );
  return rows.length > 0;
};

const createIndexIfMissing = async (tableName, indexName, sql) => {
  if (!(await tableExists(tableName))) return;
  if (await indexExists(tableName, indexName)) return;
  await db.query(sql);
};

const dropIndexIfExists = async (tableName, indexName) => {
  if (!(await tableExists(tableName))) return;
  if (!(await indexExists(tableName, indexName))) return;
  await db.query(`DROP INDEX ${indexName} ON dbo.${tableName}`);
};

const backfillTaskOrgAndAssignedDate = async () => {
  if (!(await tableExists('tasks')) || !(await tableExists('teams'))) return;

  if (await columnExists('tasks', 'org_id')) {
    await db.query(`
      UPDATE t
      SET t.org_id = te.org_id
      FROM tasks t
      INNER JOIN teams te ON te.id = t.team_id
      WHERE t.org_id IS NULL
    `);
  }

  if (await columnExists('tasks', 'assigned_date')) {
    await db.query(`
      UPDATE tasks
      SET assigned_date = CAST(created_at AS DATE)
      WHERE assigned_date IS NULL
    `);
  }
};

const seedDefaultThreads = async () => {
  if (!(await tableExists('team_discussion_threads')) || !(await tableExists('teams'))) return;

  await db.query(`
    INSERT INTO team_discussion_threads (team_id, title, created_by, is_default, last_message_at, thread_type)
    SELECT t.id, 'General', t.created_by, 1, CURRENT_TIMESTAMP, 'group'
    FROM teams t
    WHERE t.is_deleted = 0
      AND NOT EXISTS (
        SELECT 1
        FROM team_discussion_threads d
        WHERE d.team_id = t.id AND d.is_default = 1
      )
  `);
};

const seedDefaultTaskFormOptions = async () => {
  if (!(await tableExists('task_form_options'))) return;
  if (!(await tableExists('teams'))) return;
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

const ensureDirectThreadSupport = async () => {
  if (!(await tableExists('team_discussion_threads'))) return;

  if (!(await columnExists('team_discussion_threads', 'thread_type'))) {
    await db.query(`
      ALTER TABLE dbo.team_discussion_threads
      ADD thread_type NVARCHAR(20) NOT NULL
        CONSTRAINT DF_team_discussion_threads_type DEFAULT 'group'
    `);
  }

  if (!(await columnExists('team_discussion_threads', 'direct_user_one'))) {
    await db.query(`
      ALTER TABLE dbo.team_discussion_threads
      ADD direct_user_one INT NULL
    `);
  }

  if (!(await columnExists('team_discussion_threads', 'direct_user_two'))) {
    await db.query(`
      ALTER TABLE dbo.team_discussion_threads
      ADD direct_user_two INT NULL
    `);
  }

  await db.query(`
    UPDATE dbo.team_discussion_threads
    SET thread_type = 'group'
    WHERE thread_type IS NULL OR LTRIM(RTRIM(thread_type)) = ''
  `);

  if (!(await indexExists('team_discussion_threads', 'idx_team_discussion_threads_type'))) {
    await db.query(`
      CREATE INDEX idx_team_discussion_threads_type
      ON dbo.team_discussion_threads(team_id, thread_type, last_message_at)
    `);
  }

  if (!(await indexExists('team_discussion_threads', 'idx_team_discussion_threads_direct_users'))) {
    await db.query(`
      CREATE INDEX idx_team_discussion_threads_direct_users
      ON dbo.team_discussion_threads(team_id, direct_user_one, direct_user_two)
    `);
  }
};

const ensurePerformanceIndexes = async () => {
  if (await tableExists('tasks')) {
    await createIndexIfMissing(
      'tasks',
      'idx_tasks_assigned_active_created',
      `CREATE INDEX idx_tasks_assigned_active_created
       ON dbo.tasks(assigned_to, created_at DESC)
       WHERE is_deleted = 0`
    );
    await createIndexIfMissing(
      'tasks',
      'idx_tasks_assigned_team_status_active',
      `CREATE INDEX idx_tasks_assigned_team_status_active
       ON dbo.tasks(assigned_to, team_id, status)
       INCLUDE (priority_locked, due_date, priority, updated_at, created_at)
       WHERE is_deleted = 0`
    );
    await createIndexIfMissing(
      'tasks',
      'idx_tasks_team_active_created',
      `CREATE INDEX idx_tasks_team_active_created
       ON dbo.tasks(team_id, created_at DESC)
       WHERE is_deleted = 0`
    );
    await createIndexIfMissing(
      'tasks',
      'idx_tasks_team_status_active_created',
      `CREATE INDEX idx_tasks_team_status_active_created
       ON dbo.tasks(team_id, status, created_at DESC)
       WHERE is_deleted = 0`
    );
    await createIndexIfMissing(
      'tasks',
      'idx_tasks_org_active_created',
      `CREATE INDEX idx_tasks_org_active_created
       ON dbo.tasks(org_id, created_at DESC)
       WHERE is_deleted = 0`
    );

    await dropIndexIfExists('tasks', 'idx_tasks_assigned_to');
    await dropIndexIfExists('tasks', 'idx_tasks_org_id');
    await dropIndexIfExists('tasks', 'idx_tasks_status');
    await dropIndexIfExists('tasks', 'idx_tasks_is_deleted');
    await dropIndexIfExists('tasks', 'idx_tasks_team_id');
    await dropIndexIfExists('tasks', 'idx_tasks_team_status');
    await dropIndexIfExists('tasks', 'idx_tasks_assigned_status');
  }

  if (await tableExists('audit_logs')) {
    await createIndexIfMissing(
      'audit_logs',
      'idx_audit_logs_user_created',
      `CREATE INDEX idx_audit_logs_user_created
       ON dbo.audit_logs(user_id, created_at DESC)`
    );
    await createIndexIfMissing(
      'audit_logs',
      'idx_audit_logs_task_activity_created',
      `CREATE INDEX idx_audit_logs_task_activity_created
       ON dbo.audit_logs(task_id, activity, created_at DESC)`
    );

    await dropIndexIfExists('audit_logs', 'idx_audit_logs_user_id');
    await dropIndexIfExists('audit_logs', 'idx_audit_logs_team_id');
    await dropIndexIfExists('audit_logs', 'idx_audit_logs_task_id');
    await dropIndexIfExists('audit_logs', 'idx_audit_logs_created_at');
  }

  if (await tableExists('notifications')) {
    await createIndexIfMissing(
      'notifications',
      'idx_notifications_user_created',
      `CREATE INDEX idx_notifications_user_created
       ON dbo.notifications(user_id, created_at DESC)`
    );

    await dropIndexIfExists('notifications', 'idx_notifications_user_id');
    await dropIndexIfExists('notifications', 'idx_notifications_is_read');
    await dropIndexIfExists('notifications', 'idx_notifications_created_at');
  }

  if (await tableExists('users')) {
    await createIndexIfMissing(
      'users',
      'idx_users_org_role_active',
      `CREATE INDEX idx_users_org_role_active
       ON dbo.users(org_id, role, is_deleted)`
    );
    await createIndexIfMissing(
      'users',
      'idx_users_last_active',
      `CREATE INDEX idx_users_last_active
       ON dbo.users(last_active)`
    );

    await dropIndexIfExists('users', 'idx_users_org_id');
    await dropIndexIfExists('users', 'idx_users_role');
  }
};

const ensureCollaborationSchema = async () => {
  await backfillTaskOrgAndAssignedDate();
  await ensureDirectThreadSupport();
  await ensurePerformanceIndexes();
  await seedDefaultThreads();
  await seedDefaultTaskFormOptions();
};

module.exports = { ensureCollaborationSchema };
