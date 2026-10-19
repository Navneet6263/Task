import axios from 'axios';
import { API_BASE_URL } from './runtimeConfig';
import { cachedGet, clearQueryCache } from './queryCache';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.response.use(response => {
  if (!['get', 'head'].includes(response.config.method)) clearQueryCache();
  return response;
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('company_token') || localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const activeOrgId = localStorage.getItem('active_org_id');
  if (activeOrgId) config.headers['x-org-id'] = activeOrgId;
  return config;
});

export const auth = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  sendResetLink: (data) => api.post('/auth/send-reset-link', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  companyLogin: (data) => api.post('/company-auth/login', data),
};


export const teams = {
  getAll: async () => {
    const rows = [];
    for (let page = 1; ; page += 1) {
      const response = await cachedGet(api, `/teams?page=${page}&limit=100`);
      const batch = Array.isArray(response.data) ? response.data : response.data?.data || [];
      rows.push(...batch);
      if (batch.length < 100) return { ...response, data: rows };
    }
  },
  create: (data) => api.post('/teams', data),
  getMembers: (teamId) => cachedGet(api, `/teams/${teamId}/members`),
  addMember: (teamId, data) => api.post(`/teams/${teamId}/members`, data),
  removeMember: (teamId, userId) => api.delete(`/teams/${teamId}/members/${userId}`),
};

export const tasks = {
  getByTeam: (teamId, page = 1, limit = 20, filters = {}, signal) =>
    api.get(`/tasks/team/${teamId}`, {
      signal,
      params: {
        page,
        limit,
        ...(filters.board ? { board: true } : {}),
        ...(filters.sort ? { sort: filters.sort } : {}),
        ...(filters.statuses?.length ? { statuses: JSON.stringify(filters.statuses) } : {}),
        ...(filters.priorities?.length ? { priorities: JSON.stringify(filters.priorities) } : {}),
        ...(filters.issueTypes?.length ? { issue_types: JSON.stringify(filters.issueTypes) } : {}),
        ...(filters.assignees?.length ? { assignees: JSON.stringify(filters.assignees) } : {}),
        ...(filters.clientNames?.length ? { clients: JSON.stringify(filters.clientNames) } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.createdFrom ? { created_from: filters.createdFrom } : {}),
        ...(filters.createdTo ? { created_to: filters.createdTo } : {}),
        ...(filters.focus ? { focus: filters.focus } : {}),
      },
    }),
  getDetail: (taskId) => api.get(`/tasks/detail/${taskId}`),
  getMy: (page = 1, limit = 24, status = '') => api.get('/tasks/my', { params: { page, limit, status } }),

  getFormOptions: () => cachedGet(api, '/tasks/form-options', 300000),
  createFormOption: (data) => api.post('/tasks/form-options', data),
  updateFormOption: (id, data) => api.put(`/tasks/form-options/${id}`, data),
  deleteFormOption: (id) => api.delete(`/tasks/form-options/${id}`),
  create: (data) => api.post('/tasks', data),
  managerAssign: (data) => api.post('/tasks/manager-assign', data),
  getOrgUsers: () => api.get('/tasks/org-users'),
  pickBug: (id) => api.patch(`/tasks/${id}/pick`),
  resolveBug: (id) => api.patch(`/tasks/${id}/resolve`),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  togglePriorityLock: (id) => api.patch(`/tasks/${id}/priority-lock`),
  reassign: (id, assign_to) => api.patch(`/tasks/${id}/reassign`, { assign_to }),
  delete: (id) => api.delete(`/tasks/${id}`),
  approveDelete: (id) => api.patch(`/tasks/${id}/approve-delete`),
  rejectDelete: (id) => api.patch(`/tasks/${id}/reject-delete`),
  bulkDelete: (ids) => api.delete('/tasks/bulk/delete', { data: { ids } }),
  getClients: () => cachedGet(api, '/tasks/clients'),
  markTaskViewed: (id, lastCommentId = 0) => api.patch(`/tasks/${id}/view`, { last_comment_id: lastCommentId }),
  snooze: (id, until) => api.patch(`/task-productivity/${id}/snooze`, { until }),
};

