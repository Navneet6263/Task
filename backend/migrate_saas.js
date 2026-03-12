require('dotenv').config();
const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'task_manager',
  multipleStatements: true
});

const sql = `
-- Company admins (who register their company)
CREATE TABLE IF NOT EXISTS company_admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  mobile VARCHAR(20),
  company_description TEXT,
  expected_companies INT DEFAULT 1,
  expected_managers INT DEFAULT 5,
  expected_staff INT DEFAULT 20,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  approved_at TIMESTAMP NULL,
  rejected_reason TEXT,
  -- Limits set by super admin
  max_companies INT DEFAULT 3,
  max_managers_per_company INT DEFAULT 10,
  max_staff_per_company INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link organizations to company_admin
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_admin_id INT DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status ENUM('active','suspended') DEFAULT 'active';
`;

conn.connect(err => {
  if (err) { console.error('Connection failed:', err.message); process.exit(1); }
  conn.query(sql, err => {
    if (err) { console.error('Migration failed:', err.message); process.exit(1); }
    console.log('✅ company_admins table created');
    console.log('✅ organizations updated with company_admin_id, status');
    conn.end();
  });
});
