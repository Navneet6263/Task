# Task Manager - Jira Jaisa Easy to Use

Pink themed task management application with React frontend and Node.js backend.

## Features
- 🎨 Beautiful Pink UI
- 📋 Project Management
- ✅ Task Management (Create, Edit, Delete)
- 🔐 User Authentication
- 🚀 Production-ready APIs
- 💾 MySQL Database

## Setup Instructions

### 1. Database Setup
```bash
# MySQL me login karo
mysql -u root -p

# Database.sql file run karo
source backend/database.sql
```

### 2. Backend Setup
```bash
cd backend
npm install

# .env file me apni database credentials dalo
# DB_PASSWORD aur JWT_SECRET change karo

npm run dev
# Server will run on http://localhost:5000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm start
# App will open on http://localhost:3000
```

## Default Credentials
Register karke naya account banao ya existing account se login karo.

## Tech Stack
- **Frontend**: React, React Router, Axios
- **Backend**: Node.js, Express, MySQL
- **Security**: JWT, Bcrypt
- **Styling**: Custom Pink Theme CSS

## API Endpoints
- POST /api/auth/register - Register user
- POST /api/auth/login - Login user
- GET /api/projects - Get all projects
- POST /api/projects - Create project
- DELETE /api/projects/:id - Delete project
- GET /api/tasks/:projectId - Get tasks
- POST /api/tasks - Create task
- PUT /api/tasks/:id - Update task
- DELETE /api/tasks/:id - Delete task

## Production Tips
- Change JWT_SECRET in .env
- Use environment variables
- Enable HTTPS
- Add rate limiting
- Use PM2 for process management
