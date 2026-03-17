# NavTask — Frontend Developer Task Guide

> **Project:** NavTask (Task Manager — Jira-like)
> **Stack:** React 18, React Router v6, Axios, Node.js + Express, MySQL, WebSocket
> **Frontend folder:** `frontend/src/`
> **Backend runs on:** `http://localhost:5000`
> **Frontend runs on:** `http://localhost:3000`

---

## What You Will Receive From The Owner

Before starting, the owner will give you:

1. The full project ZIP / Git repo access
2. A `.env` file for the backend (DB credentials, JWT secret)
3. Login credentials to test the app:
   - Admin: `admin@navtask.com` / `admin123`
   - Manager: `navneet@visionindia.com` / `password123`
   - Employee: `baroh@visionindia.com` / `password123`
4. Instructions to run the project (see below)

---

## How To Run The Project Locally

```bash
# Step 1 — Backend
cd backend
npm install
node seed.js          # sets up database with dummy data
node migrate_superadmin.js
npm run dev           # starts on http://localhost:5000

# Step 2 — Frontend
cd frontend
npm install
npm start             # starts on http://localhost:3000
```

---

## Project Folder Structure (Frontend)

```
frontend/src/
├── components/
│   ├── Layout.js         ← Sidebar + Header + Notifications + Org Switch
│   ├── Layout.css
│   ├── Navbar.js         ← Old navbar (not used much)
│   ├── ProjectCard.js
│   └── TaskCard.js
├── pages/
│   ├── Login.js          ← Login + Register page
│   ├── Dashboard.js      ← Main task workspace (List/Board/Timeline views)
│   ├── MyTasks.js        ← Employee's personal task list
│   ├── TeamManagement.js ← Create teams, add/remove members
│   ├── Reports.js        ← Analytics, energy score, performance
│   ├── AuditLogs.js      ← Activity logs per team
│   ├── PmsHub.js         ← Personal performance + monthly report
│   ├── AdminPanel.js     ← Company admin control panel
│   ├── Settings.js       ← Profile + password + team codes
│   ├── SuperAdminDashboard.js  ← Super admin panel
│   ├── SuperAdminLogin.js
│   └── RegisterCompany.js
├── services/
│   └── api.js            ← All Axios API calls (single source of truth)
├── App.js                ← Routes defined here
└── index.js
```

---

## API Reference (Already Built — Backend Ready)

All APIs are in `services/api.js`. You just call them, no backend work needed for most tasks.

```js
// Auth
auth.login({ email, password })
auth.register({ name, email, password, mobile, employee_id, role, team_code })
auth.companyLogin({ email, password })

// Teams
teams.getAll()
teams.create({ name, type })
teams.getMembers(teamId)
teams.addMember(teamId, { email, role })
teams.removeMember(teamId, userId)

// Tasks
tasks.getByTeam(teamId, page, limit, status)
tasks.getMy(page, limit)
tasks.create(data)
tasks.update(id, data)
tasks.delete(id)
tasks.reassign(id, assign_to)
tasks.togglePriorityLock(id)
tasks.managerAssign(data)
tasks.getOrgUsers()

// Notifications
notifications.getAll()       // returns array of notifications
notifications.read(id)       // mark one as read
notifications.readAll()      // mark all as read

// Analytics
analytics.energy(teamId)
analytics.behavioral(teamId)
analytics.suggestAssignee(teamId, priority)
analytics.performance(userId)

// Logs
logs.getByTeam(teamId)
logs.getMy()

// Users
users.me()
users.search(email)
users.orgAccess()

// Company Admin
companyAdmin.overview()
companyAdmin.organizations()
companyAdmin.createOrganization(data)
companyAdmin.users(orgId)
companyAdmin.createAdmin(data)
companyAdmin.updateUserRole(id, role)
companyAdmin.deleteUser(id)
```

---

## Auth & Token System (Important — Read This)

The app has 3 types of users. Each stores token differently in `localStorage`:

