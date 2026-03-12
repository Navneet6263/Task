require('dotenv').config();
const db = require('./src/config/database');
async function run() {
  await db.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS issue_type ENUM('task','bug','story') DEFAULT 'task'").catch(()=>{});
  await db.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reported_by INT NULL").catch(()=>{});
  await db.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS picked_by INT NULL").catch(()=>{});
  await db.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS picked_at DATETIME NULL").catch(()=>{});
  await db.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resolved_at DATETIME NULL").catch(()=>{});
  console.log('✅ issue_type, reported_by, picked_by columns added');
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
