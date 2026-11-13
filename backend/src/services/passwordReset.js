const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { strongTemporaryPassword } = require('./companyAccounts');

const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });

// Accounts nobody else may reset from a people list: the company owner's own login and co-admins.
// They change theirs themselves (or a Super Admin does).
async function protectedAccount(user) {
  const [[owner]] = await db.execute(
    `SELECT ca.email FROM organizations o JOIN company_admins ca ON ca.id = o.company_admin_id WHERE o.id = ?`, [user.org_id]);
  if (owner && String(owner.email).toLowerCase() === String(user.email).toLowerCase()) return 'This is the company admin’s own login. They change it themselves.';
  const [[co]] = await db.execute('SELECT id FROM company_co_admins WHERE user_id = ?', [user.id]).catch(() => [[null]]);
  if (co) return 'This person is a company admin. Only they can change their password.';
  return '';
}

// A new password for someone: typed by the admin, or made here. With mustChange they pick their own at next sign-in.
// Returns the password once so it can be shown; only the hash is stored.
async function resetUserPassword(user, { password, mustChange = true } = {}) {
  const blocked = await protectedAccount(user);
  if (blocked) throw fail(400, blocked);
  const typed = password === undefined || password === null ? '' : String(password);
  if (typed && typed.length < 8) throw fail(422, 'The password must be at least 8 characters', { password: 'At least 8 characters' });
  if (typed.length > 128) throw fail(422, 'The password is too long', { password: 'At most 128 characters' });
  const next = typed || strongTemporaryPassword();
  await db.execute('UPDATE users SET password = ?, must_change_password = ? WHERE id = ?', [await bcrypt.hash(next, 10), mustChange ? 1 : 0, user.id]);
  return { email: user.email, temporary_password: next, must_change_password: Boolean(mustChange) };
}

module.exports = { resetUserPassword };
