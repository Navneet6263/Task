CREATE DATABASE IF NOT EXISTS task_manager;
USE task_manager;

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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_employee_id (employee_id)
);

-- Default admin account (password: password)
INSERT IGNORE INTO users (name, email, password, role, employee_id)
VALUES ('Admin', 'admin@greentask.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'ADMIN001');

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  team_code VARCHAR(20) UNIQUE NOT NULL,
  created_by INT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_team_code (team_code),
  INDEX idx_created_by (created_by),
  INDEX idx_is_deleted (is_deleted)
);

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(100) DEFAULT 'Member',
  is_reporting_manager BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_team_member (team_id, user_id),
  INDEX idx_team_id (team_id),
  INDEX idx_user_id (user_id)
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
  org_id INT,
  issue_type VARCHAR(50) DEFAULT 'task',
  task_type VARCHAR(120),
  product VARCHAR(120),
  category VARCHAR(120),
  start_date DATE,
  assigned_date DATE,
  due_date DATE,
  reference_image LONGTEXT,
  reported_by INT,
  picked_by INT,
  picked_at TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  manager_assigned BOOLEAN DEFAULT FALSE,
  version INT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_team_id (team_id),
  INDEX idx_tasks_org_id (org_id),
  INDEX idx_status (status),
  INDEX idx_tasks_issue_type (issue_type),
  INDEX idx_tasks_assigned_date (assigned_date),
  INDEX idx_due_date (due_date),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_team_status (team_id, status),
  INDEX idx_assigned_status (assigned_to, status)
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_team_id (team_id),
  INDEX idx_created_at (created_at),
  INDEX idx_team_created (team_id, created_at)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255),
  ip_address VARCHAR(50),
  success BOOLEAN DEFAULT FALSE,
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_attempted_at (attempted_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  task_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read)
);

CREATE TABLE IF NOT EXISTS team_discussion_threads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  created_by INT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_team_default (team_id, is_default),
  INDEX idx_team_last_message (team_id, last_message_at)
);

CREATE TABLE IF NOT EXISTS team_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  thread_id INT NULL,
  message TEXT NOT NULL,
  reply_to INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to) REFERENCES team_messages(id) ON DELETE SET NULL,
  INDEX idx_team_id (team_id),
  INDEX idx_created_at (created_at),
  INDEX idx_thread_id (thread_id),
  INDEX idx_team_thread_created (team_id, thread_id, created_at)
);

CREATE TABLE IF NOT EXISTS team_message_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_read (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES team_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reads_user (user_id)
);

CREATE TABLE IF NOT EXISTS team_review_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  thread_id INT NULL,
  sharer_id INT NOT NULL,
  note VARCHAR(255) DEFAULT NULL,
  status ENUM('active', 'awaiting_review', 'approved', 'rejected', 'cancelled') DEFAULT 'active',
  decision ENUM('approved', 'rejected') DEFAULT NULL,
  ended_by INT DEFAULT NULL,
  decision_by INT DEFAULT NULL,
  decision_remark TEXT DEFAULT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL DEFAULT NULL,
  decision_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (sharer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ended_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (decision_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_review_team_status (team_id, status, started_at),
  INDEX idx_review_thread (thread_id)
);

CREATE TABLE IF NOT EXISTS team_review_session_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('sharer', 'viewer') NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY unique_session_participant (session_id, user_id, role),
  FOREIGN KEY (session_id) REFERENCES team_review_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_review_participant_user (user_id)
);

CREATE TABLE IF NOT EXISTS team_review_session_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  actor_id INT DEFAULT NULL,
  event_type VARCHAR(50) NOT NULL,
  details TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES team_review_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_review_event_session (session_id, created_at)
);

CREATE TABLE IF NOT EXISTS task_form_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  option_group VARCHAR(40) NOT NULL,
  label VARCHAR(120) NOT NULL,
  parent_value VARCHAR(120) DEFAULT '',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_task_form_option (org_id, option_group, label, parent_value),
  INDEX idx_task_form_org_group (org_id, option_group, is_active),
  INDEX idx_task_form_parent (org_id, option_group, parent_value)
);

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
  INDEX idx_tg_chat_id (chat_id),
  INDEX idx_tg_user_id (user_id)
);
