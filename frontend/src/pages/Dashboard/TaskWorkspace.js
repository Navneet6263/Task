import React from 'react';
import TaskListView from './TaskListView';
import TaskBoardView from './TaskBoardView';
import TaskTimelineView from './TaskTimelineView';

const TaskWorkspace = ({
  view,
  setView,
  selectedTeam,
  filtered,
  paginated,
  members,
  filterPriority,
  setFilterPriority,
  filterAssignee,
  setFilterAssignee,
  selectedTask,
  setSelectedTask,
  setSheetTab,
  handleStatusChange,
  handleDelete,
  handleApproveDelete,
  handleRejectDelete,
  handlePickBug,
  handleResolveBug,
  page,
  setPage,
  totalPages,
}) => (
  <div className="rounded-2xl bg-white/[0.92] border border-gray-200 shadow-sm px-3.5 py-3.5">
    <header className="flex justify-between items-center mb-3 gap-2 flex-wrap">
      <div>
        <h2 className="font-display text-[21px] font-bold">Task Workspace</h2>
        <span className="text-xs text-gray-500">{filtered.length} tasks in {selectedTeam.name}</span>
      </div>
      
      <div className="flex gap-2 flex-wrap">
        <div className="flex p-[3px] rounded-xl bg-[#ecf1ff]">
          {['list', 'board', 'timeline'].map((type) => (
            <button
              key={type}
              type="button"
              className={`border-none px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer capitalize ${
                view === type ? 'bg-white text-[#1e40af] shadow-[0_2px_10px_rgba(30,64,175,0.14)]' : 'bg-transparent text-gray-600'
              }`}
              onClick={() => setView(type)}
            >
              {type}
            </button>
          ))}
        </div>
        
        <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">All priority</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        
        <select className="h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="">All members</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
      </div>
    </header>

    {view === 'list' && (
      <TaskListView
        paginated={paginated}
        selectedTask={selectedTask}
        setSelectedTask={setSelectedTask}
        setSheetTab={setSheetTab}
        handleStatusChange={handleStatusChange}
        handleDelete={handleDelete}
        handleApproveDelete={handleApproveDelete}
        handleRejectDelete={handleRejectDelete}
        handlePickBug={handlePickBug}
        handleResolveBug={handleResolveBug}
      />
    )}
    
    {view === 'board' && (
      <TaskBoardView
        filtered={filtered}
        setSelectedTask={setSelectedTask}
        setSheetTab={setSheetTab}
        handleStatusChange={handleStatusChange}
        handleApproveDelete={handleApproveDelete}
        handleRejectDelete={handleRejectDelete}
      />
    )}
    
    {view === 'timeline' && <TaskTimelineView filtered={filtered} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} />}

    {view === 'list' && filtered.length > 12 && (
      <footer className="flex gap-1.5 justify-center mt-3">
        <button
          type="button"
          className="min-w-[34px] h-8 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page === 1}
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((value) => (
          <button
            key={value}
            type="button"
            className={`min-w-[34px] h-8 rounded-lg border text-xs font-bold cursor-pointer ${
              page === value ? 'bg-[#2f5dff] border-[#2f5dff] text-white' : 'border-gray-300 bg-white text-gray-700'
            }`}
            onClick={() => setPage(value)}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          className="min-w-[34px] h-8 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={page === totalPages}
        >
          Next
        </button>
      </footer>
    )}
  </div>
);

export default TaskWorkspace;
