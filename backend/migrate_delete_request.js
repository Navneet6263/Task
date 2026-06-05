require('dotenv').config();
const db = require('./src/config/database');

async function migrate() {
  try {
    console.log('Adding delete_requested_by column to tasks table...');
    
    // MS SQL script to add column if it does not exist
    await db.execute(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'dbo.tasks') AND name = 'delete_requested_by'
      )
      BEGIN
        ALTER TABLE dbo.tasks ADD delete_requested_by INT NULL;
        ALTER TABLE dbo.tasks ADD CONSTRAINT FK_tasks_delete_requested_by FOREIGN KEY (delete_requested_by) REFERENCES dbo.users(id);
      END
    `);
    
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
