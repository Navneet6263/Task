import React from 'react';

const Reminders = ({ reminders }) => (
  <article className="rounded-2xl bg-white/[0.92] border border-gray-200 shadow-sm px-3.5 py-3.5">
    <header className="flex justify-between items-center mb-3">
      <h2 className="font-display text-[21px] font-bold">Reminders</h2>
      <span className="text-xs text-gray-500">Action points</span>
    </header>
    
    <div className="flex flex-col gap-2">
      {reminders.map((item) => (
        <div
          key={item.title}
          className={`rounded-xl px-2.5 py-2.5 ${
            item.tone === 'info' ? 'bg-sky-100' :
            item.tone === 'warning' ? 'bg-amber-100' :
            item.tone === 'danger' ? 'bg-red-100' : 'bg-green-100'
          }`}
        >
          <p className="text-xs font-extrabold mb-0.5">{item.title}</p>
          <span className="text-[11px] text-gray-600">{item.note}</span>
        </div>
      ))}
    </div>
  </article>
);

export default Reminders;
