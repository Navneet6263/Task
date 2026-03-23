require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function run() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'task_manager',
    multipleStatements: true
  });

  console.log('✅ Connected');

  // 1. Disable FK checks & clean all tables
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  const tables = [
    'team_review_session_events', 'team_review_session_participants', 'team_review_sessions',
    'team_message_reads', 'team_messages', 'team_discussion_threads',
    'task_form_options',
    'notifications', 'login_attempts', 'audit_logs',
    'tasks', 'team_members', 'teams', 'users', 'organizations', 'company_admins'
  ];
  for (const t of tables) {
    try { await db.query(`TRUNCATE TABLE ${t}`); } catch {}
  }
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✅ All tables cleaned');

  const pass = await bcrypt.hash('navneet', 10);

  // 2. Create company admin
  const [caResult] = await db.execute(
    `INSERT INTO company_admins (name, email, password, mobile, status, approved_at, max_companies, max_managers_per_company, max_staff_per_company)
     VALUES (?, ?, ?, ?, 'approved', NOW(), 5, 20, 100)`,
    ['Navneet Kumar', 'navneet@greencall.com', pass, '9876543210']
  );
  const caId = caResult.insertId;
  console.log('✅ Company Admin created (id=' + caId + ')');

  // 3. Create organization
  const [orgResult] = await db.execute(
    `INSERT INTO organizations (name, slug, company_code, company_admin_id, status)
     VALUES (?, ?, ?, ?, 'active')`,
    ['GreenCall Technologies', 'greencall-tech', 'ORG-GREEN-001', caId]
  );
  const orgId = orgResult.insertId;
  console.log('✅ Organization created (id=' + orgId + ')');

  // 4. Create super admin
  const [saResult] = await db.execute(
    `INSERT INTO users (name, email, password, mobile, employee_id, role, org_id)
     VALUES (?, ?, ?, ?, ?, 'admin', ?)`,
    ['Super Admin', 'admin@greencall.com', pass, '9000000001', 'ADMIN001', orgId]
  );
  const adminId = saResult.insertId;
  console.log('✅ Super Admin created (id=' + adminId + ')');

  // 5. Create managers
  const managers = [
    { name: 'Rahul Sharma', email: 'rahul@gmail.com', empId: 'MGR001' },
    { name: 'Priya Singh', email: 'priya@gmail.com', empId: 'MGR002' },
  ];
  const managerIds = [];
  for (const m of managers) {
    const [r] = await db.execute(
      `INSERT INTO users (name, email, password, mobile, employee_id, role, org_id)
       VALUES (?, ?, ?, ?, ?, 'manager', ?)`,
      [m.name, m.email, pass, '90000' + Math.floor(Math.random() * 99999), m.empId, orgId]
    );
    managerIds.push(r.insertId);
  }
  console.log('✅ 2 Managers created');

  // 6. Create employees
  const employees = [
    { name: 'Amit Verma', email: 'amit@gmail.com', empId: 'EMP001' },
    { name: 'Sneha Gupta', email: 'sneha@gmail.com', empId: 'EMP002' },
    { name: 'Ravi Kumar', email: 'ravi@gmail.com', empId: 'EMP003' },
    { name: 'Pooja Patel', email: 'pooja@gmail.com', empId: 'EMP004' },
    { name: 'Vikram Joshi', email: 'vikram@gmail.com', empId: 'EMP005' },
    { name: 'Neha Agarwal', email: 'neha@gmail.com', empId: 'EMP006' },
    { name: 'Karan Mehta', email: 'karan@gmail.com', empId: 'EMP007' },
    { name: 'Divya Rao', email: 'divya@gmail.com', empId: 'EMP008' },
  ];
  const empIds = [];
  for (const e of employees) {
    const [r] = await db.execute(
      `INSERT INTO users (name, email, password, mobile, employee_id, role, org_id)
       VALUES (?, ?, ?, ?, ?, 'person', ?)`,
      [e.name, e.email, pass, '98000' + Math.floor(Math.random() * 99999), e.empId, orgId]
    );
    empIds.push(r.insertId);
  }
  console.log('✅ 8 Employees created');

  // 7. Create teams
  const teamData = [
    { name: 'Test1 - Frontend', type: 'Development', manager: managerIds[0], members: empIds.slice(0, 4) },
    { name: 'Test2 - Backend', type: 'Development', manager: managerIds[1], members: empIds.slice(4, 8) },
  ];
  const teamIds = [];
  for (const t of teamData) {
    const code = 'TM' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const [r] = await db.execute(
      `INSERT INTO teams (name, type, team_code, created_by, org_id) VALUES (?, ?, ?, ?, ?)`,
      [t.name, t.type, code, t.manager, orgId]
    );
    teamIds.push(r.insertId);

    // Add manager as reporting manager
    await db.execute(
      `INSERT INTO team_members (team_id, user_id, role, is_reporting_manager) VALUES (?, ?, 'Reporting Manager', TRUE)`,
      [r.insertId, t.manager]
    );

    // Add admin to team
    await db.execute(
      `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'Admin')`,
      [r.insertId, adminId]
    );

    // Add members
    for (const mId of t.members) {
      await db.execute(
        `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'Member')`,
        [r.insertId, mId]
      );
    }
  }
  console.log('✅ 2 Teams created with members');

  const taskFormOptions = {
    task_type: [
      { label: 'Feature', parent_value: '' },
      { label: 'Improvement', parent_value: '' },
      { label: 'Testing', parent_value: '' },
      { label: 'Research', parent_value: '' },
    ],
    product: [
      { label: 'Dashboard', parent_value: '' },
      { label: 'UI/UX', parent_value: '' },
      { label: 'Backend API', parent_value: '' },
      { label: 'Mobile App', parent_value: '' },
      { label: 'Authentication', parent_value: '' },
      { label: 'Reports', parent_value: '' },
    ],
    category: [
      { label: 'New Feature', parent_value: 'Feature' },
      { label: 'Workflow', parent_value: 'Feature' },
      { label: 'Optimization', parent_value: 'Improvement' },
      { label: 'Refactor', parent_value: 'Improvement' },
      { label: 'Regression', parent_value: 'Testing' },
      { label: 'UAT', parent_value: 'Testing' },
      { label: 'Discovery', parent_value: 'Research' },
      { label: 'Documentation', parent_value: 'Research' },
    ],
  };

  for (const [group, options] of Object.entries(taskFormOptions)) {
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      await db.execute(
        `INSERT INTO task_form_options (org_id, option_group, label, parent_value, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, group, option.label, option.parent_value || '', index + 1, adminId]
      );
    }
  }
  console.log('Task form options created');

  // 8. Create tasks (20 tasks)
  const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'PENDING'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH'];
  const taskTypes = ['Feature', 'Improvement', 'Testing', 'Research'];
  const products = ['Dashboard', 'UI/UX', 'Backend API', 'Mobile App', 'Authentication', 'Reports'];
  const categoriesByType = {
    Feature: ['New Feature', 'Workflow'],
    Improvement: ['Optimization', 'Refactor'],
    Testing: ['Regression', 'UAT'],
    Research: ['Discovery', 'Documentation'],
  };
  const taskTitles = [
    'Login page UI design', 'Dashboard API integration', 'Fix navbar responsive issue',
    'Create user registration flow', 'Database schema optimization', 'Add search functionality',
    'Implement dark mode toggle', 'Write unit tests for auth', 'Setup CI/CD pipeline',
    'Design settings page', 'Create notification system', 'Fix task filter bug',
    'Add export to PDF feature', 'Optimize image loading', 'Create team invite flow',
    'Build analytics dashboard', 'Add drag and drop tasks', 'Implement WebSocket chat',
    'Create audit log viewer', 'Setup production deployment'
  ];

  const allMembers = [...managerIds, ...empIds];
  const today = new Date();

  for (let i = 0; i < 20; i++) {
    const teamIdx = i < 10 ? 0 : 1;
    const teamId = teamIds[teamIdx];
    const assignedTo = teamIdx === 0
      ? [managerIds[0], ...empIds.slice(0, 4)][i % 5]
      : [managerIds[1], ...empIds.slice(4, 8)][i % 5];
    const assignedBy = teamIdx === 0 ? managerIds[0] : managerIds[1];
    const status = statuses[i % 4];
    const priority = priorities[i % 3];
    const taskType = taskTypes[i % taskTypes.length];
    const product = products[i % products.length];
    const issueType = i % 6 === 0 ? 'bug' : (i % 5 === 0 ? 'story' : 'task');
    const categoryList = categoriesByType[taskType];
    const category = categoryList[i % categoryList.length];
    const assignedDate = new Date(today);
    assignedDate.setDate(today.getDate() - (i % 3));
    const startDate = new Date(assignedDate);
    startDate.setDate(assignedDate.getDate() + (i % 2));
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + (i % 7) - 2); // some past, some future

    await db.execute(
      `INSERT INTO tasks
       (title, description, status, priority, assigned_to, assigned_by, team_id, org_id, issue_type, task_type, product, category, start_date, assigned_date, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskTitles[i],
        `Description for: ${taskTitles[i]}. This task needs to be completed as per the sprint plan.`,
        status, priority, assignedTo, assignedBy, teamId, orgId,
        issueType, taskType, product, category,
        startDate.toISOString().split('T')[0],
        assignedDate.toISOString().split('T')[0],
        dueDate.toISOString().split('T')[0]
      ]
    );
  }
  console.log('✅ 20 Tasks created');

  // 9. Create some audit logs
  for (let i = 0; i < 8; i++) {
    const activities = ['Task Created', 'Task Assigned', 'Task Updated', 'Task Completed'];
    await db.execute(
      `INSERT INTO audit_logs (user_id, team_id, activity, task_details, description, automated_by)
       VALUES (?, ?, ?, ?, ?, 'User (Local)')`,
      [
        allMembers[i % allMembers.length],
        teamIds[i % 2],
        activities[i % 4],
        taskTitles[i],
        `${activities[i % 4]}: ${taskTitles[i]}`
      ]
    );
  }
  console.log('✅ Audit logs created');

  // 10. Create some notifications
  for (let i = 0; i < 6; i++) {
    await db.execute(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)`,
      [empIds[i % empIds.length], 'task', `New task assigned: ${taskTitles[i]}`]
    );
  }
  console.log('✅ Notifications created');

  // Summary
  console.log('\n========================================');
  console.log('🎉 FRESH DATA SEEDED SUCCESSFULLY!');
  console.log('========================================');
  console.log('\n📋 LOGIN CREDENTIALS (password: navneet)');
  console.log('----------------------------------------');
  console.log('Company Admin : navneet@greencall.com');
  console.log('Super Admin   : admin@greencall.com');
  console.log('Manager 1     : rahul@gmail.com');
  console.log('Manager 2     : priya@gmail.com');
  console.log('Employee 1    : amit@gmail.com');
  console.log('Employee 2    : sneha@gmail.com');
  console.log('Employee 3    : ravi@gmail.com');
  console.log('Employee 4    : pooja@gmail.com');
  console.log('Employee 5    : vikram@gmail.com');
  console.log('Employee 6    : neha@gmail.com');
  console.log('Employee 7    : karan@gmail.com');
  console.log('Employee 8    : divya@gmail.com');
  console.log('----------------------------------------');
  console.log('Teams: Test1 - Frontend, Test2 - Backend');
  console.log('Tasks: 20 (10 per team)');
  console.log('========================================\n');

  await db.end();
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
