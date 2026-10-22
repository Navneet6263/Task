import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Switch } from '../../ui';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const PILL_TONES = {
  info: 'border-info/30 bg-info-soft text-info',
  warn: 'border-warn/30 bg-warn-soft text-warn',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  ok: 'border-accent/30 bg-accent-soft text-accent',
};
const DOTS = { info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger', ok: 'bg-accent' };

function Pill({ tone, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition hover:brightness-95 ${PILL_TONES[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />{children}
    </button>
  );
}

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>
);
const InfoIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);

// Greeting, today's highlights, main actions, team switcher and the insights toggle.
const DashboardHero = ({ user, today, agenda, overdue, teamList, selectedTeam, selectTeam, onCreateTask, onManagerAssign, onFocus, showInsights, onToggleInsights }) => {
  const navigate = useNavigate();
  const ready = agenda?.loaded && !agenda.error;
  const pills = [];
  if (ready && agenda.meetingsToday) pills.push(<Pill key="m" tone="info" onClick={() => navigate('/calendar')} title="Open calendar">{plural(agenda.meetingsToday, 'meeting')} today</Pill>);
  if (ready && agenda.tasksDueToday) pills.push(<Pill key="d" tone="warn" onClick={() => onFocus('DUE_TODAY')} title="Show tasks due today">{plural(agenda.tasksDueToday, 'task')} due today</Pill>);
  if (overdue) pills.push(<Pill key="o" tone="danger" onClick={() => onFocus('OVERDUE')} title="Show overdue tasks">{overdue} overdue</Pill>);
  if (ready && !pills.length) pills.push(<Pill key="c" tone="ok" onClick={() => navigate('/calendar')} title="Open calendar">Your day is clear</Pill>);

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">{today}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">{greeting()}, {user.name?.split(' ')[0] || 'there'}</h1>
          {pills.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{pills}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate('/calendar')}><CalendarIcon /> Schedule</Button>
          {user.role === 'manager' && <Button onClick={onManagerAssign}>Manager Assign</Button>}
          <Button variant="primary" onClick={onCreateTask} disabled={!selectedTeam}>+ Create Task</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-subtle/60 px-5 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Choose team">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted"
            title="The cards below show team totals. Filters only change the task list.">
            Team <InfoIcon />
          </span>
          {teamList.map((team) => {
            const active = selectedTeam?.id === team.id;
            return (
              <button key={team.id} type="button" aria-pressed={active} onClick={() => selectTeam(team)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${active ? 'border-line bg-surface text-ink shadow-sm' : 'border-transparent text-muted hover:bg-surface hover:text-ink'}`}>
                {team.name}
              </button>
            );
          })}
          {teamList.length === 0 && <span className="text-sm text-muted">Create a team to begin.</span>}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          Insights <Switch checked={showInsights} onChange={onToggleInsights} label="Show insights" />
        </label>
      </div>
    </section>
  );
};

export default DashboardHero;
