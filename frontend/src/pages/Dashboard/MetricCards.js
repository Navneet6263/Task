import React from 'react';

const MetricCards = ({ stats, teamList }) => {
  const metrics = [
    { label: 'Total Tasks', value: stats.total, note: `${teamList.length} teams`, progress: stats.total ? 100 : 0, tone: 'blue' },
    { label: 'Open Queue', value: stats.open, note: `${stats.inProgress} in progress`, progress: stats.total ? Math.round((stats.open / stats.total) * 100) : 0, tone: 'amber' },
    { label: 'Completed', value: `${stats.completion}%`, note: `${stats.done} finished`, progress: stats.completion, tone: 'green' },
    { label: 'Overdue', value: stats.overdue, note: stats.overdue ? 'Needs attention' : 'On track', progress: stats.total ? Math.round((stats.overdue / stats.total) * 100) : 0, tone: 'coral' },
  ];

  const getRingColor = (tone) => {
    if (tone === 'blue') return '#2f5dff';
    if (tone === 'amber') return '#f59e0b';
    if (tone === 'green') return '#10b981';
    return '#f97316';
  };

  return (
    <section className="grid grid-cols-4 gap-3">
      {metrics.map((card, index) => (
        <article
          key={card.label}
          className={`rounded-2xl px-3.5 py-3.5 border border-[#e8edf8] bg-[rgba(255,255,255,0.9)] shadow-[0_10px_24px_rgba(15,23,42,0.08)] flex justify-between gap-3 items-center opacity-0 translate-y-2.5 animate-[dashRise_0.45s_ease_forwards] tone-${card.tone}`}
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div>
            <p className="text-xs text-[#64748b] font-bold">{card.label}</p>
            <h3 className="text-[clamp(20px,2.2vw,30px)] my-1 font-display font-bold">{card.value}</h3>
            <span className="text-[11px] text-[#64748b]">{card.note}</span>
          </div>
          <div 
            className="w-[74px] h-[74px] rounded-full relative grid place-items-center dash-ring"
            style={{
              background: `conic-gradient(${getRingColor(card.tone)} ${card.progress}%, #e8ecf7 0)`,
              '--ring-color': getRingColor(card.tone),
              '--progress': `${card.progress}%`
            }}
          >
            <div className="absolute inset-[7px] rounded-full bg-white" />
            <strong className="relative z-10 text-xs text-[#334155] font-bold">{card.progress}%</strong>
          </div>
        </article>
      ))}
    </section>
  );
};

export default MetricCards;
