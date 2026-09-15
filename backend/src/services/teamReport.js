const db = require('../config/database');
const { parseTaskQuery } = require('./taskQueryService');

const teamReport = async (teamId, query = {}) => {
  const filters = parseTaskQuery(query);
  const dateClauses = [], params = [Number(teamId)];
  if (filters.createdFrom) { dateClauses.push('t.created_at >= CAST(? AS DATE)'); params.push(filters.createdFrom); }
  if (filters.createdTo) { dateClauses.push('t.created_at < DATEADD(DAY, 1, CAST(? AS DATE))'); params.push(filters.createdTo); }
  const [members] = await db.execute(`SELECT u.id, u.name,
    COUNT(t.id) AS total,
    COUNT(CASE WHEN t.status != 'DONE' THEN 1 END) AS active,
    COUNT(CASE WHEN t.status = 'DONE' THEN 1 END) AS completed,
    COUNT(CASE WHEN t.status != 'DONE' AND t.priority = 'HIGH' THEN 1 END) AS high_priority,
    COUNT(CASE WHEN t.status != 'DONE' AND t.due_date < CAST(GETDATE() AS DATE) THEN 1 END) AS overdue,
    COUNT(CASE WHEN t.status != 'DONE' AND t.blocked_reason IS NOT NULL THEN 1 END) AS blocked,
    COUNT(CASE WHEN t.status = 'DONE' AND t.completed_at IS NOT NULL AND t.due_date IS NOT NULL THEN 1 END) AS measured_completions,
    COUNT(CASE WHEN t.status = 'DONE' AND t.completed_at < DATEADD(DAY, 1, CAST(t.due_date AS DATE)) THEN 1 END) AS on_time
    FROM team_members tm JOIN users u ON u.id = tm.user_id AND u.is_deleted = FALSE
    LEFT JOIN tasks t ON t.assigned_to = u.id AND t.team_id = ? AND t.is_deleted = FALSE
      ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
    WHERE tm.team_id = ? GROUP BY u.id, u.name ORDER BY u.name, u.id`, [...params, Number(teamId)]);
  const totals = members.reduce((sum, member) => {
    ['total', 'active', 'completed', 'high_priority', 'overdue', 'blocked', 'measured_completions', 'on_time'].forEach(key => { sum[key] = (sum[key] || 0) + Number(member[key] || 0); });
    return sum;
  }, {});
  return { members, totals, scope: 'Assigned tasks created in the selected period. Unassigned tasks are not included.',
    measurement: 'On-time uses recorded completion time and the full due-date day. Older tasks without a completion timestamp are excluded.' };
};
module.exports = { teamReport };
