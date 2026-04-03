const fallbackApiUrl = 'http://localhost:5000/api';

const normalizeApiBase = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return fallbackApiUrl;
  return raw.replace(/\/+$/, '');
};

export const API_BASE_URL = normalizeApiBase(process.env.REACT_APP_API_URL);

export const SA_BASE_URL = `${API_BASE_URL}/sa`;

export const WS_BASE_URL = API_BASE_URL
  .replace(/^http:\/\//i, 'ws://')
  .replace(/^https:\/\//i, 'wss://')
  .replace(/\/api$/, '');

