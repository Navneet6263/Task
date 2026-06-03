import React from 'react';
import WorkflowSection   from './TaskComposer/WorkflowSection';
import TaskSetupSection  from './TaskComposer/TaskSetupSection';
import OwnershipSection  from './TaskComposer/OwnershipSection';
import ReferenceSection  from './TaskComposer/ReferenceSection';
import TaskSummary       from './TaskComposer/TaskSummary';

const CreateTaskModal = ({
  showTaskModal, setShowTaskModal,
  taskForm, updateTaskFormField, handleReferenceImageChange,
  handleCreateTask, selectedTeam, members,
  availableTaskOptions, createTaskCategories,
}) => {
  if (!showTaskModal) return null;

  return (
    <div
      className="fixed inset-0 bg-[rgba(15,23,42,0.5)] grid place-items-center z-[90] p-4 backdrop-blur-[2px]"
      onClick={() => setShowTaskModal(false)}
    >
      <div
        className="w-[min(1180px,98vw)] h-[min(92vh,960px)] overflow-auto rounded-3xl
          bg-gradient-to-b from-[#f8fbff] via-[#f4f8ff] to-white
          border border-[#dbe7ff] shadow-[0_32px_80px_rgba(15,23,42,0.30)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="uppercase tracking-widest text-[10px] font-bold text-blue-500 mb-1">Task Composer</p>
            <h3 className="font-bold text-2xl text-gray-900 tracking-tight">Create a New Task</h3>
            <p className="mt-1 text-sm text-gray-500">Fill the form — fields adapt based on the issue type you pick.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowTaskModal(false)}
            className="h-9 px-4 rounded-xl border-2 border-gray-200 bg-white text-gray-600 text-sm font-bold
              hover:border-gray-300 hover:text-gray-900 transition-all cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>

        {/* ── Body ── */}
        <form className="flex flex-col gap-5" onSubmit={handleCreateTask}>
          <div className="grid grid-cols-[1.6fr_0.85fr] gap-5 items-start">

            {/* Left — main sections */}
            <div className="flex flex-col gap-4">
              <WorkflowSection  taskForm={taskForm} updateTaskFormField={updateTaskFormField} />
              <TaskSetupSection taskForm={taskForm} updateTaskFormField={updateTaskFormField}
                availableTaskOptions={availableTaskOptions} createTaskCategories={createTaskCategories} />
              <OwnershipSection taskForm={taskForm} updateTaskFormField={updateTaskFormField} members={members} />
              <ReferenceSection taskForm={taskForm} updateTaskFormField={updateTaskFormField}
                handleReferenceImageChange={handleReferenceImageChange} />
            </div>

            {/* Right — live summary sidebar */}
            <TaskSummary taskForm={taskForm} selectedTeam={selectedTeam} members={members} />
          </div>

          {/* ── Footer actions ── */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowTaskModal(false)}
              className="h-10 px-5 rounded-xl border-2 border-gray-200 bg-white text-gray-700 text-sm font-bold
                hover:border-gray-300 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-7 rounded-xl bg-gradient-to-r from-[#2f5dff] to-[#1e40af]
                text-white text-sm font-bold shadow-[0_4px_16px_rgba(47,93,255,0.35)]
                hover:shadow-[0_6px_24px_rgba(47,93,255,0.5)] hover:scale-[1.02]
                transition-all cursor-pointer"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTaskModal;
