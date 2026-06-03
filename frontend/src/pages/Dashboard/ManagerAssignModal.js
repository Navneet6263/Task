import React from 'react';

const ManagerAssignModal = ({ showMgrModal, setShowMgrModal, mgrForm, setMgrForm, handleManagerAssign, orgUsers }) => {
  if (!showMgrModal) return null;

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-[90] p-4" onClick={() => setShowMgrModal(false)}>
      <div className="w-[min(560px,96vw)] max-h-[92vh] overflow-auto rounded-2xl bg-white border border-gray-200 shadow-[0_20px_40px_rgba(15,23,42,0.25)] px-5 py-5 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl">Manager Assign</h3>
        <p className="text-sm text-gray-500">Assign a task to any user in your organization.</p>
        
        <form className="flex flex-col gap-2.5" onSubmit={handleManagerAssign}>
          <input
            className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5"
            placeholder="Task title"
            value={mgrForm.title}
            onChange={(e) => setMgrForm({ ...mgrForm, title: e.target.value })}
            required
          />
          
          <textarea
            className="min-h-[84px] resize-y rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5 py-2.5"
            placeholder="Description"
            value={mgrForm.description}
            onChange={(e) => setMgrForm({ ...mgrForm, description: e.target.value })}
          />
          
          <select
            className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5"
            value={mgrForm.priority}
            onChange={(e) => setMgrForm({ ...mgrForm, priority: e.target.value })}
          >
            <option value="LOW">Low priority</option>
            <option value="MEDIUM">Medium priority</option>
            <option value="HIGH">High priority</option>
          </select>
          
          <select
            className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5"
            value={mgrForm.assigned_to}
            onChange={(e) => setMgrForm({ ...mgrForm, assigned_to: e.target.value })}
            required
          >
            <option value="">Select member</option>
            {orgUsers.map((orgUser) => (
              <option key={orgUser.id} value={orgUser.id}>
                {orgUser.name} ({orgUser.role})
              </option>
            ))}
          </select>
          
          <input
            className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5"
            type="date"
            value={mgrForm.due_date}
            onChange={(e) => setMgrForm({ ...mgrForm, due_date: e.target.value })}
          />
          
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-[38px] border border-gray-300 rounded-xl bg-white text-gray-700 text-sm font-bold px-3.5 cursor-pointer"
              onClick={() => setShowMgrModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-[38px] border border-white rounded-xl bg-white text-[#1e40af] text-sm font-bold px-3.5 cursor-pointer"
            >
              Assign Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManagerAssignModal;
