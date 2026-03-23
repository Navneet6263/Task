import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:5000/api' });

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
  companyLogin: (data) => api.post('/company-auth/login', data),
};

export const teams = {
  getAll: () => api.get('/teams'),
  create: (data) => api.post('/teams', data),
  getMembers: (teamId) => api.get(`/teams/${teamId}/members`),
  addMember: (teamId, data) => api.post(`/teams/${teamId}/members`, data),
  removeMember: (teamId, userId) => api.delete(`/teams/${teamId}/members/${userId}`),
};

export const tasks = {
  getByTeam: (teamId, page = 1, limit = 50, status = '') =>
    api.get(`/tasks/team/${teamId}?page=${page}&limit=${limit}${status ? '&status=' + status : ''}`),
  getMy: (page = 1, limit = 50) => api.get(`/tasks/my?page=${page}&limit=${limit}`),
  getFormOptions: () => api.get('/tasks/form-options'),
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
};

export const logs = {
  getByTeam: (teamId) => api.get(`/logs/team/${teamId}`),
  getMy: () => api.get('/logs/my'),
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
  suggestAssignee: (teamId, priority) => api.get(`/analytics/suggest-assignee?teamId=${teamId}&priority=${priority}`),
  energy: (teamId) => api.get(`/analytics/energy/${teamId}`),
  performance: (userId) => api.get(`/analytics/performance/${userId}`),
  behavioral: (teamId) => api.get(`/analytics/behavioral/${teamId}`),
};

export const notifications = {
  getAll: () => api.get('/notifications'),
  readAll: () => api.patch('/notifications/read-all'),
  read: (id) => api.patch(`/notifications/${id}/read`),
};

export default api;
