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
  due_date DATE,
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
  INDEX idx_status (status),
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
