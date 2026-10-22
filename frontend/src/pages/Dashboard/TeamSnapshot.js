import React from 'react';
import { Card, CardHeader, Meter } from '../../ui';

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const TeamSnapshot = ({ memberSummary, members, maxLoad }) => (
  <Card>
    <CardHeader title="Team snapshot" aside={`${members.length} members`} />
    <div className="flex flex-col gap-1 p-3">
      {memberSummary.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">No members in this team yet.</p>}
      {memberSummary.map((member) => (
        <div key={member.id} className="flex items-center gap-3 rounded-md px-2 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{initials(member.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold">{member.name}</p>
              <span className="shrink-0 font-mono text-xs text-muted">{member.load} active</span>
            </div>
            <Meter value={member.load} max={maxLoad} label={`${member.name} active tasks`} />
          </div>
        </div>
      ))}
    </div>
  </Card>
);

export default TeamSnapshot;
