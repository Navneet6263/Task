import React from 'react';

const PriorityBreakdown = ({ priorityStats, stats }) => {
  const items = [
    { key: 'HIGH', label: 'High Priority', tone: 'high', dotColor: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]', barColor: 'from-rose-500 to-pink-500' },
    { key: 'MEDIUM', label: 'Medium Priority', tone: 'medium', dotColor: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]', barColor: 'from-amber-400 to-orange-500' },
    { key: 'LOW', label: 'Low Priority', tone: 'low', dotColor: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]', barColor: 'from-emerald-400 to-teal-500' },
  ];

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-5 py-6">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
      
      <header className="flex justify-between items-center mb-5 relative z-10">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Priority Split</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Backlog composition</p>
        </div>
        <div className="bg-slate-100/80 rounded-full px-3 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider border border-slate-200/50">
          {stats.total || 0} Tasks
        </div>
      </header>
      
      <div className="flex flex-col gap-4 relative z-10">
        {items.map((item) => {
          const count = priorityStats[item.key] || 0;
          const ratio = stats.total ? Math.round((count / stats.total) * 100) : 0;
          
          return (
            <div key={item.key} className="group">
              <div className="flex justify-between items-end mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.dotColor}`} />
                  <p className="text-sm font-bold text-slate-700">{item.label}</p>
                </div>
                <div className="text-right">
                  <strong className="text-sm font-extrabold text-slate-900">{ratio}%</strong>
                  <span className="text-[10px] text-slate-400 font-medium ml-1.5">({count})</span>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner border border-slate-200/40">
                <div 
                  className={`h-full rounded-full bg-gradient-to-r ${item.barColor} transition-all duration-700 ease-out`} 
                  style={{ width: `${ratio}%` }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
};

export default PriorityBreakdown;
