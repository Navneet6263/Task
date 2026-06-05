import React from 'react';

const Reminders = ({ reminders }) => (
  <article className="relative overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-5 py-6">
    <div className="absolute -top-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

    <header className="flex justify-between items-end mb-5 relative z-10">
      <div>
        <h2 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Reminders</h2>
        <p className="text-xs text-slate-500 font-medium mt-0.5">Actionable insights</p>
      </div>
      <div className="bg-slate-100/80 rounded-full w-8 h-8 flex items-center justify-center text-slate-400 border border-slate-200/50">
        🔔
      </div>
    </header>
    
    <div className="flex flex-col gap-3 relative z-10">
      {reminders.map((item) => {
        // Map tone to vibrant tailwind styles
        const styles = {
          info: 'bg-sky-50 border-sky-200/60 text-sky-900 shadow-[0_2px_10px_rgba(14,165,233,0.1)]',
          warning: 'bg-amber-50 border-amber-200/60 text-amber-900 shadow-[0_2px_10px_rgba(245,158,11,0.1)]',
          danger: 'bg-rose-50 border-rose-200/60 text-rose-900 shadow-[0_2px_10px_rgba(244,63,94,0.1)]',
          success: 'bg-emerald-50 border-emerald-200/60 text-emerald-900 shadow-[0_2px_10px_rgba(16,185,129,0.1)]'
        };
        
        const badgeStyles = {
          info: 'bg-sky-100 text-sky-600 border-sky-200/50',
          warning: 'bg-amber-100 text-amber-600 border-amber-200/50',
          danger: 'bg-rose-100 text-rose-600 border-rose-200/50',
          success: 'bg-emerald-100 text-emerald-600 border-emerald-200/50'
        };

        const icon = {
          info: 'ℹ️',
          warning: '⚠️',
          danger: '🚨',
          success: '✅'
        };

        const toneClass = styles[item.tone] || styles.info;
        const badgeClass = badgeStyles[item.tone] || badgeStyles.info;
        const toneIcon = icon[item.tone] || icon.info;

        return (
          <div
            key={item.title}
            className={`flex items-start gap-3 rounded-[16px] px-4 py-3 border transition-transform hover:-translate-y-0.5 ${toneClass}`}
          >
            <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border text-xs shadow-sm ${badgeClass}`}>
              {toneIcon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold tracking-tight mb-0.5 truncate">{item.title}</p>
              <span className="block text-[11px] font-medium opacity-80 leading-snug">{item.note}</span>
            </div>
          </div>
        );
      })}
    </div>
  </article>
);

export default Reminders;
