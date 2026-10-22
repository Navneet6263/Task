// One place that maps task values to the semantic chip tones of the UI kit.
export const PRIORITY_TONE = { HIGH: 'danger', MEDIUM: 'warn', LOW: 'ok' };
export const STATUS_TONE = { TODO: 'neutral', IN_PROGRESS: 'info', PENDING: 'warn', DONE: 'ok' };
export const STATUS_LABEL = { TODO: 'To do', IN_PROGRESS: 'In progress', PENDING: 'Pending', DONE: 'Done' };
export const statusLabel = (status) => STATUS_LABEL[status] || String(status || '').replaceAll('_', ' ');
