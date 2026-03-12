import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyTasks from './pages/MyTasks';
import TeamManagement from './pages/TeamManagement';
import AuditLogs from './pages/AuditLogs';
import PmsHub from './pages/PmsHub';
import Settings from './pages/Settings';
import AdminPanel from './pages/AdminPanel';
import Reports from './pages/Reports';
import RegisterCompany from './pages/RegisterCompany';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminLogin from './pages/SuperAdminLogin';
import Layout from './components/Layout';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token') || localStorage.getItem('company_token');
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/sa-login" element={<SuperAdminLogin />} />
        <Route path="/sa-dashboard" element={<SuperAdminDashboard />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="my-tasks" element={<MyTasks />} />
          <Route path="team" element={<TeamManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="pms-hub" element={<PmsHub />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
