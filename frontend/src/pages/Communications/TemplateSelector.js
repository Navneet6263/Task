import React from 'react';

const templates = [
  {
    id: 'blank',
    name: 'Blank Email',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    subject: '',
    body: '',
  },
  {
    id: 'resolved',
    name: 'Issue Resolved',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    subject: 'Update: Your Issue has been Resolved',
    body: 'Hi [Client Name],\n\nWe are pleased to inform you that the issue you reported has been successfully resolved.\n\nPlease let us know if you need any further assistance.\n\nBest regards,\n[Your Name]',
  },
  {
    id: 'update',
    name: 'Project Update',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    subject: 'Project Status Update',
    body: 'Hi [Client Name],\n\nHere is a quick update on the project status:\n\n- [Point 1]\n- [Point 2]\n\nLet me know if you would like to jump on a quick call to discuss.\n\nBest regards,\n[Your Name]',
  },
  {
    id: 'invoice',
    name: 'Invoice Attached',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    subject: 'Invoice for Recent Services',
    body: 'Hi [Client Name],\n\nPlease find the attached invoice for the recent services provided.\n\nIf you have any questions, feel free to reach out.\n\nBest regards,\n[Your Name]',
  },
];

const TemplateSelector = ({ activeTemplate, onSelect }) => {
  return (
    <aside className="w-[320px] flex-shrink-0 bg-[#f8fafc]/80 backdrop-blur-3xl border-r border-slate-200/50 flex flex-col h-full overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="p-8 pb-4 relative z-10">
        <h2 className="font-display text-xl font-black text-slate-800 tracking-tight">Templates</h2>
        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">Pre-written emails</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 relative z-10 custom-scrollbar">
        {templates.map((tpl) => {
          const isActive = activeTemplate?.id === tpl.id;
          return (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl)}
              className={`w-full text-left p-4 rounded-3xl transition-all duration-300 group relative overflow-hidden ${
                isActive 
                  ? 'bg-blue-600 shadow-[0_12px_24px_rgba(37,99,235,0.25)] border border-blue-500/50 -translate-y-1' 
                  : 'bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 hover:shadow-[0_8px_16px_rgba(15,23,42,0.04)]'
              }`}
            >
              {isActive && <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />}
              
              <div className="flex items-center gap-4 relative z-10">
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner transition-colors duration-300 ${
                  isActive ? 'bg-white/15 text-white' : 'bg-slate-50 text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50/50'
                }`}>
                  {tpl.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <strong className={`block text-sm font-extrabold truncate ${isActive ? 'text-white' : 'text-slate-700'}`}>
                    {tpl.name}
                  </strong>
                  <span className={`block text-[11px] font-bold truncate mt-1 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
                    {tpl.subject || 'Write your own message'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default TemplateSelector;
