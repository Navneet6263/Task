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
    INSERT INTO team_discussion_threads (team_id, title, created_by, is_default, last_message_at)
    SELECT t.id, 'General', t.created_by, 1, CURRENT_TIMESTAMP
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

const ensureCollaborationSchema = async () => {
  await backfillTaskOrgAndAssignedDate();
  await seedDefaultThreads();
  await seedDefaultTaskFormOptions();
};

module.exports = { ensureCollaborationSchema };
