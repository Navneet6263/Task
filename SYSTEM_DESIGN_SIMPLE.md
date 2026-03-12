# GreenTask — Simple Layer Design (Easy Version)

> This document explains how the system is built in 3 layers.
> Think of it like a building — Ground Floor, First Floor, Second Floor.

---

## The 3 Layers

```
┌─────────────────────────────────┐
│         LAYER 1: FRONTEND       │  ← What user sees (React)
├─────────────────────────────────┤
│         LAYER 2: BACKEND        │  ← Brain of the app (Node.js)
├─────────────────────────────────┤
│         LAYER 3: DATABASE       │  ← Where data is saved (MySQL)
└─────────────────────────────────┘
```

User clicks something on screen → Frontend sends request to Backend → Backend reads/writes from Database → sends answer back to Frontend → Screen updates.

That's it. That's the whole system.

---

## Layer 1 — Frontend (React)

This is what the user sees and clicks on.

**Pages in the app:**

| Page | What it does |
|---|---|
| /login | Login form |
| /dashboard | Shows all tasks, stats |
| /my-tasks | Shows only your tasks |
| /team | Team members list |
| /audit-logs | Activity history |
| /pms-hub | Your performance report |
| /settings | Edit profile |
| /admin | Admin controls (admin only) |

**How Frontend talks to Backend:**

Every time user does something (like create a task), React calls a function in `services/api.js`. That function uses Axios to send an HTTP request to the backend with the JWT token in the header.

```
User clicks "Create Task"
        ↓
React calls api.createTask(data)
        ↓
Axios sends: POST /api/tasks
             Header: Authorization: Bearer <token>
             Body: { title, priority, assigned_to, due_date }
        ↓
Backend responds with the new task
        ↓
React adds it to the list on screen
```

**Real-time updates (Socket.io):**

When someone else on your team creates or updates a task, your screen updates automatically without refreshing. This works through Socket.io — a live connection between your browser and the server.

```
Another user updates a task
        ↓
Server sends event: task:updated
        ↓
Your browser receives it
        ↓
React updates the task on your screen instantly
```

---

## Layer 2 — Backend (Node.js + Express)

This is the brain. It receives requests from Frontend, checks if the user is allowed, runs the logic, and talks to the Database.

**Folder structure:**

```
backend/
├── server.js          ← starts the app, sets up Socket.io
├── .env               ← secret keys (DB password, JWT secret)
├── config/db.js       ← connects to MySQL
├── middleware/
│   ├── auth.js        ← checks JWT token
│   └── roleCheck.js   ← checks if user is Manager or Admin
├── routes/            ← defines which URL does what
└── controllers/       ← actual logic for each route
```

**How a request flows through the backend:**

```
Request arrives at backend
        ↓
auth.js checks the JWT token
  → Invalid token? → Send 401 error, stop here
  → Valid token? → attach user info to request, continue
        ↓
roleCheck.js checks the role (if route needs Manager/Admin)
  → Wrong role? → Send 403 error, stop here
  → Correct role? → continue
        ↓
Controller runs the logic
  → Queries the database
  → Gets the result
        ↓
Sends JSON response back to Frontend
```

**What is JWT?**

When you login, the backend gives you a token (like a temporary ID card). Every request you make after that includes this token. The backend reads it to know who you are and what role you have — without checking the database every time.

```
Login → Backend gives you: eyJhbGciOiJIUzI1NiJ9...
Every request → you send this token in the header
Backend reads it → knows you are Navneet, role = manager
```

---

## Layer 3 — Database (MySQL)

This is where everything is permanently saved. Think of it as a set of Excel sheets (tables) that are connected to each other.

**The 6 main tables:**

### users — stores all registered people

| Column | What it stores |
|---|---|
| id | Unique number for each user (auto) |
| name | Full name |
| email | Email (must be unique) |
| password | Encrypted password (bcrypt) |
| role | admin / manager / person |
| employee_id | Company employee ID |
| is_deleted | TRUE if account is deleted |

---

### teams — stores all teams

| Column | What it stores |
|---|---|
| id | Unique team number (auto) |
| name | Team name (e.g. "MERN Devs") |
| team_code | Unique code like TM4X9KR2 |
| created_by | Which user created this team |
| is_deleted | TRUE if team is deleted |

