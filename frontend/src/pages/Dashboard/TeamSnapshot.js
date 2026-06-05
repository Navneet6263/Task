import React from 'react';

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const TeamSnapshot = ({ memberSummary, members, maxLoad }) => (
  <article className="relative overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-5 py-6">
    <div className="absolute top-0 left-0 w-40 h-40 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
    
    <header className="flex justify-between items-end mb-5 relative z-10">
      <div>
        <h2 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Team Snapshot</h2>
        <p className="text-xs text-slate-500 font-medium mt-0.5">Top contributors by active tasks</p>
      </div>
      <div className="flex items-center gap-1.5 bg-slate-100/80 rounded-full px-3 py-1 border border-slate-200/50">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{members.length} Members</span>
      </div>
    </header>
    
    <div className="flex flex-col gap-3.5 relative z-10">
      {memberSummary.length === 0 && (
        <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <p className="text-sm text-slate-500 font-medium">No members in this team yet.</p>
        </div>
      )}
      
      {memberSummary.map((member) => (
        <div key={member.id} className="group flex items-center justify-between gap-3 p-2 -mx-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="w-10 h-10 rounded-2xl grid place-items-center text-white text-xs font-extrabold bg-gradient-to-br from-indigo-500 via-blue-500 to-sky-400 shadow-[0_4px_12px_rgba(59,130,246,0.3)] transform group-hover:scale-105 transition-transform">
                {initials(member.name)}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-tight">{member.name}</p>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{member.role || member.team_role || 'Member'}</span>
            </div>
          </div>
          
          <div className="w-32 flex flex-col items-end gap-1.5">
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner border border-slate-200/40">
              <span 
                className="block h-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-700 ease-out" 
                style={{ width: `${Math.round((member.load / maxLoad) * 100)}%` }} 
              />
            </div>
            <strong className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">
              {member.load} Active
            </strong>
          </div>
        </div>
      ))}
    </div>
  </article>
);

export default TeamSnapshot;
