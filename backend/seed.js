require('dotenv').config();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

const conn = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'task_manager',
  multipleStatements: true
});

const tables = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  mobile VARCHAR(20),
  employee_id VARCHAR(50) UNIQUE,
  role ENUM('admin','manager','person') DEFAULT 'person',
  avatar VARCHAR(10) DEFAULT NULL,
  last_active TIMESTAMP NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  team_code VARCHAR(20) UNIQUE NOT NULL,
  created_by INT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(100) DEFAULT 'Member',
  is_reporting_manager BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_team_member (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('TODO','IN_PROGRESS','DONE','PENDING') DEFAULT 'TODO',
  priority ENUM('LOW','MEDIUM','HIGH') DEFAULT 'MEDIUM',
  priority_locked BOOLEAN DEFAULT FALSE,
  assigned_to INT,
  assigned_by INT,
  team_id INT NOT NULL,
  due_date DATE,
  version INT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  team_id INT,
  task_id INT,
  activity ENUM('Task Assigned','Task Completed','Task Commented','Overdue Alert','Task Created','Task Updated','Member Joined','Priority Lock') NOT NULL,
  task_details VARCHAR(255),
  description TEXT,
  automated_by ENUM('System (AI)','User (Local)','External API') DEFAULT 'User (Local)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255),
  ip_address VARCHAR(50),
  success BOOLEAN DEFAULT FALSE,
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  task_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function run() {
  // Create tables
  await new Promise((res, rej) => conn.query(tables, err => err ? rej(err) : res()));
  console.log('✅ Tables created');

  const pass = await bcrypt.hash('password123', 10);
  const adminPass = await bcrypt.hash('admin123', 10);

  // Insert users
  const userRows = [
    ['Admin User',    'admin@navtask.com',       adminPass, null,         'ADMIN001', 'admin'],
    ['Navneet Kumar', 'navneet@visionindia.com',  pass,      '9876543210', 'EMP001',   'manager'],
    ['Baroh Singh',   'baroh@visionindia.com',    pass,      '9876543211', 'EMP002',   'person'],
    ['Hurnfandhai',   'hurn@visionindia.com',     pass,      '9876543212', 'EMP003',   'person'],
    ['Purthar Das',   'purthar@visionindia.com',  pass,      '9876543213', 'EMP004',   'person'],
    ['Barith Kumar',  'barith@visionindia.com',   pass,      '9876543214', 'EMP005',   'person'],
  ];
  for (const u of userRows) {
    await new Promise((res, rej) => conn.query(
      'INSERT IGNORE INTO users (name,email,password,mobile,employee_id,role) VALUES (?,?,?,?,?,?)', u,
      err => err ? rej(err) : res()
    ));
  }
  console.log('✅ Users inserted');

  const [users] = await new Promise((res, rej) => conn.query(
    "SELECT id,name,employee_id FROM users WHERE employee_id IN ('EMP001','EMP002','EMP003','EMP004','EMP005') ORDER BY employee_id",
    (err, r) => err ? rej(err) : res([r])
  ));
  const nId  = users.find(u => u.employee_id === 'EMP001').id;
  const bId  = users.find(u => u.employee_id === 'EMP002').id;
  const hId  = users.find(u => u.employee_id === 'EMP003').id;
  const pId  = users.find(u => u.employee_id === 'EMP004').id;
  const baId = users.find(u => u.employee_id === 'EMP005').id;

  // Insert teams
  const teamRows = [
    ['MERN Devs',       'Development', 'TMMERN01', nId],
    ['CRM Integration', 'Management',  'TMCRM002', nId],
    ['ELEMENT Project', 'Development', 'TMELEM3',  nId],
  ];
  for (const t of teamRows) {
    await new Promise((res, rej) => conn.query(
      'INSERT IGNORE INTO teams (name,type,team_code,created_by) VALUES (?,?,?,?)', t,
      err => err ? rej(err) : res()
    ));
  }
  console.log('✅ Teams inserted');

  const [teams] = await new Promise((res, rej) => conn.query(
    "SELECT id,name FROM teams WHERE team_code IN ('TMMERN01','TMCRM002','TMELEM3')",
    (err, r) => err ? rej(err) : res([r])
  ));
  const mern = teams.find(t => t.name === 'MERN Devs').id;
  const crm  = teams.find(t => t.name === 'CRM Integration').id;
  const elem = teams.find(t => t.name === 'ELEMENT Project').id;

  // Insert team members
  const members = [
    [mern, nId,  'Reporting Manager', true],
    [mern, bId,  'Member',            false],
    [mern, baId, 'Member',            false],
    [crm,  nId,  'Reporting Manager', true],
    [crm,  bId,  'UI Designer',       false],
    [crm,  pId,  'UI Designer',       false],
    [elem, nId,  'Lead Developer',    false],
    [elem, hId,  'UI Designer',       false],
    [elem, pId,  'UI Designer',       false],
    [elem, baId, 'Member',            false],
  ];
  for (const m of members) {
    await new Promise((res, rej) => conn.query(
      'INSERT IGNORE INTO team_members (team_id,user_id,role,is_reporting_manager) VALUES (?,?,?,?)', m,
      err => err ? rej(err) : res()
    ));
  }
  console.log('✅ Team members inserted');

  // Insert tasks
  const tasks = [
    ['ELEMENT Project: Fix React Hooks', 'Fix broken React hooks in ELEMENT project', 'IN_PROGRESS', 'HIGH',   nId,  nId, elem, '2026-02-28'],
    ['CRM Integration: Client Leads',    'Sync client leads with CRM system',          'IN_PROGRESS', 'MEDIUM', bId,  nId, crm,  '2026-02-22'],
    ['Java DSA Prep: Array Basics',      'Prepare array basics for DSA training',       'IN_PROGRESS', 'LOW',    hId,  nId, elem, '2026-02-28'],
    ['ELEMENT Project: Fix React Hooks', 'React hooks fix v2',                          'IN_PROGRESS', 'HIGH',   nId,  nId, mern, '2026-02-23'],
    ['CRM Integration: Client Leads',    'CRM leads sync for Purthar',                  'IN_PROGRESS', 'MEDIUM', pId,  nId, crm,  '2026-02-23'],
    ['Java DSA Prep: Array Basics',      'Array basics for Navneet',                    'TODO',        'LOW',    nId,  nId, mern, '2026-02-23'],
    ['Java DSA Prep: Array Basics',      'Array basics for Barith',                     'IN_PROGRESS', 'HIGH',   baId, nId, mern, '2026-03-25'],
    ['ELEMENT Project: Fix React Hooks', 'React hooks fix for Baroh',                   'IN_PROGRESS', 'HIGH',   bId,  nId, elem, '2026-02-28'],
    ['CRM Integration: Client Leads',    'CRM leads for Hurnfandhai',                   'DONE',        'MEDIUM', hId,  nId, crm,  '2026-03-15'],
    ['Setup CI/CD Pipeline',             'Configure GitHub Actions for auto deploy',    'TODO',        'HIGH',   baId, nId, mern, '2026-03-10'],
    ['Write Unit Tests',                 'Write Jest unit tests for API routes',        'TODO',        'MEDIUM', bId,  nId, mern, '2026-03-12'],
    ['Database Optimization',            'Add indexes and optimize slow queries',       'DONE',        'HIGH',   nId,  nId, elem, '2026-02-20'],
    ['UI Component Library',             'Build reusable React component library',      'IN_PROGRESS', 'MEDIUM', hId,  nId, elem, '2026-03-20'],
    ['API Documentation',                'Write Swagger docs for all endpoints',        'TODO',        'LOW',    pId,  nId, crm,  '2026-03-18'],
    ['Fix Login Bug',                    'Fix token expiry issue on login',             'DONE',        'HIGH',   nId,  nId, mern, '2026-02-15'],
    ['Mobile Responsive UI',             'Make dashboard mobile responsive',            'IN_PROGRESS', 'MEDIUM', bId,  nId, elem, '2026-03-22'],
    ['Redis Cache Setup',                'Setup Redis for session caching',             'TODO',        'HIGH',   hId,  nId, mern, '2026-03-28'],
    ['Email Template Design',            'Design HTML email templates',                 'TODO',        'LOW',    pId,  nId, crm,  '2026-04-01'],
  ];
  for (const t of tasks) {
    await new Promise((res, rej) => conn.query(
      'INSERT IGNORE INTO tasks (title,description,status,priority,assigned_to,assigned_by,team_id,due_date) VALUES (?,?,?,?,?,?,?,?)', t,
      err => err ? rej(err) : res()
    ));
  }
  console.log('✅ Tasks inserted');

  // Insert audit logs
  const [taskRows] = await new Promise((res, rej) => conn.query(
    'SELECT id,title,team_id,assigned_to FROM tasks ORDER BY id',
    (err, r) => err ? rej(err) : res([r])
  ));
  const acts  = ['Task Assigned', 'Task Completed', 'Task Commented', 'Overdue Alert', 'Task Updated'];
  const autos = ['System (AI)', 'User (Local)', 'External API'];
  for (let i = 0; i < taskRows.length; i++) {
    const t = taskRows[i];
    await new Promise((res, rej) => conn.query(
      'INSERT INTO audit_logs (user_id,team_id,task_id,activity,task_details,description,automated_by) VALUES (?,?,?,?,?,?,?)',
      [t.assigned_to, t.team_id, t.id, acts[i % acts.length], t.title, 'Navneet Kumar completed task: ' + t.title, autos[i % autos.length]],
      err => err ? rej(err) : res()
    ));
  }
  // Extra logs for count
  for (let i = 0; i < taskRows.length; i++) {
    const t = taskRows[i];
    await new Promise((res, rej) => conn.query(
      'INSERT INTO audit_logs (user_id,team_id,task_id,activity,task_details,description,automated_by) VALUES (?,?,?,?,?,?,?)',
      [t.assigned_to, t.team_id, t.id, acts[(i + 2) % acts.length], t.title, 'Auto logged: ' + t.title, autos[(i + 1) % autos.length]],
      err => err ? rej(err) : res()
    ));
  }
  console.log('✅ Audit logs inserted');

  // Insert notifications
  const notifData = [
    [nId,  'task_assigned', 'New task assigned: ELEMENT Project: Fix React Hooks', taskRows[0]?.id],
    [bId,  'task_assigned', 'New task assigned: CRM Integration: Client Leads',    taskRows[1]?.id],
    [hId,  'overdue',       'Task overdue: Java DSA Prep: Array Basics',            taskRows[2]?.id],
    [nId,  'task_assigned', 'New task assigned: ELEMENT Project: Fix React Hooks', taskRows[3]?.id],
    [pId,  'task_assigned', 'New task assigned: CRM Integration: Client Leads',    taskRows[4]?.id],
    [baId, 'overdue',       'Task overdue: Java DSA Prep: Array Basics',            taskRows[6]?.id],
    [bId,  'overdue',       'Task overdue: ELEMENT Project: Fix React Hooks',       taskRows[7]?.id],
  ];
  for (const n of notifData) {
    await new Promise((res, rej) => conn.query(
      'INSERT INTO notifications (user_id,type,message,task_id) VALUES (?,?,?,?)', n,
      err => err ? rej(err) : res()
    ));
  }
  console.log('✅ Notifications inserted');

  // Final counts
  const counts = await new Promise((res, rej) => conn.query(
    `SELECT 
      (SELECT COUNT(*) FROM users) as users,
      (SELECT COUNT(*) FROM teams) as teams,
      (SELECT COUNT(*) FROM team_members) as members,
      (SELECT COUNT(*) FROM tasks) as tasks,
      (SELECT COUNT(*) FROM audit_logs) as logs,
      (SELECT COUNT(*) FROM notifications) as notifs`,
    (err, r) => err ? rej(err) : res(r[0])
  ));

  console.log('\n=== SEED COMPLETE ===');
  console.log(`users=${counts.users} teams=${counts.teams} members=${counts.members} tasks=${counts.tasks} logs=${counts.logs} notifs=${counts.notifs}`);
  console.log('\nLogin credentials:');
  console.log('  Admin:   admin@navtask.com / admin123');
  console.log('  Manager: navneet@visionindia.com / password123');
  console.log('  Person:  baroh@visionindia.com / password123');

  conn.end();
}

conn.connect(err => {
  if (err) { console.error('Connection failed:', err.message); process.exit(1); }
  run().catch(e => { console.error('Seed failed:', e.message); conn.end(); process.exit(1); });
});