| User Type | Token Key | User Data Key |
|-----------|-----------|---------------|
| Employee / Manager | `token` | `user` |
| Company Admin | `company_token` | `company_user` |
| Super Admin | `sa_token` | (handled separately) |

To get current user in any component:
```js
const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
```

To get auth token (already handled in `api.js` interceptor):
```js
const token = localStorage.getItem('company_token') || localStorage.getItem('token');
```

The `api.js` interceptor automatically attaches the token and `x-org-id` header to every request. You don't need to manually add headers.

---

---

# TASKS — DETAILED

---

## ✅ TASK 1 — Loading States & Error Handling (START WITH THIS)

**Difficulty:** Easy | **Estimated Time:** 1–2 days | **Priority:** HIGHEST

### Why This Task First?
Right now the app uses `alert()` for errors and has no loading indicators. This makes the app feel broken. Fix this first so all other tasks look polished.

### What Needs To Be Done

#### 1A — Replace all `alert()` with Toast Notifications

Install the library:
```bash
cd frontend
npm install react-toastify
```

Add to `index.js` (root file):
```jsx
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Inside the render, wrap your app:
<>
  <App />
  <ToastContainer position="top-right" autoClose={3000} />
</>
```

Now in every page, replace:
```js
// OLD — remove these
alert('Failed to create task');
alert(error.response?.data?.error || 'Failed');

// NEW — use these
import { toast } from 'react-toastify';
toast.error('Failed to create task');
toast.success('Task created successfully!');
```

Files to update (search for `alert(` in these files):
- `Dashboard.js` — has 3 alerts
- `MyTasks.js` — has 2 alerts
- `TeamManagement.js` — has 2 alerts
- `AdminPanel.js` — uses `setError()` state (keep that, just also add toast)

#### 1B — Add Skeleton Loaders

When data is loading, show a shimmer/skeleton instead of blank screen.

Create a new file: `frontend/src/components/Skeleton.js`

```jsx
import React from 'react';
import './Skeleton.css';

export const SkeletonRow = () => (
  <div className="skeleton-row">
    <div className="skeleton-cell wide" />
    <div className="skeleton-cell" />
    <div className="skeleton-cell" />
    <div className="skeleton-cell" />
  </div>
);

export const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-line title" />
    <div className="skeleton-line short" />
    <div className="skeleton-line medium" />
  </div>
);
```

Create `frontend/src/components/Skeleton.css`:
```css
.skeleton-row, .skeleton-card {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  gap: 12px;
  align-items: center;
}
.skeleton-cell, .skeleton-line {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 6px;
  height: 14px;
}
.skeleton-cell.wide { width: 200px; }
.skeleton-cell { width: 80px; }
.skeleton-line.title { width: 60%; height: 16px; }
.skeleton-line.short { width: 30%; }
.skeleton-line.medium { width: 45%; }
.skeleton-card { flex-direction: column; align-items: flex-start; padding: 16px; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Use it in `Dashboard.js`:
```jsx
import { SkeletonRow } from '../components/Skeleton';

// Add loading state
const [loading, setLoading] = useState(false);

// In selectTeam function:
const selectTeam = useCallback(async (team) => {
  setLoading(true);
  // ... existing code ...
  setLoading(false);
}, []);

