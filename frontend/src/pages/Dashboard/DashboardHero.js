import React from 'react';

const DashboardHero = ({ user, today, teamList, selectedTeam, selectTeam, onCreateTask, onManagerAssign }) => (
  <section className="relative flex justify-between gap-4 items-start rounded-3xl px-5 py-5 bg-gradient-to-br from-[rgba(47,93,255,0.95)] to-[rgba(14,165,233,0.88)] text-white overflow-hidden">
    <div className="absolute w-60 h-60 rounded-full right-[-72px] top-[-90px] bg-white/[0.14]" />
    
    <div className="relative z-10">
      <p className="uppercase tracking-wider text-[11px] font-bold opacity-90">Workspace Pulse</p>
      <h1 className="font-display text-[clamp(22px,3vw,34px)] my-1.5 font-extrabold">Welcome back, {user.name?.split(' ')[0] || 'there'}.</h1>
      <p className="text-sm max-w-[640px] opacity-95">Plan faster, assign clearly, and keep delivery smooth. {today}</p>
      
      <div className="mt-3.5 flex gap-2 flex-wrap">
        {teamList.map((team) => (
          <button
            key={team.id}
            type="button"
            className={`border px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
              selectedTeam?.id === team.id 
                ? 'bg-white text-[#1e40af] border-white' 
                : 'border-white/35 bg-white/[0.16] text-white'
            }`}
            onClick={() => selectTeam(team)}
          >
            {team.name}
          </button>
        ))}
        {teamList.length === 0 && <span className="text-xs opacity-90">Create a team to begin.</span>}
      </div>
    </div>
    
    <div className="flex gap-2.5 relative z-10">
      <button
        type="button"
        className="h-[38px] border rounded-xl bg-white text-[#1e40af] text-sm font-bold px-3.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onCreateTask}
        disabled={!selectedTeam}
      >
        Create Task
      </button>
      {user.role === 'manager' && (
        <button
          type="button"
          className="h-[38px] border border-white/45 rounded-xl bg-white/[0.18] text-white text-sm font-bold px-3.5 cursor-pointer"
          onClick={onManagerAssign}
        >
          Manager Assign
        </button>
      )}
    </div>
  </section>
);

export default DashboardHero;
