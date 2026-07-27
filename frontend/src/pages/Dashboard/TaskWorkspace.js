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
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  filterSearch,
  setFilterSearch,
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
}) => {
  const activeFilterCount = [filterPriority, filterAssignee, filterStatus, filterType, filterSearch].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterPriority('');
    setFilterAssignee('');
    setFilterStatus('');
    setFilterType('');
    setFilterSearch('');
  };

  const selectClass = "h-[34px] rounded-lg border border-slate-200 bg-white/80 text-slate-700 text-[11px] font-medium px-2.5 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none cursor-pointer min-w-[120px]";

  return (
    <div className="relative rounded-[24px] bg-white/90 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-4 py-4 flex flex-col gap-3">
      {/* Subtle Background Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* ── Row 1: Title + View Switcher ── */}
      <header className="flex justify-between items-center flex-wrap gap-3 relative z-10 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
              {selectedTeam.name}
            </span>
          </div>
          <h2 className="font-display text-[22px] font-extrabold text-slate-900 tracking-tight">Task Workspace</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-medium text-slate-500">
              {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'} found
            </span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                <span className="w-3.5 h-3.5 bg-blue-600 text-white rounded-full inline-flex items-center justify-center text-[9px]">{activeFilterCount}</span>
                filter{activeFilterCount > 1 ? 's' : ''} active
              </span>
            )}
          </div>
        </div>

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
      </header>

      {/* ── Row 2: Search + Filters ── */}
      <div className="relative z-10 flex flex-wrap gap-2 items-center">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[180px] max-w-[260px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search tasks..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="w-full h-[34px] pl-8 pr-3 rounded-lg border border-slate-200 bg-white/80 text-slate-700 text-[11px] font-medium shadow-sm hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none placeholder:text-slate-400"
          />
          {filterSearch && (
            <button
              type="button"
              onClick={() => setFilterSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        <div className="h-[18px] w-[1px] bg-slate-200 hidden sm:block" />

        {/* Status Filter */}
        <select className={selectClass} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="TODO">📋 To Do</option>
          <option value="IN_PROGRESS">⚙️ In Progress</option>
          <option value="PENDING">⏳ Pending</option>
          <option value="DONE">✅ Done</option>
        </select>

        {/* Priority Filter */}
        <select className={selectClass} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">All Priorities</option>
          <option value="HIGH">🔥 High</option>
          <option value="MEDIUM">⚡ Medium</option>
          <option value="LOW">☕ Low</option>
        </select>

        {/* Issue Type Filter */}
        <select className={selectClass} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="task">📌 Task</option>
          <option value="bug">🐛 Bug</option>
          <option value="feature">✨ Feature</option>
          <option value="story">📖 Story</option>
          <option value="enhancement">🚀 Enhancement</option>
        </select>

        {/* Assignee Filter */}
        <select className={selectClass} value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="">All Members</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>

        {/* Clear All Button */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="h-[34px] px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100 hover:border-red-300 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shadow-sm"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Clear All
          </button>
        )}
      </div>

      {/* ── Task Views ── */}
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
};

export default TaskWorkspace;
