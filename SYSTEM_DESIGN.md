# GreenTask — System Design Document

**Version:** 2.0  
**Stack:** React + Node.js (Express) + MySQL + Socket.io  
**Auth:** JWT + Bcrypt  

---

## What is GreenTask?

GreenTask is a team-based task management system built for organizations that need structured task tracking across multiple teams. It supports three user roles — Admin, Manager, and Employee — each with different levels of access. The system handles task assignment, real-time updates, performance tracking, and automated audit logging.

---

## Role-Based Access

| Feature | Admin | Manager | Employee |
|---|---|---|---|
| User Management | Full control | Own team only | Own profile only |
| Team Management | All teams | Own teams | View only |
| Task Assignment | All | Own team + cross-team | Teammates only |
| Audit Logs | All | Own team | Own logs |
| PMS Hub | All | Team performance | Own performance |
| Admin Panel | Yes | No | No |
| Workload AI | All | Team | Own |
| Behavioral Insights | All | Own team | No |

---

## How the System Flows (Big Picture)

```
User (Browser)
    ↓
React Frontend  →  services/api.js  →  Axios (JWT in header)
    ↓
Express Backend (Node.js)
    ↓
Auth Middleware (verify JWT, check role)
    ↓
Route Controller
    ↓
MySQL Database
    ↓
JSON Response  →  React updates state  →  UI re-renders

Parallel:
Socket.io  →  real-time events  →  React state update (no API call needed)
```

---

## Module Breakdown

### 1. Authentication

**Manager Registration:**
- Fills: Name, Email, Password, Mobile, Employee ID
- System creates account with `role = manager`
- System auto-generates a unique Team Code: `TM` + 6 random alphanumeric characters (e.g. `TM4X9KR2`)
- Manager is set as Reporting Manager of the new team
- Team Code is visible in Settings — manager shares it with employees
- JWT token issued with role embedded

**Employee Registration:**
- Fills: Name, Email, Password, Mobile, Employee ID, Team Code
- System checks Team Code against `teams` table
- Valid → employee added to team via `team_members` table
- Invalid → 400 error, registration blocked
- JWT token issued

**Error cases:**
- Duplicate email → `"Email already registered"`
- Invalid Team Code → `"Invalid Team Code"`
- Missing fields → 422 with field-level messages

---

### 2. Team Code — How It Works

When a Manager registers, the backend runs this:

```js
const teamCode = 'TM' + crypto.randomBytes(3).toString('hex').toUpperCase();
// Example: TM4A9F2C
```

This code is stored in `teams.team_code` (UNIQUE index). When an employee registers with this code, the system does:

```sql
SELECT id FROM teams WHERE team_code = ? AND is_deleted = FALSE
```

If found → insert into `team_members (team_id, user_id)`. If not → reject.

---

### 3. Multi-Team Support

One user can belong to multiple teams. The system needs to know which team is currently active.

- Frontend stores `active_team_id` in `localStorage`
- All API requests include this as a query param or header
- User can switch teams via tabs on Dashboard
- On switch: `active_team_id` updates, all data reloads for new team
- Default active team = earliest joined team (`joined_at ASC`)
- No server-side session — fully stateless design

---

### 4. Task Assignment

When a task is created, the system checks if the assignee has **Priority Lock** enabled:

```
Priority Lock ON  →  Task status = PENDING  (employee must approve first)
Priority Lock OFF →  Task status = TODO     (employee can start directly)
```

**Priority Lock explained:**  
When an employee is deep in a critical task, they can turn on Priority Lock. Any new task assigned to them automatically goes to PENDING. They review and accept when ready. This prevents context switching.

**Concurrency (Optimistic Locking):**  
If two managers edit the same task simultaneously, data can get corrupted. To prevent this, every task has a `version` field (INT).

```sql
-- Read
SELECT id, title, status, version FROM tasks WHERE id = ?

-- Update
UPDATE tasks SET status = ?, version = version + 1
WHERE id = ? AND version = ?
```

If `affected rows = 0` → version mismatch → return 409 Conflict. Frontend shows: *"Task was updated by someone else. Please refresh."*

---

### 5. Workload AI Engine

Manager clicks "Suggest Best Assignee" while creating a task. Backend calculates a Workload Score for each team member:

```
Workload Score =
    (Active Tasks × 10)
  + (High Priority Tasks × 20)
  + (Overdue Tasks × 30)
  - (Avg Completion Speed × 5)
```

Member with the **lowest score** is suggested. Manager can accept or override.

Data pulled from: `tasks` table (counts by status/priority), `audit_logs` (completion history).

---

### 6. Task Energy System

Every employee has a live Energy Score showing their current capacity:

```
Energy Score = 100
  - (High Priority Active Tasks × 25)
  - (Medium Priority Active Tasks × 10)
  - (Low Priority Active Tasks × 5)
  - (Overdue Tasks × 20)
```

| Score | Status |
|---|---|
| 80–100 | Available |
| 50–79 | Moderate |
| 25–49 | High Load |
| 0–24 | Burnout Alert |

If score drops to 0 or below → new task assignment is auto-rejected and manager gets notified.

Calculated dynamically from `tasks` table on each request. No separate table needed.

---

### 7. Performance Intelligence (PMS Hub)

```
Performance Index =
    (On Time Completions / Total Tasks) × 50
  + (High Priority Completed / Total High Priority) × 30
  - (Overdue Tasks / Total Tasks) × 20
```

| Score | Grade |
|---|---|
| 90–100 | Exceptional |
| 75–89 | Good |
| 60–74 | Average |
| Below 60 | Needs Improvement |

This replaces the static score shown in PMS Hub with real calculated data from the `tasks` table.

---

### 8. Behavioral Insights (Manager/Admin only)

| Metric | How It's Calculated |
|---|---|
| Task Accept Delay | Avg time between task assigned → status changed to IN_PROGRESS |
| After Hours Activity | Count of task updates between 8 PM and 8 AM |
| Frequent Status Changes | Count of status changes per task per user |
| Fast Delivery Score | Tasks completed before deadline / total completed |
| Bottleneck Detection | Tasks stuck in IN_PROGRESS for more than 3 days |

All sourced from `audit_logs` and `tasks` tables.

---

### 9. Real-Time Updates (Socket.io)

On login, React connects to Socket.io and joins room `team_[team_id]`.

Server emits these events:
- `task:created` — new task added
- `task:updated` — task status or details changed
- `task:deleted` — task removed
- `log:new` — new audit log entry
- `member:joined` — new member added to team

Frontend listens and updates state — no page refresh needed.

JWT is validated during socket handshake. Unauthenticated connections are rejected.

---

### 10. Audit Logs

These events are logged automatically:

- Task Assigned / Created / Updated / Completed / Commented
- Overdue Alert
- Member Joined Team
- Priority Lock Activated

Each log record stores: `user_id`, `team_id`, `task_id`, activity type, task details, description, `automated_by` (System AI / User Local / External API), and timestamp.

---

### 11. Cross-Team Task Assignment

Manager searches any employee by email or employee ID:

```
GET /api/users/search?q=emp001
```

Returns matching users with name, team, role. Manager selects and assigns task. The task appears in the employee's My Tasks with a "Cross-Team" badge. Audit log records the cross-team assignment.

---

### 12. Admin Panel

Admin sees:
- Active users (logged in last 30 minutes) — from `users.last_active`
- Failed login attempts (last 24 hours) — from `login_attempts`
- Tasks created per day (last 30 days) — from `tasks.created_at GROUP BY DATE`
- Team growth trend — from `teams.created_at GROUP BY DATE`
- Error rate — from `error_logs`

Admin can change any user's role and soft-delete users (data is preserved).

---

## Database Design

### Entity Relationships

```
users ──< team_members >── teams
users ──< tasks (assigned_to)
users ──< tasks (assigned_by)
teams ──< tasks
tasks ──< audit_logs
users ──< audit_logs
teams ──< audit_logs
```

### Table Definitions

**users**
```sql
id              INT AUTO_INCREMENT PRIMARY KEY
name            VARCHAR(255) NOT NULL
email           VARCHAR(255) UNIQUE NOT NULL
password        VARCHAR(255) NOT NULL          -- bcrypt hashed
mobile          VARCHAR(20)
employee_id     VARCHAR(50) UNIQUE
role            ENUM('admin','manager','person') DEFAULT 'person'
avatar          VARCHAR(10)
last_active     TIMESTAMP
is_deleted      BOOLEAN DEFAULT FALSE
deleted_at      TIMESTAMP NULL
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Indexes: email, employee_id, role, is_deleted
```

**teams**
```sql
id              INT AUTO_INCREMENT PRIMARY KEY
name            VARCHAR(255) NOT NULL
type            VARCHAR(100)
team_code       VARCHAR(20) UNIQUE NOT NULL    -- format: TM + 6 chars
created_by      INT  →  FK users.id
is_deleted      BOOLEAN DEFAULT FALSE
deleted_at      TIMESTAMP NULL
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Indexes: team_code (UNIQUE), created_by
```

**team_members**
```sql
id                    INT AUTO_INCREMENT PRIMARY KEY
team_id               INT  →  FK teams.id (CASCADE DELETE)
user_id               INT  →  FK users.id (CASCADE DELETE)
role                  VARCHAR(100) DEFAULT 'Member'
is_reporting_manager  BOOLEAN DEFAULT FALSE
joined_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY (team_id, user_id)
Indexes: team_id, user_id
```

