import axios from 'axios';
import { API_BASE_URL } from './runtimeConfig';
import { cachedGet, clearQueryCache } from './queryCache';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// The sign-in has expired or is no longer valid: forget it and show the sign-in page.
const SESSION_ENDED = ['Invalid token', 'Authentication required'];
export const endedSession = (error) => error?.response?.status === 401 && SESSION_ENDED.includes(error.response.data?.error);

api.interceptors.response.use(response => {
  if (!['get', 'head'].includes(response.config.method)) clearQueryCache();
  return response;
}, (error) => {
  if (endedSession(error) && window.location.pathname !== '/login') {
    ['token', 'user', 'company_token', 'company_user', 'active_org_id'].forEach((key) => localStorage.removeItem(key));
    clearQueryCache();
    window.location.assign('/login');
  }
  return Promise.reject(error);
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
  update: (teamId, data) => api.patch(`/teams/${teamId}`, data),
  candidates: (teamId, q = '', signal) => api.get(`/teams/${teamId}/candidates`, { params: { q }, signal }),
  updateMemberRole: (teamId, userId, role) => api.patch(`/teams/${teamId}/members/${userId}`, { role }),
  setLeader: (teamId, userId) => api.put(`/teams/${teamId}/leader`, { user_id: userId }),
  people: (orgId) => api.get(`/teams/people/${orgId}`),
  sharing: (teamId) => api.get(`/teams/${teamId}/sharing`),
  share: (teamId, otherId, bothWays) => api.post(`/teams/${teamId}/sharing`, { team_id: otherId, both_ways: bothWays }),
  unshare: (teamId, otherId, direction) => api.delete(`/teams/${teamId}/sharing/${otherId}`, { params: { direction } }),
  sharingOverview: () => api.get('/teams/sharing/overview'),
};

// Jira-style extras: task keys, labels, subtasks and links between tasks.
export const taskExtras = {
  meta: () => api.get('/task-extras/meta'),
  setPrefix: (prefix) => api.put('/task-extras/meta/prefix', { prefix }),
  setWorkType: (workType) => api.put('/task-extras/meta/work-type', { work_type: workType }),
  createLabel: (data) => api.post('/task-extras/labels', data),
  updateLabel: (id, data) => api.patch(`/task-extras/labels/${id}`, data),
  deleteLabel: (id) => api.delete(`/task-extras/labels/${id}`),
  summary: (ids) => api.get('/task-extras/summary', { params: { ids: ids.join(',') } }),
  search: (q, teamId) => api.get('/task-extras/search', { params: { q, ...(teamId ? { team_id: teamId } : {}) } }),
  detail: (taskId) => api.get(`/task-extras/${taskId}`),
  setLabels: (taskId, labelIds) => api.put(`/task-extras/${taskId}/labels`, { label_ids: labelIds }),
  addSubtask: (taskId, data) => api.post(`/task-extras/${taskId}/subtasks`, data),
  setParent: (taskId, parentId) => api.put(`/task-extras/${taskId}/parent`, { parent_id: parentId }),
  addLink: (taskId, data) => api.post(`/task-extras/${taskId}/links`, data),
  removeLink: (taskId, linkId) => api.delete(`/task-extras/${taskId}/links/${linkId}`),
  apply: (taskId, data) => api.post(`/task-extras/${taskId}/apply`, data),
};

// "Sheet to task": a person's linked Google Sheets whose new rows become their tasks.
export const taskSheets = {
  status: () => api.get('/task-sheets/status'),
  list: () => api.get('/task-sheets'),
  preview: (url) => api.post('/task-sheets/preview', { url }),
  create: (data) => api.post('/task-sheets', data),
  update: (id, data) => api.put(`/task-sheets/${id}`, data),
  sync: (id) => api.post(`/task-sheets/${id}/sync`),
  remove: (id) => api.delete(`/task-sheets/${id}`),
};

// An admin changes what someone can do (member, manager, admin), optionally with the teams they lead.
export const setAccessRole = (isCompanyAdmin, userId, role, leadTeamIds) => api.put(
  isCompanyAdmin ? `/company-admin/users/${userId}/role` : `/admin/users/${userId}/role`,
  { role, ...(leadTeamIds ? { lead_team_ids: leadTeamIds } : {}) },
);

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
  getMy: (page = 1, limit = 24, status = '', extra = {}, signal) => api.get('/tasks/my', {
    signal,
    params: {
      page, limit, status,
      ...(extra.priorities?.length ? { priorities: JSON.stringify(extra.priorities) } : {}),
      ...(extra.search ? { search: extra.search } : {}),
      ...(extra.sort ? { sort: extra.sort } : {}),
      ...(extra.focus ? { focus: extra.focus } : {}),
    },
  }),

  getFormOptions: () => cachedGet(api, '/tasks/form-options', 300000),
  createFormOption: (data) => api.post('/tasks/form-options', data),
  updateFormOption: (id, data) => api.put(`/tasks/form-options/${id}`, data),
  deleteFormOption: (id) => api.delete(`/tasks/form-options/${id}`),
  create: (data) => api.post('/tasks', data),
  bulk: (rows) => api.post('/tasks/bulk', { rows }),
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
  timeLogs: (id) => api.get(`/tasks/${id}/time-logs`),
  addTimeLog: (id, data) => api.post(`/tasks/${id}/time-logs`, data),
  deleteTimeLog: (id, logId) => api.delete(`/tasks/${id}/time-logs/${logId}`),
};

