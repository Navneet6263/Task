require('dotenv').config();
const db = require('./src/config/database');
async function run() {
  await db.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_assigned BOOLEAN DEFAULT FALSE").catch(() => {});
  console.log('✅ manager_assigned column added');
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