**tasks**
```sql
id              INT AUTO_INCREMENT PRIMARY KEY
title           VARCHAR(255) NOT NULL
description     TEXT
status          ENUM('TODO','IN_PROGRESS','DONE','PENDING') DEFAULT 'TODO'
priority        ENUM('LOW','MEDIUM','HIGH') DEFAULT 'MEDIUM'
priority_locked BOOLEAN DEFAULT FALSE
assigned_to     INT  →  FK users.id (SET NULL on delete)
assigned_by     INT  →  FK users.id (SET NULL on delete)
team_id         INT  →  FK teams.id (CASCADE DELETE)
due_date        DATE
version         INT DEFAULT 0                  -- optimistic locking
is_deleted      BOOLEAN DEFAULT FALSE
deleted_at      TIMESTAMP NULL
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: assigned_to, team_id, status, due_date, is_deleted
Composite: (team_id, status), (assigned_to, status)
```

**audit_logs**
```sql
id              INT AUTO_INCREMENT PRIMARY KEY
user_id         INT  →  FK users.id (SET NULL)
team_id         INT  →  FK teams.id (SET NULL)
task_id         INT  →  FK tasks.id (SET NULL)
activity        ENUM('Task Assigned','Task Completed','Task Commented',
                     'Overdue Alert','Task Created','Task Updated',
                     'Member Joined','Priority Lock')
task_details    VARCHAR(255)
description     TEXT
automated_by    ENUM('System AI','User Local','External API') DEFAULT 'User Local'
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Indexes: user_id, team_id, created_at
Composite: (team_id, created_at)
```

**login_attempts**
```sql
id              INT AUTO_INCREMENT PRIMARY KEY
email           VARCHAR(255)
ip_address      VARCHAR(50)
success         BOOLEAN
attempted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Indexes: email, attempted_at
```

### Soft Delete Strategy

Nothing is actually deleted. Every delete operation does:

```sql
UPDATE users SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?
```

All SELECT queries include `WHERE is_deleted = FALSE`. This keeps audit trails intact and allows data recovery.

### Pagination

All list endpoints use `LIMIT` and `OFFSET`. Default page size: 20. Max: 100.

Response always includes: `total_count`, `page`, `per_page`, `total_pages`.

---

## Backend Connectivity — How It All Connects

### Folder Structure

```
backend/
├── server.js              ← Express app + Socket.io setup
├── .env                   ← DB credentials, JWT secret
├── config/
│   └── db.js              ← MySQL connection pool
├── middleware/
│   ├── auth.js            ← JWT verify middleware
│   └── roleCheck.js       ← Manager/Admin role guard
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── teams.js
│   ├── tasks.js
│   ├── logs.js
│   ├── admin.js
│   └── analytics.js
├── controllers/           ← Business logic per route
└── cron/
    └── overdueAlert.js    ← Daily cron job
```

### Database Connection (config/db.js)

```js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});
module.exports = pool;
```

Every controller imports this pool and runs queries:

```js
const [rows] = await pool.query('SELECT * FROM tasks WHERE team_id = ?', [teamId]);
```

### Auth Middleware Flow

```
Request hits route
    ↓
auth.js middleware
    ↓
Reads Authorization header: "Bearer <token>"
    ↓
jwt.verify(token, process.env.JWT_SECRET)
    ↓
Valid → req.user = { id, role, email } → next()
Invalid → 401 Unauthorized
    ↓
roleCheck.js (if route needs Manager/Admin)
    ↓
req.user.role === 'manager' || 'admin' → next()
else → 403 Forbidden
```

### Socket.io Setup (server.js)

```js
const io = require('socket.io')(server, { cors: { origin: '*' } });

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const user = jwt.verify(token, process.env.JWT_SECRET);
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  socket.join(`team_${socket.user.teamId}`);
});
```

When a task is created/updated, the controller emits:

```js
io.to(`team_${teamId}`).emit('task:created', taskData);
```

---

## Full API Reference

### Auth
| Method | Endpoint | Body | Access |
|---|---|---|---|
| POST | /api/auth/register | name, email, password, role, team_code | Public |
| POST | /api/auth/login | email, password | Public |

### Users
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/users/me | All |
| PUT | /api/users/me | All |
| PUT | /api/users/me/password | All |
| GET | /api/users/search?q= | Manager+ |

### Teams
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/teams | All |
| POST | /api/teams | Manager+ |
| GET | /api/teams/:id/members | All |
| POST | /api/teams/:id/members | Manager+ |
| DELETE | /api/teams/:id/members/:userId | Manager+ |

