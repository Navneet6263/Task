import React from 'react';

const initials = (name) => {
  if (!name) return 'US';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const ReassignModal = ({ reassignModal, setReassignModal, teamMembers, selectedMember, setSelectedMember, handleReassign }) => {
  if (!reassignModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setReassignModal(null)}>
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        
        <header className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">Reassign Task</h3>
          <p className="text-xs font-bold text-slate-500 mt-1 truncate">
            {reassignModal.title}
          </p>
        </header>

        <div className="p-6 overflow-y-auto flex-1 bg-white">
          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">Select Team Member</p>
          
          <div className="flex flex-col gap-2">
            {teamMembers.map(member => (
              <button
                key={member.id}
                type="button"
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  selectedMember === member.id 
                    ? 'border-blue-500 bg-blue-50/50 shadow-[0_4px_12px_rgba(59,130,246,0.15)] ring-1 ring-blue-500' 
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedMember(member.id)}
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-extrabold text-white shadow-sm ${
                  selectedMember === member.id ? 'bg-gradient-to-br from-blue-600 to-sky-500' : 'bg-gradient-to-br from-slate-400 to-slate-300'
                }`}>
                  {initials(member.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <strong className={`block text-sm font-bold truncate ${selectedMember === member.id ? 'text-blue-900' : 'text-slate-800'}`}>
                    {member.name}
                  </strong>
                  <span className="block text-[11px] font-medium text-slate-500 mt-0.5">
                    {member.team_role || 'Member'} • {member.current_tasks} active tasks
                  </span>
                </div>
                {selectedMember === member.id && (
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px]">
                    ✓
                  </span>
                )}
              </button>
            ))}
            
            {teamMembers.length === 0 && (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-bold text-slate-500">No other members available</p>
              </div>
            )}
          </div>
        </div>

        <footer className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button 
            type="button" 
            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
            onClick={() => setReassignModal(null)}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 shadow-[0_4px_12px_rgba(37,99,235,0.3)] hover:bg-blue-700 transition-all disabled:opacity-50"
            onClick={handleReassign}
            disabled={!selectedMember}
          >
            Confirm Reassign
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ReassignModal;
