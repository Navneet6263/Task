const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Same dd-MMM-yyyy format the client uses on paper timesheets.
export const fmtDate = (value) => {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
};
export const fmtHours = (value) => String(Number(Number(value || 0).toFixed(2)));
export const errorOf = (error, fallback) => error?.response?.data?.error || fallback;
export const fieldsOf = (error) => error?.response?.data?.fields || {};

export const GROUP_LABELS = {
  job_type: 'Job Type', work_type: 'Work Type', period_type: 'Period Type',
  registration_status: 'Registration Status', count_type: 'Count Type',
};