// In renderListView, replace empty tbody with:
{loading ? (
  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
) : (
  // existing rows
)}
```

Do the same for `MyTasks.js`, `TeamManagement.js`, `Reports.js`.

#### 1C — Empty State Components

When there are no tasks/teams/members, show a friendly message instead of blank space.

In `Dashboard.js`, the empty row already exists but looks plain. Style it better:
```jsx
// Replace the existing empty row in renderListView:
{paginated.length === 0 && !loading && (
  <tr>
    <td colSpan={6}>
      <div className="dash-empty-state-inline">
        <span>📋</span>
        <p>No tasks found</p>
        <small>Try changing filters or create a new task</small>
      </div>
    </td>
  </tr>
)}
```

### Files To Modify
- `frontend/src/index.js` — add ToastContainer
- `frontend/src/pages/Dashboard.js` — replace alerts, add loading state
- `frontend/src/pages/MyTasks.js` — replace alerts, add loading state
- `frontend/src/pages/TeamManagement.js` — replace alerts, add loading state
- `frontend/src/pages/AdminPanel.js` — add toast alongside existing error state
- `frontend/src/components/Skeleton.js` — CREATE NEW FILE
- `frontend/src/components/Skeleton.css` — CREATE NEW FILE

### What Owner Will Give You
- Full project code (all files above already exist)
- Just install `react-toastify` and create the 2 new files

---

## ✅ TASK 2 — Dedicated Notifications Page

**Difficulty:** Easy | **Estimated Time:** 1 day | **Priority:** HIGH

### What Needs To Be Done

Right now notifications only show in a dropdown in the header (`Layout.js`). You need to create a full `/notifications` page.

#### 2A — Create the Page File

Create: `frontend/src/pages/Notifications.js`

The page should:
- Show all notifications in a list
- Have filter tabs: All | Unread | Task Assigned | Overdue
- Show notification icon based on type (`task_assigned`, `overdue`, `task_updated`)
- Mark individual notification as read on click
- "Mark All Read" button at top
- Show timestamp in human-readable format ("2 hours ago")
- Pagination (show 20 per page)

```jsx
import React, { useEffect, useState, useMemo } from 'react';
import { notifications } from '../services/api';
import './Notifications.css';

const FILTERS = ['all', 'unread', 'task_assigned', 'overdue'];

