import React from 'react';

const PriorityBreakdown = ({ priorityStats, stats }) => {
  const items = [
    { key: 'HIGH', label: 'High', tone: 'high', dotColor: 'bg-[#f97316]' },
    { key: 'MEDIUM', label: 'Medium', tone: 'medium', dotColor: 'bg-[#f59e0b]' },
    { key: 'LOW', label: 'Low', tone: 'low', dotColor: 'bg-[#10b981]' },
  ];

  return (
    <article className="rounded-2xl bg-white/[0.92] border border-gray-200 shadow-sm px-3.5 py-3.5">
      <header className="flex justify-between items-center mb-3">
        <h2 className="font-display text-[21px] font-bold">Priority Split</h2>
        <span className="text-xs text-gray-500">Backlog mix</span>
      </header>
      
      {items.map((item) => {
        const count = priorityStats[item.key];
        const ratio = stats.total ? Math.round((count / stats.total) * 100) : 0;
        
        return (
          <div key={item.key} className="grid grid-cols-[120px_1fr_42px] items-center gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${item.dotColor}`} />
              <p className="text-xs font-bold">{item.label}</p>
            </div>
            <div className="h-[7px] rounded-full bg-[#e7ecf7] overflow-hidden">
              <span className="block h-full bg-gradient-to-r from-[#2f5dff] to-[#60a5fa]" style={{ width: `${ratio}%` }} />
            </div>
            <strong className="text-xs text-right text-gray-600">{ratio}%</strong>
          </div>
        );
      })}
    </article>
  );
};

export default PriorityBreakdown;
