require('dotenv').config();
const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'task_manager',
  multipleStatements: true
});

const steps = [
  // 1. Create organizations table
  `CREATE TABLE IF NOT EXISTS organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // 2. Add org_id to users, teams, tasks
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id INT DEFAULT NULL`,
  `ALTER TABLE teams ADD COLUMN IF NOT EXISTS org_id INT DEFAULT NULL`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS org_id INT DEFAULT NULL`,

  // 3. Seed 2 orgs
  `INSERT IGNORE INTO organizations (name, slug) VALUES ('Vision India', 'vision-india'), ('GreenCall', 'greencall')`,
];

async function run() {
  for (const sql of steps) {
    await new Promise((res, rej) => conn.query(sql, err => err ? rej(err) : res()));
  }
  console.log('✅ organizations table created, org_id columns added');

  // Get org IDs
  const [orgs] = await new Promise((res, rej) =>
    conn.query('SELECT id, slug FROM organizations', (err, r) => err ? rej(err) : res([r]))
  );
  const visionId   = orgs.find(o => o.slug === 'vision-india')?.id;
  const greencallId = orgs.find(o => o.slug === 'greencall')?.id;

  // Assign existing users/teams/tasks to Vision India by default
  await new Promise((res, rej) => conn.query(
    'UPDATE users SET org_id = ? WHERE org_id IS NULL', [visionId], err => err ? rej(err) : res()
  ));
  await new Promise((res, rej) => conn.query(
    'UPDATE teams SET org_id = ? WHERE org_id IS NULL', [visionId], err => err ? rej(err) : res()
  ));
  await new Promise((res, rej) => conn.query(
    'UPDATE tasks SET org_id = ? WHERE org_id IS NULL', [visionId], err => err ? rej(err) : res()
  ));
  console.log('✅ Existing data assigned to Vision India (org_id=' + visionId + ')');
  console.log('✅ GreenCall org ready (org_id=' + greencallId + ')');

  // Show orgs
  const [result] = await new Promise((res, rej) =>
    conn.query('SELECT id, name, slug FROM organizations', (err, r) => err ? rej(err) : res([r]))
  );
  console.log('\nOrganizations:');
  result.forEach(o => console.log(`  id=${o.id}  name="${o.name}"  slug="${o.slug}"`));
  console.log('\nDone! Now update backend routes to filter by org_id.');
  conn.end();
}

conn.connect(err => {
  if (err) { console.error('Connection failed:', err.message); process.exit(1); }
  run().catch(e => { console.error('Migration failed:', e.message); conn.end(); process.exit(1); });
});