export const logs = {
  getByTeam: (teamId, page = 1, limit = 20, userId = '', activity = '') =>
    api.get(`/logs/team/${teamId}?page=${page}&limit=${limit}${userId ? '&userId=' + encodeURIComponent(userId) : ''}${activity ? '&activity=' + encodeURIComponent(activity) : ''}`),
  getMy: (page = 1, limit = 20) => api.get(`/logs/my?page=${page}&limit=${limit}`),
};


export const users = {
  search: (email) => api.get(`/users/search?email=${email}`),
  me: () => api.get('/users/me'),
  orgAccess: () => api.get('/users/org-access'),
};

export const companyAdmin = {
  overview: () => api.get('/company-admin/overview'),
  organizations: () => api.get('/company-admin/organizations'),
  createOrganization: (data) => api.post('/company-admin/organizations', data),
  users: (orgId = '') => api.get(orgId ? `/company-admin/users?org_id=${orgId}` : '/company-admin/users'),
  createAdmin: (data) => api.post('/company-admin/admins', data),
  updateUserRole: (id, role) => api.put(`/company-admin/users/${id}/role`, { role }),
  deleteUser: (id) => api.delete(`/company-admin/users/${id}`),
  searchUsers: (query) => api.get(`/company-admin/users/search?q=${encodeURIComponent(query)}`),
  userOrgAccess: (userId) => api.get(`/company-admin/users/${userId}/org-access`),
  assignOrgAccess: (userId, orgId) => api.post('/company-admin/org-access', { user_id: userId, org_id: orgId }),
  removeOrgAccess: (userId, orgId) => api.delete(`/company-admin/org-access/${userId}/${orgId}`),
};

export const analytics = {
  report: (teamId, params = {}, signal) => api.get(`/analytics/report/${teamId}`, { params, signal }),
  suggestAssignee: (teamId, priority) => api.get(`/analytics/suggest-assignee?teamId=${teamId}&priority=${priority}`),
  energy: (teamId) => api.get(`/analytics/energy/${teamId}`),
  performance: (userId) => api.get(`/analytics/performance/${userId}`),
  behavioral: (teamId) => api.get(`/analytics/behavioral/${teamId}`),
};

export const notifications = {
  getAll: (params = {}) => api.get('/notifications', { params }),
  count: () => api.get('/notifications/unread-count'),
  readAll: () => api.patch('/notifications/read-all'),
  read: (id) => api.patch(`/notifications/${id}/read`),
};

export const comments = {
  getByTask: (taskId) => api.get(`/comments/task/${taskId}`),
  create: (data) => api.post('/comments', data),
  update: (id, data) => api.put(`/comments/${id}`, data),
  delete: (id) => api.delete(`/comments/${id}`),
};

export const communications = {
  send: (data) => api.post('/communications/send', data),
};

// Add-on module; the server refuses every call unless the active organization has it enabled.
export const timesheet = {
  status: () => cachedGet(api, '/timesheet/status', 300000),
  config: () => api.get('/timesheet/config'),
  entries: (params) => api.get('/timesheet/entries', { params }),
  entry: (id) => api.get(`/timesheet/entries/${id}`),
  create: (data) => api.post('/timesheet/entries', data),
  update: (id, data) => api.put(`/timesheet/entries/${id}`, data),
  submit: (id) => api.post(`/timesheet/entries/${id}/submit`),
  remove: (id) => api.delete(`/timesheet/entries/${id}`),
  addLog: (id, data) => api.post(`/timesheet/entries/${id}/logs`, data),
  removeLog: (id, logId) => api.delete(`/timesheet/entries/${id}/logs/${logId}`),
  requestUnlock: (id, reason) => api.post(`/timesheet/entries/${id}/unlock-requests`, { reason }),
  unlockRequests: (status = 'PENDING') => api.get('/timesheet/unlock-requests', { params: { status } }),
  decideUnlock: (id, decision) => api.patch(`/timesheet/unlock-requests/${id}`, { decision }),
  clients: () => api.get('/timesheet/clients'),
  createClient: (name) => api.post('/timesheet/clients', { name }),
  updateClient: (id, data) => api.put(`/timesheet/clients/${id}`, data),
  options: () => api.get('/timesheet/options'),
  addOption: (data) => api.post('/timesheet/options', data),
  setOptionActive: (id, isActive) => api.patch(`/timesheet/options/${id}`, { is_active: isActive }),
  saveSettings: (data) => api.put('/timesheet/settings', data),
  report: (params) => api.get('/timesheet/reports', { params }),
};

export default api;
