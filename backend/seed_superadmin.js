require('dotenv').config();
const db = require('./src/config/database');

async function run() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email) { console.log('❌ SUPER_ADMIN_EMAIL not set in .env'); process.exit(1); }

  // Master super admin is env-based, but insert a reference record in super_admin_users
  const [existing] = await db.execute('SELECT id FROM super_admin_users WHERE email = ?', [email]);
  if (existing.length > 0) {
    await db.execute('UPDATE super_admin_users SET name = ?, is_active = TRUE WHERE email = ?', [name, email]);
    console.log(`✅ Updated: ${name} (${email})`);
  } else {
    await db.execute('INSERT INTO super_admin_users (email, name, is_active) VALUES (?, ?, TRUE)', [email, name]);
    console.log(`✅ Created: ${name} (${email})`);
  }
  process.exit(0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
