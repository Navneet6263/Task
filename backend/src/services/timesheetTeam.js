const db = require('../config/database');

// Everyone below a person in the reporting line, however deep. Safe if the data has a loop.
function reportsUnder(rows, userId) {
  const byManager = new Map();
  rows.forEach((row) => {
    const manager = Number(row.reports_to);
    if (!byManager.has(manager)) byManager.set(manager, []);
    byManager.get(manager).push(Number(row.id));
  });
  const seen = new Set([Number(userId)]);
  const queue = [Number(userId)];
  while (queue.length) {
    (byManager.get(queue.shift()) || []).forEach((id) => {
      if (!seen.has(id)) { seen.add(id); queue.push(id); }
    });
  }
  return [...seen];
}

// A person's team, themselves included: the reporting line from the HRMS when there is one, otherwise
// the people in their teams. Memberships from "show all tasks" do not count, because those put
// everyone in every team and say nothing about who works with whom.
async function teamOf(orgId, userId) {
  const [rows] = await db.execute(
    'SELECT u.id, u.reports_to FROM users u WHERE u.org_id = ? AND u.is_deleted = 0 AND u.reports_to IS NOT NULL',
    [orgId]
  );
  const line = reportsUnder(rows || [], userId);
  if (line.length > 1) return line;
  const [members] = await db.execute(
    `SELECT DISTINCT other.user_id AS id
     FROM team_members mine
     JOIN teams t ON t.id = mine.team_id AND t.org_id = ? AND t.is_deleted = 0
     JOIN team_members other ON other.team_id = mine.team_id AND other.auto_added = 0
     JOIN users u ON u.id = other.user_id AND u.is_deleted = 0
     WHERE mine.user_id = ? AND mine.auto_added = 0`,
    [orgId, userId]
  );
  return [...new Set([Number(userId), ...(members || []).map((row) => Number(row.id))])];
}

module.exports = { reportsUnder, teamOf };