// Add-on module; the server refuses every call when it is not enabled for the organization.
export const timesheet = {
  status: () => cachedGet(api, '/timesheet/status', 300000),
  config: () => api.get('/timesheet/config'),
  tasks: (params) => api.get('/timesheet/tasks', { params }),
  entries: (params) => api.get('/timesheet/entries', { params }),
  entry: (id) => api.get(`/timesheet/entries/${id}`),
  create: (data) => api.post('/timesheet/entries', data),
  bulk: (rows, mode) => api.post('/timesheet/entries/bulk', { rows, mode }),
  update: (id, data) => api.put(`/timesheet/entries/${id}`, data),
  submit: (id) => api.post(`/timesheet/entries/${id}/submit`),
  remove: (id) => api.delete(`/timesheet/entries/${id}`),
  addLog: (id, data) => api.post(`/timesheet/entries/${id}/logs`, data),
  removeLog: (id, logId) => api.delete(`/timesheet/entries/${id}/logs/${logId}`),
  requestUnlock: (id, reason) => api.post(`/timesheet/entries/${id}/unlock-requests`, { reason }),
  unlockRequests: (status = 'PENDING') => api.get('/timesheet/unlock-requests', { params: { status } }),
  decideUnlock: (id, decision) => api.patch(`/timesheet/unlock-requests/${id}`, { decision }),
  createClient: (name, agentId) => api.post('/timesheet/clients', { name, ...(agentId ? { agent_id: agentId } : {}) }),
  form: () => api.get('/timesheet/form'),
  saveForm: (layout, version) => api.put('/timesheet/form', { layout, version }),
  resetForm: () => api.delete('/timesheet/form'),
  saveSettings: (data) => api.put('/timesheet/settings', data),
  report: (params) => api.get('/timesheet/reports', { params }),
  teamWeek: (params) => api.get('/timesheet/team-week', { params }),
};

// Settings → Clients: the organization's client list and the "pick only from the list" rule.
// The signed-in person's own account: first password after an admin's sheet, and the sign-in email.
export const account = {
  firstPassword: (password) => api.post('/users/me/first-password', { password }),
  startEmail: (email) => api.post('/users/me/email/start', { email }),
  verifyEmail: (code) => api.post('/users/me/email/verify', { code }),
};

// Employee-code sign-in (HRMS import) and the "show all tasks" switch; each needs its module on.
export const hrms = {
  status: () => api.get('/hrms/status'),
  employees: () => api.get('/hrms/employees'),
  importRows: (data) => api.post('/hrms/import', data),
  loginSheet: () => api.post('/hrms/login-sheet'),
  resetPassword: (id) => api.post(`/hrms/employees/${id}/reset-password`),
  saveSettings: (data) => api.put('/hrms/settings', data),
};

export const clients = {
  list: () => api.get('/clients'),
  create: (name, agentId) => api.post('/clients', { name, ...(agentId ? { agent_id: agentId } : {}) }),
  update: (id, data) => api.patch(`/clients/${id}`, data),
  importList: (names, agentId) => api.post('/clients/import', { names, ...(agentId ? { agent_id: agentId } : {}) }),
  createAgent: (name) => api.post('/clients/agents', { name }),
  updateAgent: (id, data) => api.patch(`/clients/agents/${id}`, data),
  setPickOnly: (pickOnly) => api.put('/clients/settings', { pick_only: pickOnly }),
};

