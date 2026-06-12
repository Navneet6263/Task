require('dotenv').config();
const db = require('./src/config/database');

async function migrate() {
  try {
    console.log('Adding assignee_last_viewed_at to tasks table...');
    await db.execute(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE Name = N'assignee_last_viewed_at'
        AND Object_ID = Object_ID(N'dbo.tasks')
      )
      BEGIN
        ALTER TABLE dbo.tasks ADD assignee_last_viewed_at DATETIME2 NULL;
      END
    `);
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
