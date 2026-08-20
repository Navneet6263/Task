# Task Manager - Jira-like and Easy to Use

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
# Log in to MySQL
mysql -u root -p

# Run the database.sql file
source backend/database.sql
```

### 2. Backend Setup
```bash
cd backend
npm install

# Add your database credentials to the .env file
# Change DB_PASSWORD and JWT_SECRET

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
Register a new account or log in with an existing account.

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
