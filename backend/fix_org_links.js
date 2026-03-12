require('dotenv').config();
const db = require('./src/config/database');

async function fix() {
  // Link Vision India + GreenCall to admin@navtask.com (id=1)
  await db.execute('UPDATE organizations SET company_admin_id = 1 WHERE id IN (1, 2)');
  console.log('Linked Vision India + GreenCall to admin@navtask.com');

  // Link Just Job to niku@gmail.com (id=2)
  await db.execute('UPDATE organizations SET company_admin_id = 2 WHERE id = 3');
  console.log('Linked Just Job to niku@gmail.com');

  const [orgs] = await db.execute('SELECT id, name, company_admin_id FROM organizations');
  console.log('Updated orgs:', JSON.stringify(orgs, null, 2));
  process.exit(0);
}

fix().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
