const fallbackApiUrl = 'http://localhost:5000/api';

const normalizeApiBase = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return fallbackApiUrl;
  return raw.replace(/\/+$/, '');
};

export const API_BASE_URL = normalizeApiBase(process.env.REACT_APP_API_URL);

export const SA_BASE_URL = `${API_BASE_URL}/sa`;

export const WS_BASE_URL = `${API_BASE_URL
  .replace(/^http:\/\//i, 'ws://')
  .replace(/^https:\/\//i, 'wss://')
  .replace(/\/+$/, '')}/`;

// The sign-in token travels in the WebSocket protocol header, never in the URL: URLs are written to
// server and proxy logs. The server answers with the "greentask" protocol.
export const openSocket = (token, orgId) => new WebSocket(
  `${WS_BASE_URL}?${new URLSearchParams({ orgId: orgId || '' })}`,
  ['greentask', token],
);



