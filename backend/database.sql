IF DB_ID(N'GreenTaskDb') IS NULL
BEGIN
  CREATE DATABASE [GreenTaskDb];
END
GO

USE [GreenTaskDb];
GO

IF OBJECT_ID(N'dbo.company_admins', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.company_admins (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password NVARCHAR(255) NOT NULL,
    mobile NVARCHAR(20) NULL,
    company_description NVARCHAR(MAX) NULL,
    expected_companies INT NOT NULL CONSTRAINT DF_company_admins_expected_companies DEFAULT 1,
    expected_managers INT NOT NULL CONSTRAINT DF_company_admins_expected_managers DEFAULT 5,
    expected_staff INT NOT NULL CONSTRAINT DF_company_admins_expected_staff DEFAULT 20,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_company_admins_status DEFAULT 'pending',
    approved_at DATETIME2 NULL,
    rejected_reason NVARCHAR(MAX) NULL,
    max_companies INT NOT NULL CONSTRAINT DF_company_admins_max_companies DEFAULT 3,
    max_managers_per_company INT NOT NULL CONSTRAINT DF_company_admins_max_managers DEFAULT 10,
    max_staff_per_company INT NOT NULL CONSTRAINT DF_company_admins_max_staff DEFAULT 50,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_company_admins_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_admins_updated_at DEFAULT SYSDATETIME()
  );

  CREATE INDEX idx_company_admin_status ON dbo.company_admins(status);
END
GO

IF OBJECT_ID(N'dbo.organizations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.organizations (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(150) NOT NULL UNIQUE,
    company_code NVARCHAR(50) NOT NULL UNIQUE,
    company_admin_id INT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_organizations_status DEFAULT 'active',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_organizations_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_organizations_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_organizations_company_admin
      FOREIGN KEY (company_admin_id) REFERENCES dbo.company_admins(id)
  );

  CREATE INDEX idx_organizations_company_admin ON dbo.organizations(company_admin_id);
  CREATE INDEX idx_organizations_status ON dbo.organizations(status);
END
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password NVARCHAR(255) NOT NULL,
    mobile NVARCHAR(20) NULL,
    employee_id NVARCHAR(50) NULL,
    role NVARCHAR(30) NOT NULL CONSTRAINT DF_users_role DEFAULT 'person',
    avatar NVARCHAR(255) NULL,
    org_id INT NULL,
    last_active DATETIME2 NULL,
    is_deleted BIT NOT NULL CONSTRAINT DF_users_is_deleted DEFAULT 0,
    deleted_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_users_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_users_organization
      FOREIGN KEY (org_id) REFERENCES dbo.organizations(id)
  );

  CREATE INDEX idx_users_role ON dbo.users(role);
  CREATE INDEX idx_users_org_id ON dbo.users(org_id);
  CREATE INDEX idx_users_is_deleted ON dbo.users(is_deleted);
  CREATE UNIQUE INDEX idx_users_employee_id_not_null
    ON dbo.users(employee_id)
    WHERE employee_id IS NOT NULL;
  END
GO

