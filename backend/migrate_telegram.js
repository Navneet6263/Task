require('dotenv').config();
const db = require('./src/config/database');

(async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS telegram_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id BIGINT UNIQUE NOT NULL,
        user_id INT NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        role VARCHAR(30) NOT NULL,
        org_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_id (chat_id),
        INDEX idx_user_id (user_id)
      )
    `);
    console.log('telegram_sessions table created');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
})();