### Tasks
| Method | Endpoint | Notes |
|---|---|---|
| GET | /api/tasks/team/:teamId | Supports ?status=TODO&page=1&limit=20 |
| GET | /api/tasks/my | Own tasks only |
| POST | /api/tasks | Creates task + audit log (in transaction) |
| PUT | /api/tasks/:id | Requires `version` field for optimistic lock |
| PATCH | /api/tasks/:id/priority-lock | Toggle priority lock |
| DELETE | /api/tasks/:id | Soft delete |

### Logs
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/logs/team/:teamId | Manager+ |
| GET | /api/logs/my | All |

### Admin
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/admin/users | Admin |
| GET | /api/admin/stats | Admin |
| GET | /api/admin/health | Admin |
| PUT | /api/admin/users/:id/role | Admin |
| DELETE | /api/admin/users/:id | Admin |

### AI & Analytics
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/ai/suggest-assignee?teamId=1&priority=HIGH | Manager+ |
| GET | /api/analytics/performance/:userId | All |
| GET | /api/analytics/team/:teamId | Manager+ |
| GET | /api/analytics/behavioral/:teamId | Manager+ |

---

## Error Handling

All routes throw errors. A global middleware catches everything and returns:

```json
{
  "error": "Task was modified by another user. Please refresh.",
  "code": "CONFLICT",
  "status": 409
}
```

| Code | Meaning |
|---|---|
| 200 / 201 | Success / Created |
| 400 | Bad request / validation error |
| 401 | No token or invalid token |
| 403 | Valid token but wrong role |
| 404 | Resource not found |
| 409 | Optimistic lock conflict |
| 422 | Missing required fields |
| 429 | Rate limit exceeded |
| 500 | Server error |

**Rate Limits:**
- Login: 5 attempts / 15 min / IP
- Register: 10 requests / hour / IP
- General API: 100 requests / min / user

---

## Notifications

**In-App (Socket.io):**  
Events pushed to user's room. Stored in `notifications` table. Bell icon shows unread count.

**Email (Queue):**  
Bull + Redis queue. Worker sends via Nodemailer (SMTP). Max 3 retries on failure.

**Overdue Cron (runs daily at 9 AM):**
```sql
SELECT * FROM tasks WHERE due_date < CURDATE() AND status != 'DONE' AND is_deleted = FALSE
```
For each result → insert audit log (Overdue Alert) + push notification + send email.

---

## Security

- Passwords hashed with bcrypt (salt rounds: 10)
- JWT expires in 24 hours, role embedded in payload
- Every route requires valid JWT
- Admin routes have additional `adminOnly` middleware
- Login attempts logged with IP address
- Account locked for 15 minutes after 5 failed attempts
- All queries use parameterized statements (no SQL injection)
- CORS restricted to allowed origins only
- HTTPS required in production

---

## Deployment

**Current (Monolith):** Single Node.js server handles API + Socket.io + Cron. Good for ~500 concurrent users.

**Future Scale:**
```
Nginx Load Balancer
  → Node.js API Server 1, 2, N
  → MySQL Primary + Read Replica
  → Redis Cluster (cache + socket adapter + job queue)
```

**Environments:**
- Development — local MySQL, no rate limiting, verbose logs
- Staging — staging DB, rate limiting on
- Production — replica DB, PM2, Sentry error monitoring

**Docker:** `docker-compose.yml` includes app, MySQL 8, Redis, Nginx. Start with `docker-compose up -d`.

**CI/CD (GitHub Actions):** Push → install → test → build image → deploy to staging → manual approval → production.

---

## Frontend Pages

| Route | Who Can Access |
|---|---|
| /login | Public |
| /dashboard | All logged-in users |
| /my-tasks | All (own tasks only) |
| /team | All (own team only) |
| /audit-logs | Manager + Admin |
| /pms-hub | All (own data) |
| /settings | All |
| /admin | Admin only |

---

## User Flows

**Manager:**  
Register → get Team Code → share with employees → login → create tasks → use AI suggestion → monitor energy scores → check audit logs → review PMS Hub performance

**Employee:**  
Get Team Code from manager → register → auto-join team → login → see tasks in My Tasks → use Priority Lock when focused → update task status → view own performance in PMS Hub

**Admin:**  
Login → Admin Panel → view system health → manage all users → change roles → monitor failed logins → view growth trends

---

## What's Still Pending

- Socket.io real-time integration
- Workload AI suggestion engine
- Task Energy Score calculation
- Performance Intelligence (PMS Hub live data)
- Behavioral Insights dashboard
- Overdue alert cron job
- Redis caching layer
- Soft delete on all entities
- Optimistic locking on tasks
- Rate limiting middleware
- Docker + CI/CD setup
- Email notification queue
- File attachments on tasks
- Task comment threads
- Mobile responsive design

---

*End of Document*