IF OBJECT_ID(N'dbo.teams', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.teams (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    type NVARCHAR(100) NULL,
    team_code NVARCHAR(20) NOT NULL UNIQUE,
    created_by INT NOT NULL,
    org_id INT NOT NULL,
    is_deleted BIT NOT NULL CONSTRAINT DF_teams_is_deleted DEFAULT 0,
    deleted_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_teams_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_teams_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_teams_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_teams_org FOREIGN KEY (org_id) REFERENCES dbo.organizations(id)
  );

  CREATE INDEX idx_teams_created_by ON dbo.teams(created_by);
  CREATE INDEX idx_teams_org_id ON dbo.teams(org_id);
  CREATE INDEX idx_teams_is_deleted ON dbo.teams(is_deleted);
END
GO

IF OBJECT_ID(N'dbo.team_members', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_members (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    role NVARCHAR(100) NOT NULL CONSTRAINT DF_team_members_role DEFAULT 'Member',
    is_reporting_manager BIT NOT NULL CONSTRAINT DF_team_members_reporting DEFAULT 0,
    joined_at DATETIME2 NOT NULL CONSTRAINT DF_team_members_joined_at DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_team_members_team_user UNIQUE (team_id, user_id),
    CONSTRAINT FK_team_members_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
    CONSTRAINT FK_team_members_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_team_members_team_id ON dbo.team_members(team_id);
  CREATE INDEX idx_team_members_user_id ON dbo.team_members(user_id);
END
GO

IF OBJECT_ID(N'dbo.tasks', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.tasks (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_tasks_status DEFAULT 'TODO',
    priority NVARCHAR(20) NOT NULL CONSTRAINT DF_tasks_priority DEFAULT 'MEDIUM',
    priority_locked BIT NOT NULL CONSTRAINT DF_tasks_priority_locked DEFAULT 0,
    assigned_to INT NULL,
    assigned_by INT NULL,
    team_id INT NOT NULL,
    org_id INT NOT NULL,
    issue_type NVARCHAR(30) NOT NULL CONSTRAINT DF_tasks_issue_type DEFAULT 'task',
    task_type NVARCHAR(120) NULL,
    product NVARCHAR(120) NULL,
    category NVARCHAR(120) NULL,
    start_date DATE NULL,
    assigned_date DATE NULL,
    due_date DATE NULL,
    reference_image NVARCHAR(MAX) NULL,
    reported_by INT NULL,
    picked_by INT NULL,
    picked_at DATETIME2 NULL,
    resolved_at DATETIME2 NULL,
    manager_assigned BIT NOT NULL CONSTRAINT DF_tasks_manager_assigned DEFAULT 0,
    version INT NOT NULL CONSTRAINT DF_tasks_version DEFAULT 0,
    is_deleted BIT NOT NULL CONSTRAINT DF_tasks_is_deleted DEFAULT 0,
    deleted_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_tasks_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_tasks_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES dbo.users(id),
    CONSTRAINT FK_tasks_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_tasks_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
    CONSTRAINT FK_tasks_org FOREIGN KEY (org_id) REFERENCES dbo.organizations(id),
    CONSTRAINT FK_tasks_reported_by FOREIGN KEY (reported_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_tasks_picked_by FOREIGN KEY (picked_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_tasks_assigned_to ON dbo.tasks(assigned_to);
  CREATE INDEX idx_tasks_assigned_by ON dbo.tasks(assigned_by);
  CREATE INDEX idx_tasks_team_id ON dbo.tasks(team_id);
  CREATE INDEX idx_tasks_org_id ON dbo.tasks(org_id);
  CREATE INDEX idx_tasks_status ON dbo.tasks(status);
  CREATE INDEX idx_tasks_issue_type ON dbo.tasks(issue_type);
  CREATE INDEX idx_tasks_assigned_date ON dbo.tasks(assigned_date);
  CREATE INDEX idx_tasks_due_date ON dbo.tasks(due_date);
  CREATE INDEX idx_tasks_is_deleted ON dbo.tasks(is_deleted);
  CREATE INDEX idx_tasks_team_status ON dbo.tasks(team_id, status);
  CREATE INDEX idx_tasks_assigned_status ON dbo.tasks(assigned_to, status);
END
GO

IF OBJECT_ID(N'dbo.projects', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.projects (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NULL,
    user_id INT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_projects_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_projects_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_projects_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_projects_user_id ON dbo.projects(user_id);
END
GO

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.audit_logs (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id INT NULL,
    team_id INT NULL,
    task_id INT NULL,
    activity NVARCHAR(100) NOT NULL,
    task_details NVARCHAR(255) NULL,
    description NVARCHAR(MAX) NULL,
    automated_by NVARCHAR(50) NOT NULL CONSTRAINT DF_audit_logs_automated_by DEFAULT 'User (Local)',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_audit_logs_created_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_audit_logs_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_audit_logs_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
    CONSTRAINT FK_audit_logs_task FOREIGN KEY (task_id) REFERENCES dbo.tasks(id)
  );

  CREATE INDEX idx_audit_logs_user_id ON dbo.audit_logs(user_id);
  CREATE INDEX idx_audit_logs_team_id ON dbo.audit_logs(team_id);
  CREATE INDEX idx_audit_logs_task_id ON dbo.audit_logs(task_id);
  CREATE INDEX idx_audit_logs_created_at ON dbo.audit_logs(created_at);
  CREATE INDEX idx_audit_logs_team_created ON dbo.audit_logs(team_id, created_at);
END
GO

IF OBJECT_ID(N'dbo.login_attempts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.login_attempts (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    email NVARCHAR(255) NULL,
    ip_address NVARCHAR(50) NULL,
    success BIT NOT NULL CONSTRAINT DF_login_attempts_success DEFAULT 0,
    attempted_at DATETIME2 NOT NULL CONSTRAINT DF_login_attempts_attempted_at DEFAULT SYSDATETIME()
  );

  CREATE INDEX idx_login_attempts_email ON dbo.login_attempts(email);
  CREATE INDEX idx_login_attempts_attempted_at ON dbo.login_attempts(attempted_at);
  CREATE INDEX idx_login_attempts_success ON dbo.login_attempts(success);
END
GO

IF OBJECT_ID(N'dbo.notifications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.notifications (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id INT NULL,
    type NVARCHAR(50) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    task_id INT NULL,
    is_read BIT NOT NULL CONSTRAINT DF_notifications_is_read DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_notifications_created_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_notifications_task FOREIGN KEY (task_id) REFERENCES dbo.tasks(id)
  );

  CREATE INDEX idx_notifications_user_id ON dbo.notifications(user_id);
  CREATE INDEX idx_notifications_is_read ON dbo.notifications(is_read);
  CREATE INDEX idx_notifications_created_at ON dbo.notifications(created_at);
END
GO

IF OBJECT_ID(N'dbo.task_form_options', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.task_form_options (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    org_id INT NOT NULL,
    option_group NVARCHAR(40) NOT NULL,
    label NVARCHAR(120) NOT NULL,
    parent_value NVARCHAR(120) NOT NULL CONSTRAINT DF_task_form_options_parent DEFAULT '',
    sort_order INT NOT NULL CONSTRAINT DF_task_form_options_sort_order DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_task_form_options_is_active DEFAULT 1,
    created_by INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_task_form_options_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_task_form_options_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_task_form_options UNIQUE (org_id, option_group, label, parent_value),
    CONSTRAINT FK_task_form_options_org FOREIGN KEY (org_id) REFERENCES dbo.organizations(id),
    CONSTRAINT FK_task_form_options_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_task_form_options_org_group ON dbo.task_form_options(org_id, option_group, is_active);
  CREATE INDEX idx_task_form_options_parent ON dbo.task_form_options(org_id, option_group, parent_value);
END
GO

IF OBJECT_ID(N'dbo.team_discussion_threads', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_discussion_threads (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    team_id INT NOT NULL,
    title NVARCHAR(160) NOT NULL,
    created_by INT NOT NULL,
    is_default BIT NOT NULL CONSTRAINT DF_team_discussion_threads_is_default DEFAULT 0,
    last_message_at DATETIME2 NULL CONSTRAINT DF_team_discussion_threads_last_message_at DEFAULT SYSDATETIME(),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_team_discussion_threads_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_team_discussion_threads_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_team_discussion_threads_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
    CONSTRAINT FK_team_discussion_threads_user FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_team_discussion_threads_default ON dbo.team_discussion_threads(team_id, is_default);
  CREATE INDEX idx_team_discussion_threads_last_message ON dbo.team_discussion_threads(team_id, last_message_at);
END
GO

IF OBJECT_ID(N'dbo.team_messages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_messages (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    thread_id INT NULL,
    message NVARCHAR(MAX) NOT NULL,
    reply_to INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_team_messages_created_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_team_messages_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
    CONSTRAINT FK_team_messages_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_team_messages_thread FOREIGN KEY (thread_id) REFERENCES dbo.team_discussion_threads(id),
    CONSTRAINT FK_team_messages_reply_to FOREIGN KEY (reply_to) REFERENCES dbo.team_messages(id)
  );

  CREATE INDEX idx_team_messages_team_id ON dbo.team_messages(team_id);
  CREATE INDEX idx_team_messages_thread_id ON dbo.team_messages(thread_id);
  CREATE INDEX idx_team_messages_created_at ON dbo.team_messages(created_at);
  CREATE INDEX idx_team_messages_team_thread_created ON dbo.team_messages(team_id, thread_id, created_at);
END
GO

IF OBJECT_ID(N'dbo.team_message_reads', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_message_reads (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    read_at DATETIME2 NOT NULL CONSTRAINT DF_team_message_reads_read_at DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_team_message_reads UNIQUE (message_id, user_id),
    CONSTRAINT FK_team_message_reads_message FOREIGN KEY (message_id) REFERENCES dbo.team_messages(id),
    CONSTRAINT FK_team_message_reads_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_team_message_reads_user ON dbo.team_message_reads(user_id);
END
GO

IF OBJECT_ID(N'dbo.team_review_sessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_review_sessions (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    team_id INT NOT NULL,
    thread_id INT NULL,
    sharer_id INT NOT NULL,
    note NVARCHAR(255) NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_team_review_sessions_status DEFAULT 'active',
    decision NVARCHAR(20) NULL,
    ended_by INT NULL,
    decision_by INT NULL,
    decision_remark NVARCHAR(MAX) NULL,
    started_at DATETIME2 NOT NULL CONSTRAINT DF_team_review_sessions_started_at DEFAULT SYSDATETIME(),
    ended_at DATETIME2 NULL,
    decision_at DATETIME2 NULL,
    CONSTRAINT FK_team_review_sessions_team FOREIGN KEY (team_id) REFERENCES dbo.teams(id),
    CONSTRAINT FK_team_review_sessions_thread FOREIGN KEY (thread_id) REFERENCES dbo.team_discussion_threads(id),
    CONSTRAINT FK_team_review_sessions_sharer FOREIGN KEY (sharer_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_team_review_sessions_ended_by FOREIGN KEY (ended_by) REFERENCES dbo.users(id),
    CONSTRAINT FK_team_review_sessions_decision_by FOREIGN KEY (decision_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_team_review_sessions_team_status ON dbo.team_review_sessions(team_id, status, started_at);
  CREATE INDEX idx_team_review_sessions_thread ON dbo.team_review_sessions(thread_id);
  CREATE INDEX idx_team_review_sessions_sharer ON dbo.team_review_sessions(sharer_id);
END
GO

IF OBJECT_ID(N'dbo.team_review_session_participants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_review_session_participants (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    role NVARCHAR(20) NOT NULL CONSTRAINT DF_team_review_session_participants_role DEFAULT 'viewer',
    joined_at DATETIME2 NOT NULL CONSTRAINT DF_team_review_session_participants_joined_at DEFAULT SYSDATETIME(),
    left_at DATETIME2 NULL,
    CONSTRAINT UQ_team_review_session_participants UNIQUE (session_id, user_id, role),
    CONSTRAINT FK_team_review_session_participants_session FOREIGN KEY (session_id) REFERENCES dbo.team_review_sessions(id),
    CONSTRAINT FK_team_review_session_participants_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_team_review_session_participants_user ON dbo.team_review_session_participants(user_id);
END
GO

IF OBJECT_ID(N'dbo.team_review_session_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.team_review_session_events (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    session_id INT NOT NULL,
    actor_id INT NULL,
    event_type NVARCHAR(50) NOT NULL,
    details NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_team_review_session_events_created_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_team_review_session_events_session FOREIGN KEY (session_id) REFERENCES dbo.team_review_sessions(id),
    CONSTRAINT FK_team_review_session_events_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_team_review_session_events_session ON dbo.team_review_session_events(session_id, created_at);
END
GO

IF OBJECT_ID(N'dbo.telegram_sessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.telegram_sessions (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    chat_id BIGINT NOT NULL UNIQUE,
    user_id INT NOT NULL,
    employee_id NVARCHAR(50) NOT NULL,
    role NVARCHAR(30) NOT NULL,
    org_id INT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_telegram_sessions_is_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_telegram_sessions_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_telegram_sessions_updated_at DEFAULT SYSDATETIME(),
    CONSTRAINT FK_telegram_sessions_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_telegram_sessions_org FOREIGN KEY (org_id) REFERENCES dbo.organizations(id)
  );

  CREATE INDEX idx_telegram_sessions_user_id ON dbo.telegram_sessions(user_id);
  CREATE INDEX idx_telegram_sessions_is_active ON dbo.telegram_sessions(is_active);
END
GO

IF OBJECT_ID(N'dbo.user_org_access', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_org_access (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    org_id INT NOT NULL,
    created_by INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_user_org_access_created_at DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_user_org_access UNIQUE (user_id, org_id),
    CONSTRAINT FK_user_org_access_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_user_org_access_org FOREIGN KEY (org_id) REFERENCES dbo.organizations(id),
    CONSTRAINT FK_user_org_access_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX idx_user_org_access_user ON dbo.user_org_access(user_id);
  CREATE INDEX idx_user_org_access_org ON dbo.user_org_access(org_id);
END
GO

IF OBJECT_ID(N'dbo.super_admin_users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.super_admin_users (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    name NVARCHAR(255) NULL,
    added_by INT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_super_admin_users_is_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_super_admin_users_created_at DEFAULT SYSDATETIME()
  );

  CREATE INDEX idx_super_admin_users_active ON dbo.super_admin_users(is_active);
END
GO

IF OBJECT_ID(N'dbo.super_admin_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.super_admin_logs (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    actor_email NVARCHAR(255) NOT NULL,
    actor_name NVARCHAR(255) NULL,
    action NVARCHAR(100) NOT NULL,
    target_type NVARCHAR(50) NULL,
    target_id INT NULL,
    description NVARCHAR(MAX) NULL,
    ip_address NVARCHAR(50) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_super_admin_logs_created_at DEFAULT SYSDATETIME()
  );

  CREATE INDEX idx_super_admin_logs_actor ON dbo.super_admin_logs(actor_email);
  CREATE INDEX idx_super_admin_logs_created_at ON dbo.super_admin_logs(created_at);
END
GO