const Notifications = () => {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const res = await notifications.getAll();
      setList(Array.isArray(res.data) ? res.data : []);
    } catch (e) {}
  };

  const handleRead = async (id) => {
    try {
      await notifications.read(id);
      setList(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {}
  };

  const handleReadAll = async () => {
    try {
      await notifications.readAll();
      setList(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {}
  };

  const filtered = useMemo(() => {
    if (filter === 'unread') return list.filter(n => !n.is_read);
    if (filter === 'all') return list;
    return list.filter(n => n.type === filter);
  }, [list, filter]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const unreadCount = list.filter(n => !n.is_read).length;

  return (
    <div className="notif-page">
      <header className="notif-head">
        <div>
          <h1>Notifications</h1>
          <p>{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleReadAll} className="notif-read-all-btn">
            Mark All Read
          </button>
        )}
      </header>

      <div className="notif-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`notif-filter-btn ${filter === f ? 'is-active' : ''}`}
            onClick={() => { setFilter(f); setPage(1); }}
          >
            {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unreadCount})` : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="notif-list">
        {paginated.length === 0 && (
          <div className="notif-empty">
            <span>🔔</span>
            <p>No notifications here</p>
          </div>
        )}
        {paginated.map(n => (
          <div
            key={n.id}
            className={`notif-item ${n.is_read ? '' : 'is-unread'}`}
            onClick={() => !n.is_read && handleRead(n.id)}
          >
            <span className={`notif-icon ${n.type}`}>{notifIcon(n.type)}</span>
            <div className="notif-body">
              <p>{n.message}</p>
              <time>{timeAgo(n.created_at)}</time>
            </div>
            {!n.is_read && <span className="notif-dot" />}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="notif-pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
};

const notifIcon = (type) => {
  if (type === 'task_assigned') return '📌';
  if (type === 'overdue') return '⚠️';
  if (type === 'task_updated') return '✏️';
  return '🔔';
};

const timeAgo = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default Notifications;
```

Also create `frontend/src/pages/Notifications.css` — style it to match the existing app theme (dark sidebar, clean cards).

#### 2B — Add Route in App.js

Open `frontend/src/App.js` and add:
```jsx
import Notifications from './pages/Notifications';

// Inside the Layout route children:
<Route path="notifications" element={<Notifications />} />
```

#### 2C — Add Nav Link in Layout.js

Open `frontend/src/components/Layout.js`.

Find the `navItems` array (around line 85) and add:
```jsx
{ path: '/notifications', label: 'Notifications', icon: <BellIcon /> },
```

Also update the notification bell button in the header — add a "View All" link that navigates to `/notifications`:
```jsx
// Inside shell-notif-dropdown, at the bottom:
<button
  type="button"
  className="shell-view-all-btn"
  onClick={() => { setShowNotif(false); navigate('/notifications'); }}
>
  View All Notifications
</button>
```

### Files To Modify
- `frontend/src/pages/Notifications.js` — CREATE NEW FILE
- `frontend/src/pages/Notifications.css` — CREATE NEW FILE
- `frontend/src/App.js` — add route
- `frontend/src/components/Layout.js` — add nav item + "View All" button

### What Owner Will Give You
- Full project code
- No backend changes needed — all 3 notification APIs already exist

---

---

# REMAINING TASKS — BRIEF OVERVIEW

> These tasks are listed for planning. Full detailed breakdown will be given when you start each one.

---

## 📌 TASK 3 — Global Search Functionality

**Difficulty:** Medium | **Time:** 2 days

**What to build:**
- The search bar in `Layout.js` header currently does nothing
- Make it search tasks by title and team members by name
- Show results in a dropdown below the search bar
- Click on a result → navigate to that task's team on Dashboard

**APIs available:**
- `users.search(email)` — search users
- Tasks search needs a new backend endpoint: `GET /api/tasks/search?q=keyword`
  - Owner will add this backend route, you just call it from frontend

**Files to touch:**
- `frontend/src/components/Layout.js` — wire up the search input
- `frontend/src/services/api.js` — add `tasks.search(q)` function

---

## 📌 TASK 4 — Dashboard Charts

**Difficulty:** Medium | **Time:** 2 days

**What to build:**
- Add visual charts to the Dashboard right column
- Replace the plain "Priority Split" text bars with a real Pie chart
- Add a Bar chart for task status distribution
- Data is already available in `stats` and `priorityStats` state variables in `Dashboard.js`

**Library to install:**
```bash
npm install recharts
```

**Files to touch:**
- `frontend/src/pages/Dashboard.js` — replace priority breakdown section with Recharts components
- `frontend/src/pages/Dashboard.css` — add chart container styles

---

## 📌 TASK 5 — Drag & Drop Board View

**Difficulty:** Medium | **Time:** 2–3 days

**What to build:**
- The Board view in `Dashboard.js` (`renderBoardView` function) shows task cards in columns
- Add drag and drop so cards can be moved between columns
- When a card is dropped in a new column → call `tasks.update(id, { status: newStatus })`

**Library to install:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

**Files to touch:**
- `frontend/src/pages/Dashboard.js` — wrap board view with DndContext, make cards draggable
- `frontend/src/pages/Dashboard.css` — add drag styles (dragging shadow, drop zone highlight)

---

## 📌 TASK 6 — Dark Mode Toggle

**Difficulty:** Medium | **Time:** 2 days

**What to build:**
- Add a dark/light mode toggle button in the header (`Layout.js`)
- Save preference in `localStorage` as `theme: 'dark' | 'light'`
- Apply `data-theme="dark"` attribute on `<body>` and use CSS variables for all colors
- All pages should respect the theme

**Files to touch:**
- `frontend/src/index.css` — define CSS variables for both themes
- `frontend/src/components/Layout.js` — add toggle button + apply theme on mount
- All `.css` files — replace hardcoded colors with CSS variables (this is the big part)

---

## 📌 TASK 7 — Task Comments & Activity Feed

**Difficulty:** Medium | **Time:** 3 days

**What to build:**
- In the task detail side panel (`dash-sheet` in `Dashboard.js`), add a comments section
- Users can type and submit a comment on a task
- Show comment history with user name + timestamp
- Also show activity history (status changes, assignments) from audit logs

**Backend needed (owner will build):**
- `POST /api/tasks/:id/comments` — add comment
- `GET /api/tasks/:id/comments` — get comments

**Files to touch:**
- `frontend/src/pages/Dashboard.js` — add comment form + list inside `dash-sheet`
- `frontend/src/services/api.js` — add `tasks.getComments(id)` and `tasks.addComment(id, text)`
- `frontend/src/pages/Dashboard.css` — style comment section

---

## 📌 TASK 8 — Profile Photo Upload

**Difficulty:** Easy | **Time:** 1 day

**What to build:**
- In `Settings.js`, the avatar shows only initials
- Add a click-to-upload button on the avatar
- Show preview before saving
- Save as base64 or file upload (owner will decide backend approach)

**Backend needed (owner will build):**
- `PUT /api/users/me/avatar` — upload avatar

**Files to touch:**
- `frontend/src/pages/Settings.js` — add file input on avatar click
- `frontend/src/services/api.js` — add `users.updateAvatar(data)`
- `frontend/src/pages/Settings.css` — style upload overlay on avatar

---

## 📌 TASK 9 — Export Feature (CSV + PDF)

**Difficulty:** Medium | **Time:** 2 days

**What to build:**
- In `Reports.js`, add "Export CSV" and "Export PDF" buttons
- CSV export: download task list as `.csv` file
- PDF export: generate a simple performance report

**Libraries to install:**
```bash
npm install jspdf jspdf-autotable
```

For CSV, no library needed — use plain JS:
```js
const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
// trigger download
```

**Files to touch:**
- `frontend/src/pages/Reports.js` — add export buttons + export logic
- `frontend/src/pages/MyTasks.js` — add "Export My Tasks" button

---

## 📌 TASK 10 — Mobile Responsive

**Difficulty:** Hard | **Time:** 4–5 days

**What to build:**
- The app currently breaks on mobile screens (below 768px)
- Fix all pages to be mobile-friendly
- Sidebar should collapse on mobile (hamburger already exists in Layout.js, just needs CSS fixes)
- Tables should become card-style on mobile
- Modals should be full-screen on mobile

**Key breakpoints to target:**
- `768px` — tablet
- `480px` — mobile

**Files to touch:**
- `frontend/src/components/Layout.css` — fix sidebar mobile behavior
- `frontend/src/pages/Dashboard.css` — make table scroll horizontally or convert to cards
- `frontend/src/pages/MyTasks.css` — same
- `frontend/src/pages/AdminPanel.css` — same
- `frontend/src/pages/TeamManagement.css` — same
- All other `.css` files — add `@media` queries

---

## Task Priority Order

| # | Task | Difficulty | Days | Start Order |
|---|------|-----------|------|-------------|
| 1 | Loading States & Error Handling | Easy | 1–2 | **First** |
| 2 | Notifications Page | Easy | 1 | **Second** |
| 3 | Search Functionality | Medium | 2 | Third |
| 4 | Dashboard Charts | Medium | 2 | Fourth |
| 5 | Drag & Drop Board | Medium | 2–3 | Fifth |
| 6 | Dark Mode | Medium | 2 | Sixth |
| 7 | Task Comments | Medium | 3 | Seventh |
| 8 | Profile Photo Upload | Easy | 1 | Eighth |
| 9 | Export Feature | Medium | 2 | Ninth |
| 10 | Mobile Responsive | Hard | 4–5 | Last |

---

## Important Notes For The Developer

1. **Do NOT touch backend files** — all backend APIs are already built and working
2. **Do NOT change `services/api.js` base URL** — it points to `http://localhost:5000`
3. **Follow existing CSS class naming** — the project uses BEM-like naming (e.g. `dash-btn`, `shell-header`)
4. **Test with all 3 user roles** — Admin, Manager, Employee behave differently
5. **WebSocket is already connected** in `Layout.js` — for real-time updates, just listen to events, don't reconnect
6. **localStorage keys to know:**
   - `token` — employee/manager JWT
   - `company_token` — company admin JWT
   - `user` — user object
   - `company_user` — company admin user object
   - `active_org_id` — currently selected organization

---

## Questions? Contact The Owner

If any API returns an unexpected error or a backend change is needed (Tasks 3, 7, 8), contact the project owner before building the frontend part.
