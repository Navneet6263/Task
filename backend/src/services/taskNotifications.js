const db = require('../config/database');
const ws = require('../websocket');
async function notifyTaskFollowers(task, actorId, message, mentionedIds = []) {
  const candidates = [...new Set([task.assigned_to, task.assigned_by, ...mentionedIds].map(Number).filter(Number.isSafeInteger))];
  const [members] = await db.execute(`SELECT DISTINCT u.id FROM team_members tm
    JOIN users u ON u.id = tm.user_id AND u.is_deleted = FALSE
    WHERE tm.team_id = ? AND u.id != ? AND
      (EXISTS (SELECT 1 FROM task_followers f WHERE f.task_id = ? AND f.user_id = u.id)
       ${candidates.length ? `OR u.id IN (${candidates.map(() => '?').join(',')})` : ''})`,
  [task.team_id, actorId, task.id, ...candidates]);
  for (const member of members) {
    await db.execute('INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
      [member.id, 'task_updated', message.slice(0, 255), task.id]);
    ws.sendToUser(member.id, 'task_updated', { id: task.id });
  }
}
module.exports = { notifyTaskFollowers };
