// Who counts as "my team" on the timesheet, and the date ranges behind the quick filters.
const shift = (date, days) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

// A team of one means we know nothing about their people, so it is treated as no team.
export const hasTeam = (config) => (config.team_ids || []).length > 1;

export const teamPeople = (config) => {
  const team = new Set((config.team_ids || []).map(Number));
  return (config.users || []).filter((user) => team.has(Number(user.id)));
};

// Managers start on their own people, admins on the whole company.
export const defaultScope = (config) => {
  if (!config.permissions?.view_reports) return 'mine';
  return config.role === 'manager' && hasTeam(config) ? 'team' : 'all';
};

export const scopeOptions = (config) => [
  ...(hasTeam(config) ? [['team', `My team (${teamPeople(config).length})`]] : []),
  ['all', 'Everyone'],
  ['mine', 'Only me'],
];

// People in a Done by list: the team first, plus whoever is already chosen so a saved value never disappears.
export const doneByPeople = (config, showEveryone, selectedId) => {
  if (showEveryone || !hasTeam(config)) return config.users || [];
  const team = teamPeople(config);
  const selected = (config.users || []).find((user) => String(user.id) === String(selectedId));
  return selected && !team.some((user) => user.id === selected.id) ? [selected, ...team] : team;
};

export const mondayOf = (date) => shift(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
export const addDays = shift;

export function periodRange(period, today) {
  const month = today.slice(0, 7);
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'week': return { from: mondayOf(today), to: today };
    case 'last_week': { const start = shift(mondayOf(today), -7); return { from: start, to: shift(start, 6) }; }
    case 'month': return { from: `${month}-01`, to: today };
    case 'last_month': { const end = shift(`${month}-01`, -1); return { from: `${end.slice(0, 7)}-01`, to: end }; }
    default: return { from: '', to: '' };
  }
}

export const PERIODS = [
  ['', 'All time'], ['today', 'Today'], ['week', 'This week'], ['last_week', 'Last week'],
  ['month', 'This month'], ['last_month', 'Last month'], ['custom', 'Custom dates'],
];
