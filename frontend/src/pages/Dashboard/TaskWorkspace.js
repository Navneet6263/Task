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
  <div className="relative rounded-[24px] bg-white/90 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-4 py-4 flex flex-col gap-4">
    {/* Subtle Background Glows */}
    <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

    <header className="flex justify-between items-center flex-wrap gap-3 relative z-10 border-b border-slate-100 pb-3">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
            {selectedTeam.name}
          </span>
        </div>
        <h2 className="font-display text-[22px] font-extrabold text-slate-900 tracking-tight">Task Workspace</h2>
        <span className="text-xs font-medium text-slate-500 mt-0.5 block">
          {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'} found
        </span>
      </div>
      
      <div className="flex gap-3 flex-wrap items-center">
        {/* View Switcher */}
        <div className="flex p-1 rounded-xl bg-slate-100/80 border border-slate-200/50 shadow-inner">
          {['list', 'board', 'timeline'].map((type) => (
            <button
              key={type}
              type="button"
              className={`px-3 py-1.5 rounded-md text-[12px] font-bold cursor-pointer capitalize transition-all duration-200 ${
                view === type 
                  ? 'bg-white text-blue-700 shadow-[0_2px_12px_rgba(30,64,175,0.12)]' 
                  : 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
              onClick={() => setView(type)}
            >
              {type}
            </button>
          ))}
        </div>
        
        <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden md:block" />

        {/* Filters */}
        <div className="flex gap-2">
          <select 
            className="h-[36px] rounded-lg border border-slate-200 bg-white/80 text-slate-700 text-xs font-medium px-2.5 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none cursor-pointer" 
            value={filterPriority} 
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="HIGH">🔥 High Priority</option>
            <option value="MEDIUM">⚡ Medium Priority</option>
            <option value="LOW">☕ Low Priority</option>
          </select>
          
          <select 
            className="h-[36px] rounded-lg border border-slate-200 bg-white/80 text-slate-700 text-xs font-medium px-2.5 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none cursor-pointer" 
            value={filterAssignee} 
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="">All Members</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </div>
      </div>
    </header>

    <div className="relative z-10 flex-1 flex flex-col">
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

      {/* Pagination Footer */}
      {view === 'list' && filtered.length > 12 && (
        <footer className="flex gap-1.5 justify-center mt-4 mb-1">
          <button
            type="button"
            className="px-3 h-[34px] rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold cursor-pointer hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                className={`w-[34px] h-[34px] rounded-lg text-[11px] font-extrabold cursor-pointer transition-all shadow-sm ${
                  page === value 
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.3)] border border-transparent scale-105' 
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => setPage(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="px-3 h-[34px] rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold cursor-pointer hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </footer>
      )}
    </div>
  </div>
);

export default TaskWorkspace;
