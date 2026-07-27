import React from 'react';

const templates = [
  {
    id: 'blank',
    name: 'Blank Email',
    emoji: '✏️',
    color: 'from-slate-400 to-slate-500',
    bg: 'bg-slate-50',
    accent: 'bg-slate-400',
    desc: 'Write your own message from scratch',
    subject: '',
    body: '',
  },
  {
    id: 'resolved',
    name: 'Issue Resolved',
    emoji: '✅',
    color: 'from-emerald-400 to-green-500',
    bg: 'bg-emerald-50',
    accent: 'bg-emerald-400',
    desc: 'Notify client that issue is fixed',
    subject: 'Update: Your Issue has been Resolved',
    body: 'Hi [Client Name],\n\nWe are pleased to inform you that the issue you reported has been successfully resolved.\n\nPlease let us know if you need any further assistance.\n\nBest regards,\n[Your Name]',
  },
  {
    id: 'update',
    name: 'Project Update',
    emoji: '📊',
    color: 'from-blue-400 to-indigo-500',
    bg: 'bg-blue-50',
    accent: 'bg-blue-400',
    desc: 'Share progress with the client',
    subject: 'Project Status Update',
    body: 'Hi [Client Name],\n\nHere is a quick update on the project status:\n\n- [Point 1]\n- [Point 2]\n\nLet me know if you would like to jump on a quick call to discuss.\n\nBest regards,\n[Your Name]',
  },
  {
    id: 'invoice',
    name: 'Invoice Attached',
    emoji: '🧾',
    color: 'from-violet-400 to-purple-500',
    bg: 'bg-violet-50',
    accent: 'bg-violet-400',
    desc: 'Send billing / invoice to client',
    subject: 'Invoice for Recent Services',
    body: 'Hi [Client Name],\n\nPlease find the attached invoice for the recent services provided.\n\nIf you have any questions, feel free to reach out.\n\nBest regards,\n[Your Name]',
  },
  {
    id: 'followup',
    name: 'Follow Up',
    emoji: '🔔',
    color: 'from-amber-400 to-orange-500',
    bg: 'bg-amber-50',
    accent: 'bg-amber-400',
    desc: 'Gentle follow-up nudge to client',
    subject: 'Following Up on Our Discussion',
    body: 'Hi [Client Name],\n\nI wanted to follow up on our previous conversation regarding [Topic].\n\nPlease let us know if you have any updates or questions.\n\nBest regards,\n[Your Name]',
  },
  {
    id: 'delay',
    name: 'Delay Notice',
    emoji: '⏳',
    color: 'from-rose-400 to-red-500',
    bg: 'bg-rose-50',
    accent: 'bg-rose-400',
    desc: 'Inform client of timeline delay',
    subject: 'Update on Project Timeline',
    body: 'Hi [Client Name],\n\nWe wanted to inform you that there will be a slight delay in the delivery of [Task/Feature].\n\nWe apologize for the inconvenience and are working hard to minimize the impact.\n\nExpected new delivery: [Date]\n\nBest regards,\n[Your Name]',
  },
];

const TemplateSelector = ({ activeTemplate, onSelect }) => {
  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col h-full overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 relative">
      {/* Decorative glow */}
      <div className="absolute top-0 left-0 w-full h-48 bg-gradient-to-b from-blue-600/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-40 h-40 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 px-6 pt-7 pb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 className="text-base font-black text-white tracking-tight">Templates</h2>
          <span className="ml-auto text-[10px] font-bold bg-white/10 text-slate-300 px-2 py-0.5 rounded-full">{templates.length}</span>
        </div>
        <p className="text-[11px] font-medium text-slate-400 mt-1 pl-[42px]">Pick a template or start fresh</p>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-white/[0.07] mb-3" />

      {/* Template list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2 relative z-10">
        {templates.map((tpl) => {
          const isActive = activeTemplate?.id === tpl.id;
          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl)}
              className={`w-full text-left p-3.5 rounded-2xl transition-all duration-200 group relative overflow-hidden border ${
                isActive
                  ? 'bg-white/15 border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.3)]'
                  : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12]'
              }`}
            >
              {/* Active shimmer */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent pointer-events-none rounded-2xl" />
              )}

              <div className="flex items-center gap-3 relative z-10">
                {/* Emoji icon box */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all duration-200 ${
                  isActive ? 'bg-white/20 shadow-inner' : `${tpl.bg} group-hover:scale-105`
                }`}>
                  {tpl.emoji}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className={`block text-[13px] font-extrabold truncate ${isActive ? 'text-white' : 'text-slate-200'}`}>
                      {tpl.name}
                    </strong>
                    {isActive && (
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
                    )}
                  </div>
                  <span className={`block text-[11px] font-medium truncate mt-0.5 ${isActive ? 'text-blue-200' : 'text-slate-500'}`}>
                    {tpl.desc}
                  </span>
                </div>

                {/* Arrow */}
                <svg
                  className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${isActive ? 'text-blue-300 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5'}`}
                  fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="relative z-10 px-6 py-4 border-t border-white/[0.07]">
        <p className="text-[10px] text-slate-500 font-medium text-center">All templates are fully editable</p>
      </div>
    </aside>
  );
};

export default TemplateSelector;