**How team_code is generated:**
When a Manager registers, backend runs:
```
team_code = "TM" + 6 random characters  →  example: TM4A9F2C
```
This code is unique. Manager shares it with employees. Employees use it to join the team.

---

### team_members — connects users to teams

This table answers: "Which user is in which team?"

| Column | What it stores |
|---|---|
| team_id | Which team |
| user_id | Which user |
| role | Their role in the team |
| is_reporting_manager | TRUE if they manage the team |
| joined_at | When they joined |

One user can be in multiple teams. Each row = one membership.

```
Example rows:
team_id=1, user_id=5  → Navneet is in MERN Devs
team_id=2, user_id=5  → Navneet is also in CRM Integration
team_id=1, user_id=8  → Baroh is in MERN Devs
```

---

### tasks — stores all tasks

| Column | What it stores |
|---|---|
| id | Unique task number (auto) |
| title | Task name |
| status | TODO / IN_PROGRESS / DONE / PENDING |
| priority | LOW / MEDIUM / HIGH |
| assigned_to | Which user is doing this task |
| assigned_by | Which user created this task |
| team_id | Which team this task belongs to |
| due_date | Deadline |
| version | Used to prevent two people editing at same time |
| is_deleted | TRUE if task is deleted |

---

### audit_logs — records every activity automatically

Every time something happens (task created, completed, commented), one row is added here automatically. No one has to do it manually.

| Column | What it stores |
|---|---|
| user_id | Who did the action |
| team_id | In which team |
| task_id | On which task |
| activity | What happened (Task Assigned, Task Completed, etc.) |
| automated_by | System AI / User Local / External API |
| created_at | When it happened |

---

### login_attempts — tracks failed logins

| Column | What it stores |
|---|---|
| email | Which email tried to login |
| ip_address | From which IP |
| success | Did it succeed or fail |
| attempted_at | When |

After 5 failed attempts from same IP → account locked for 15 minutes.

---

## How the 3 Layers Connect — Full Example

**Scenario: Manager creates a new task**

```
Step 1 — FRONTEND
Manager fills the Create Task form and clicks Submit
React calls: POST /api/tasks
Sends: { title, priority, assigned_to, due_date, team_id }
JWT token in header

Step 2 — BACKEND
auth.js reads the token → confirms it's a valid Manager
Controller receives the request
Starts a database transaction (so both steps below happen together or not at all)

Step 3 — DATABASE
INSERT INTO tasks (title, priority, assigned_to, ...) VALUES (...)
INSERT INTO audit_logs (user_id, task_id, activity='Task Assigned', ...)
Transaction committed ✓

Step 4 — BACKEND (after DB)
Emits Socket.io event: task:created → to room "team_5"
Returns the new task as JSON to Frontend

Step 5 — FRONTEND
React receives the new task
Adds it to the task list on screen
Everyone in the team sees it instantly (via Socket.io)
```

---

## How Tables Are Related

```
users ←──────────── team_members ────────────→ teams
  │                                               │
  │ (assigned_to)                                 │
  ↓                                               ↓
tasks ──────────────────────────────────────→ tasks.team_id
  │
  ↓
audit_logs (records every action on tasks)
```

In simple words:
- A **user** can be in many **teams** (through team_members)
- A **team** has many **tasks**
- A **task** is assigned to one **user**
- Every action on a **task** creates one row in **audit_logs**

---

## Why "Soft Delete"?

When someone deletes a task or user, we don't actually remove the row from the database. We just set `is_deleted = TRUE`.

Why? Because audit logs still reference that task. If we delete the row, the logs break. Also, data can be recovered if deleted by mistake.

All queries automatically filter: `WHERE is_deleted = FALSE`

---

## Summary in One Line Each

- **Frontend** = React pages that user sees. Talks to backend using Axios + JWT.
- **Backend** = Node.js server. Checks who you are, runs logic, talks to database.
- **Database** = MySQL tables. Stores users, teams, tasks, logs permanently.
- **Socket.io** = Live connection. Updates everyone's screen when something changes.
- **JWT** = Your login token. Proves who you are on every request.
- **team_code** = Unique code (TM + 6 chars) that employees use to join a team.
- **audit_logs** = Auto-recorded history of everything that happens in the system.
- **soft delete** = Never actually delete data, just mark it as deleted.

---

*End of Document*
