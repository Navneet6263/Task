require('dotenv').config();
const mysql = require('mysql2');
const conn = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'task_manager', multipleStatements: true
});

const sql = `
CREATE TABLE IF NOT EXISTS super_admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  added_by INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS super_admin_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_email VARCHAR(255) NOT NULL,
  actor_name VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  description TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_actor (actor_email),
  INDEX idx_created (created_at)
);
`;

conn.connect(err => {
  if (err) { console.error(err.message); process.exit(1); }
  conn.query(sql, err => {
    if (err) { console.error(err.message); process.exit(1); }
    console.log('✅ super_admin_users + super_admin_logs tables created');
    conn.end();
  });
});
