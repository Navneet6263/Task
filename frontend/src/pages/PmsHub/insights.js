// Turns performance numbers into short, fair sentences. Peers are compared only as a group.
const periodText = (days) => ({ 30: 'the last 30 days', 90: 'the last 3 months', 180: 'the last 6 months', 365: 'the last year' }[days] || `the last ${days} days`);
export const fmtDays = (value) => (value === null || value === undefined ? '—' : value < 1 ? 'under a day' : `${value} day${value === 1 ? '' : 's'}`);

// Relative difference against the team, as a signed percentage (positive = you are better).
export function versus(mine, team, lowerIsBetter = false) {
  if (mine === null || mine === undefined || !team) return null;
  const diff = lowerIsBetter ? (team - mine) / team : (mine - team) / team;
  return Math.round(diff * 100);
}

export function standing(percentile) {
  if (percentile === null || percentile === undefined) return null;
  if (percentile >= 80) return { label: 'Top performer', tone: 'ok' };
  if (percentile >= 60) return { label: 'Above team average', tone: 'ok' };
  if (percentile >= 40) return { label: 'In line with the team', tone: 'info' };
  return { label: 'Room to grow', tone: 'warn' };
}

export function headline(data) {
  const { me, rank, days } = data;
  if (!me.completed) return `You have not completed any tasks in ${periodText(days)} yet. Your first completion will start your performance picture.`;
  const parts = [`You completed ${me.completed} task${me.completed === 1 ? '' : 's'} in ${periodText(days)}`];
  if (rank.completed !== null) parts[0] += `, more than ${rank.completed}% of your teammates`;
  if (me.medianDays !== null) parts.push(`a typical task takes you ${fmtDays(me.medianDays)}`);
  return `${parts.join(', and ')}.`;
}

// Up to three strengths and three suggestions, based only on measured numbers.
export function highlights(data) {
  const { me, team, rank, now } = data;
  const strengths = [], tips = [];
  if (rank.completed !== null && rank.completed >= 60) strengths.push(`High output: you finish more tasks than ${rank.completed}% of your team.`);
  if (rank.speed !== null && rank.speed >= 60) strengths.push(`Quick turnaround: your typical task (${fmtDays(me.medianDays)}) is faster than ${rank.speed}% of the team.`);
  if (me.onTimeRate !== null && me.onTimeRate >= 85) strengths.push(`Reliable: ${me.onTimeRate}% of your tasks with a due date were finished on time.`);
  if (me.highPriority >= 3) strengths.push(`You took on ${me.highPriority} high-priority tasks, the work that matters most.`);
  if (now.overdue > 0) tips.push(`You have ${now.overdue} overdue task${now.overdue === 1 ? '' : 's'}. Clearing or re-planning them is the quickest win.`);
  if (me.onTimeRate !== null && me.onTimeRate < 70) tips.push(`${100 - me.onTimeRate}% of dated tasks finished late. Agree realistic due dates when you pick up work.`);
  if (rank.speed !== null && rank.speed < 40 && me.medianDays !== null && team.medianDays) tips.push(`Tasks take you ${fmtDays(me.medianDays)} against a team average of ${fmtDays(team.medianDays)}. Splitting big tasks into smaller steps can help.`);
  if (now.open > 15) tips.push(`${now.open} open tasks is a lot to hold. Talk to your manager about priorities.`);
  if (!strengths.length && me.completed) strengths.push('Steady progress: keep closing tasks to build your track record.');
  return { strengths: strengths.slice(0, 3), tips: tips.slice(0, 3) };
}
