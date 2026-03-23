require('dotenv').config();

const { ensureCollaborationSchema } = require('./src/bootstrap/collaborationSchema');

ensureCollaborationSchema()
  .then(() => {
    console.log('Collaboration schema is ready');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
