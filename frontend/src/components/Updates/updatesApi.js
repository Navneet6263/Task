import api from '../../services/api';
export const updatesApi = {
  summary: signal => api.get('/updates/summary', { signal }),
  list: (page, signal) => api.get('/updates', { params: { page }, signal }),
  publish: data => api.post('/updates', data),
  edit: (id, data) => api.put(`/updates/${id}`, data),
  read: (id, version) => api.post(`/updates/${id}/read`, { version }),
  assignees: (q, signal) => api.get('/updates/reports/assignees', { params: { q }, signal }),
  report: data => api.post('/updates/reports', data),
  reports: (page, status, signal) => api.get('/updates/reports', { params: { page, status }, signal }),
  saveReport: (id, data) => api.patch(`/updates/reports/${id}`, data),
};
export const changed = () => window.dispatchEvent(new Event('workspace-updates-changed'));
export const errorText = error => error.response?.status === 404 && error.response?.data?.code === 'NOT_FOUND'
  ? 'The backend has not loaded Updates yet. Restart the backend from this project, then retry.'
  : error.response?.data?.error || 'Unable to complete request. Please try again.';
export const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
