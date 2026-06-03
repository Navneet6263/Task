import React from 'react';

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const TeamSnapshot = ({ memberSummary, members, maxLoad }) => (
  <article className="rounded-2xl bg-white/[0.92] border border-gray-200 shadow-sm px-3.5 py-3.5">
    <header className="flex justify-between items-center mb-3">
      <h2 className="font-display text-[21px] font-bold">Team Snapshot</h2>
      <span className="text-xs text-gray-500">{members.length} members</span>
    </header>
    
    {memberSummary.length === 0 && <p className="text-xs text-gray-500">No members in this team yet.</p>}
    
    {memberSummary.map((member) => (
      <div key={member.id} className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl grid place-items-center text-white text-[11px] font-extrabold bg-gradient-to-br from-[#2f5dff] to-[#0ea5e9]">
            {initials(member.name)}
          </span>
          <div>
            <p className="text-xs font-bold">{member.name}</p>
            <span className="text-[11px] text-gray-500">{member.role || member.team_role || 'Member'}</span>
          </div>
        </div>
        
        <div className="w-[44%]">
          <div className="h-1.5 rounded-full bg-[#e8edf8] overflow-hidden">
            <span className="block h-full bg-gradient-to-r from-[#2f5dff] to-[#60a5fa]" style={{ width: `${Math.round((member.load / maxLoad) * 100)}%` }} />
          </div>
          <small className="block text-[10px] text-gray-500 text-right mt-1">{member.load} active</small>
        </div>
      </div>
    ))}
  </article>
);

export default TeamSnapshot;
