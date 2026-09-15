require('dotenv').config();
const db = require('../src/config/database');
const notes = [
  ...require('../src/bootstrap/releaseNotes'),
  ...(process.argv.includes('--all') ? [...require('../src/bootstrap/earlierReleaseNotes'), ...require('../src/bootstrap/workspaceReleaseNotes')] : []),
];
const { ensureUpdatesSchema } = require('../src/bootstrap/updatesSchema');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    const [organizations] = await db.execute('SELECT id, name FROM organizations ORDER BY id');
    const [admins] = await db.execute('SELECT id, name, role, org_id FROM users WHERE is_deleted = FALSE AND role IN (?, ?)', ['admin', 'company_admin']);
    const [tables] = await db.execute('SELECT name FROM sys.tables WHERE name IN (?, ?, ?)', ['workspace_updates', 'workspace_update_reads', 'update_report_tasks']);
    console.log(JSON.stringify({ organizations, admins, tables }, null, 2)); return;
  }
  if (args.includes('--schema-only')) { await ensureUpdatesSchema(); console.log('Updates schema verified. No release notes published.'); return; }
  if (args.includes('--verify')) {
    const router = require('../src/routes/updates');
    const feed = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
    // Read-only SQL smoke test of the actual feed handler; no login tokens or report writes.
    const [viewers] = await db.execute('SELECT TOP 2 MIN(id) AS id, org_id FROM users WHERE is_deleted = FALSE AND org_id IS NOT NULL GROUP BY org_id ORDER BY org_id');
    for (const { id: userId, org_id: orgId } of viewers) {
      let status = 200;
      await feed({ userId, orgId, query: {}, canPublishUpdates: true }, {
        status(code) { status = code; return this; },
        json(data) {
          if (status !== 200) throw Error(data.error);
          const imported = data.data.filter(row => notes.some(note => note.key === row.source_key));
          if (imported.length !== notes.length) throw Error('Expected imported guides are not all visible on this feed page.');
          console.log(JSON.stringify({ orgId, total: data.total, releases: imported.map(row => ({ id: row.id, published_at: row.published_at })) }));
        },
      });
    }
    return;
  }
  if (!args.includes('--publish')) {
    console.log(JSON.stringify({ audience: 'All GreenTask users', releases: notes }, null, 2)); return;
  }
  await ensureUpdatesSchema();
  for (const note of notes) {
    // HOLDLOCK plus a unique filtered index makes repeated imports safe. Never overwrite admin edits.
    await db.execute(`MERGE workspace_updates WITH (HOLDLOCK) AS target
      USING (SELECT ? AS source_key) AS source
      ON target.source_key = source.source_key
      WHEN NOT MATCHED THEN INSERT
        (org_id, source_key, title, summary, why_text, how_text, performance_text, created_by, published_at)
        VALUES (NULL, source.source_key, ?, ?, ?, ?, ?, NULL, COALESCE(CAST(? AS DATETIME2), SYSUTCDATETIME()));`,
    [note.key, note.title, note.summary, note.why_text, note.how_text, note.performance_text, note.releasedAt]);
    if (args.includes('--refresh-imported')) {
      await db.execute(`UPDATE workspace_updates SET how_text = ?, version = version + 1, updated_at = SYSUTCDATETIME()
        WHERE source_key = ? AND created_by IS NULL AND how_text != ?`, [note.how_text, note.key, note.how_text]);
    }
  }
  const [rows] = await db.execute(`SELECT id, title, source_key FROM workspace_updates WHERE source_key IN (${notes.map(() => '?').join(',')}) ORDER BY id`, notes.map(note => note.key));
  console.log(JSON.stringify({ audience: 'All GreenTask users', published: rows }, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
