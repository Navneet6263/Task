import React from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '../../services/feedback';
import { Button, Card, EmptyState } from '../../ui';
import Section from './Section';

const copy = async (code) => {
  try { await navigator.clipboard.writeText(code); notify(`Copied ${code}.`, 'success'); }
  catch { window.prompt('Copy this join code', code); }
};

export default function TeamsSection({ teams, isAdmin }) {
  const navigate = useNavigate();
  return (
    <Section title="Teams & join codes" description="The teams you belong to. Share a team's join code with a new colleague so they can join it when they sign up."
      actions={isAdmin && <Button onClick={() => navigate('/team')}>Manage teams</Button>}>
      {!teams.length && <EmptyState title="You are not in a team yet">Ask your admin to add you, or use a join code when you sign up.</EmptyState>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <Card key={team.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{team.name}</p>
              <p className="text-xs text-muted">{team.type || 'General'} · {team.member_count || 0} members</p>
            </div>
            {team.team_code ? (
              <button type="button" onClick={() => copy(team.team_code)} title="Copy join code"
                className="flex items-center gap-2 rounded-md border border-dashed border-accent/60 bg-accent-soft px-3 py-1.5 font-mono text-sm font-semibold text-accent hover:brightness-95">
                {team.team_code}<span className="font-sans text-[10px] font-semibold uppercase">Copy</span>
              </button>
            ) : <span className="text-xs text-muted">No code</span>}
          </Card>
        ))}
      </div>
      {isAdmin && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Audit logs</p>
            <p className="text-sm text-muted">See who changed what, and when, across your teams.</p>
          </div>
          <Button onClick={() => navigate('/audit-logs')}>Open audit logs</Button>
        </Card>
      )}
    </Section>
  );
}
