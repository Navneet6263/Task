import React, { lazy, Suspense } from 'react';
import AppErrorBoundary from './components/AppErrorBoundary';
import './workspace.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { needsAccountSetup, storedUser } from './services/accountState';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard/index'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const PmsHub = lazy(() => import('./pages/PmsHub'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Reports = lazy(() => import('./pages/Reports'));
const RegisterCompany = lazy(() => import('./pages/RegisterCompany'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdmin'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ConsoleSetup = lazy(() => import('./pages/ConsoleSetup'));
const LiveReviewRoom = lazy(() => import('./pages/LiveReviewRoom'));
const TeamWorkspaceRoom = lazy(() => import('./pages/TeamWorkspaceRoom'));
const Communications = lazy(() => import('./pages/Communications'));
const UpdatesPage = lazy(() => import('./pages/Updates'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Timesheet = lazy(() => import('./pages/Timesheet'));
const AccountSetup = lazy(() => import('./pages/AccountSetup'));

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token') || localStorage.getItem('company_token');
  return token ? children : <Navigate to="/login" />;
};

// Someone who signed in with a one-time password from the admin must choose their own first.
const SetupGate = ({ children }) => (needsAccountSetup(storedUser()) ? <Navigate to="/account-setup" replace /> : children);

// Screens outside the shell that are not redesigned yet stay light in dark mode.
const Light = ({ children }) => <div className="theme-light min-h-screen bg-canvas text-ink">{children}</div>;

const SuperAdminRoute = ({ children }) => {
  const token = localStorage.getItem('sa_token');
  return token ? children : <Navigate to="/login?mode=system-admin" replace />;
};

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppErrorBoundary><Suspense fallback={<div role="status" className="p-6 text-slate-500">Loading screen...</div>}><Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/sa-setup" element={<ConsoleSetup />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/account-setup" element={<PrivateRoute><AccountSetup /></PrivateRoute>} />
        <Route path="/live-review" element={<PrivateRoute><Light><LiveReviewRoom /></Light></PrivateRoute>} />
        <Route path="/team-workspace" element={<PrivateRoute><Light><TeamWorkspaceRoom /></Light></PrivateRoute>} />
        <Route path="/updates" element={<PrivateRoute><UpdatesPage /></PrivateRoute>} />
        <Route path="/sa-login" element={<Navigate to="/login?mode=system-admin" replace />} />
        <Route path="/sa-dashboard" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
        <Route path="/" element={<PrivateRoute><SetupGate><Layout /></SetupGate></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="my-tasks" element={<MyTasks />} />
          <Route path="team" element={<TeamManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="pms-hub" element={<PmsHub />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="settings" element={<Settings />} />
          <Route path="communications" element={<Communications />} />
          <Route path="timesheet" element={<Timesheet />} />
          <Route path="calendar" element={<CalendarPage />} />
        </Route>
      </Routes></Suspense></AppErrorBoundary>
    </Router>
  );
}

export default App;
