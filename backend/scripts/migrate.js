require('dotenv').config();
const { ensureCollaborationSchema } = require('../src/bootstrap/collaborationSchema');
const { ensureWorkspaceSchema } = require('../src/bootstrap/workspaceSchema');
(async () => {
  try { await ensureCollaborationSchema(); await ensureWorkspaceSchema(); console.log('Migrations complete.'); process.exit(0); }
  catch (error) { console.error('Migration failed:', error.message); process.exit(1); }
})();
