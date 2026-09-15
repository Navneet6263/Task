export const notify = (message, tone = 'error') => window.dispatchEvent(new CustomEvent('workspace:notice', { detail: { message, tone, id: `${Date.now()}-${Math.random()}` } }));