// The organization's designed "Create task" form (null layout = classic form).
export const taskForm = {
  get: () => api.get('/task-form'),
  save: (layout, version) => api.put('/task-form', { layout, version }),
  reset: () => api.delete('/task-form'),
  // Hours logged on tasks across the organization, for reports (managers and admins).
  timeReport: (params) => api.get('/task-form/time-report', { params }),
};

export const logs = {
  getByTeam: (teamId, page = 1, limit = 20, userId = '', activity = '', extra = {}) =>
    api.get(`/logs/team/${teamId}?page=${page}&limit=${limit}${userId ? '&userId=' + encodeURIComponent(userId) : ''}${activity ? '&activity=' + encodeURIComponent(activity) : ''}`, {
      params: { ...(extra.q ? { q: extra.q } : {}), ...(extra.from ? { from: extra.from } : {}), ...(extra.to ? { to: extra.to } : {}) },
    }),
  getMy: (page = 1, limit = 20) => api.get(`/logs/my?page=${page}&limit=${limit}`),
};


export const users = {
  search: (email) => api.get(`/users/search?email=${email}`),
  me: () => api.get('/users/me'),
  orgAccess: () => api.get('/users/org-access'),
  uploadAvatar: (image) => api.post('/users/me/avatar', { image }),
  removeAvatar: () => api.delete('/users/me/avatar'),
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
  reportTasks: (teamId, params = {}, signal) => api.get(`/analytics/report/${teamId}/tasks`, { params, signal }),
  myPerformance: (days = 90, signal) => api.get('/analytics/me/performance', { params: { days }, signal }),
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
  status: () => cachedGet(api, '/communications/status', 300000),
  send: (data) => api.post('/communications/send', data),
  history: (page = 1, mine = false) => api.get('/communications/history', { params: { page, ...(mine ? { mine: 'true' } : {}) } }),
  historyItem: (id) => api.get(`/communications/history/${id}`),
  templates: () => api.get('/communications/templates'),
  createTemplate: (data) => api.post('/communications/templates', data),
  updateTemplate: (id, data) => api.put(`/communications/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/communications/templates/${id}`),
};

export const chat = {
  unread: () => api.get('/chat/unread/counts'),
  threads: (teamId) => api.get(`/chat/${teamId}/threads`),
  messages: (teamId, threadId, before = 0) => api.get(`/chat/${teamId}`, { params: { thread_id: threadId, ...(before ? { before } : {}) } }),
  send: (teamId, data) => api.post(`/chat/${teamId}`, data),
  markRead: (teamId, threadId) => api.post(`/chat/${teamId}/read`, { thread_id: threadId }),
  direct: (teamId, userId) => api.post(`/chat/${teamId}/direct-thread`, { target_user_id: userId }),
  activeSession: (teamId) => api.get(`/chat/${teamId}/review-sessions/active`),
  sessions: (teamId) => api.get(`/chat/${teamId}/review-sessions`),
  startSession: (teamId, data) => api.post(`/chat/${teamId}/review-sessions`, data),
  joinSession: (id) => api.post(`/chat/review-sessions/${id}/join`),
  leaveSession: (id) => api.post(`/chat/review-sessions/${id}/leave`),
  endSession: (id, reason) => api.post(`/chat/review-sessions/${id}/end`, { reason }),
  decideSession: (id, decision, remark) => api.post(`/chat/review-sessions/${id}/decision`, { decision, remark }),
};

export const notes = {
  list: (q = '') => api.get('/notes', { params: q ? { q } : {} }),
  create: (data) => api.post('/notes', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  pin: (id, pinned) => api.patch(`/notes/${id}/pin`, { pinned }),
  remove: (id) => api.delete(`/notes/${id}`),
};

export const calendar = {
  events: (from, to, scope) => api.get('/calendar/events', { params: { from, to, ...(scope === 'team' ? { scope } : {}) } }),
  event: (id) => api.get(`/calendar/events/${id}`),
  members: () => cachedGet(api, '/calendar/members', 300000),
  create: (data) => api.post('/calendar/events', data),
  update: (id, data) => api.put(`/calendar/events/${id}`, data),
  remove: (id) => api.delete(`/calendar/events/${id}`),
  respond: (id, response) => api.patch(`/calendar/events/${id}/response`, { response }),
};

// Add-on module; the server refuses every call unless the active organization has it enabled.

export default api;
