import React from 'react';
import TaskBoardView from './TaskBoardView';
import TaskListView from './TaskListView';
import TaskTimelineView from './TaskTimelineView';
import TaskFilterBar from './TaskFilters/TaskFilterBar';
import FocusViews from './TaskFilters/FocusViews';
import SavedViewsBar from './TaskFilters/SavedViewsBar';

const visiblePages = (page, totalPages) => {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const TaskWorkspace = (props) => {
  const {
    view, setView, selectedTeam, filtered, paginated, members,
    filterPriority, setFilterPriority, filterAssignee, setFilterAssignee,
    filterStatus, setFilterStatus, filterType, setFilterType,
    filterClientNames, setFilterClientNames, clientNameOptions,
    filterSearch, setFilterSearch, filterCreatedFrom, setFilterCreatedFrom,
    filterCreatedTo, setFilterCreatedTo, selectedTask, setSelectedTask,
    setSheetTab, handleStatusChange, handleDelete, handleApproveDelete,
    handleRejectDelete, handlePickBug, handleResolveBug, onBulkDelete,
    page, setPage, totalPages,
    focusMode, setFocusMode, userId, handleSnooze,
  } = props;

  const activeFilterCount = [
    filterPriority.length, filterAssignee.length, filterStatus.length,
    filterType.length, filterClientNames.length, filterSearch,
    filterCreatedFrom, filterCreatedTo,
  ].filter(Boolean).length;
  const filters = {
    priorities: filterPriority,
    assignees: filterAssignee,
    statuses: filterStatus,
    issueTypes: filterType,
    clientNames: filterClientNames,
    search: filterSearch,
    createdFrom: filterCreatedFrom,
    createdTo: filterCreatedTo,
    activeCount: activeFilterCount,
  };
  const setters = {
    priorities: setFilterPriority,
    assignees: setFilterAssignee,
    statuses: setFilterStatus,
    issueTypes: setFilterType,
    clientNames: setFilterClientNames,
    search: setFilterSearch,
    createdFrom: setFilterCreatedFrom,
    createdTo: setFilterCreatedTo,
  };
  const clearFilters = () => {
    setFilterPriority([]);
    setFilterAssignee([]);
    setFilterStatus([]);
    setFilterType([]);
    setFilterClientNames([]);
    setFilterSearch('');
    setFilterCreatedFrom('');
    setFilterCreatedTo('');
  };

  return (
    <div className="relative rounded-[24px] bg-white/90 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-4 py-4 flex flex-col gap-3">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <header className="flex justify-between items-center flex-wrap gap-3 relative z-10 border-b border-slate-100 pb-3">
        <div>
          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
            {selectedTeam.name}
          </span>
          <h2 className="font-display text-[22px] font-extrabold text-slate-900 tracking-tight mt-1.5">Task Workspace</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-medium text-slate-500">
              {props.totalTasks ?? filtered.length} {(props.totalTasks ?? filtered.length) === 1 ? 'task' : 'tasks'} found
            </span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                <span className="w-3.5 h-3.5 bg-blue-600 text-white rounded-full inline-flex items-center justify-center text-[9px]">{activeFilterCount}</span>
                filters active
              </span>
            )}
          </div>
        </div>

        <div className="flex p-1 rounded-xl bg-slate-100/80 border border-slate-200/50 shadow-inner">
          {['list', 'board', 'timeline'].map((type) => (
            <button key={type} type="button" className={`px-3 py-1.5 rounded-md text-[12px] font-bold capitalize transition-all ${view === type ? 'bg-white text-blue-700 shadow-[0_2px_12px_rgba(30,64,175,0.12)]' : 'text-slate-500 hover:bg-slate-200/50'}`} onClick={() => setView(type)}>
              {type}
            </button>
          ))}
        </div>
      </header>

      <TaskFilterBar filters={filters} setters={setters} members={members} clientNameOptions={clientNameOptions} onClear={clearFilters} />
      <FocusViews value={focusMode} onChange={setFocusMode} />
      <SavedViewsBar teamId={selectedTeam.id} userId={userId} view={view} setView={setView} focusMode={focusMode} setFocusMode={setFocusMode} filters={filters} setters={setters} />

      <div className="relative z-10 flex-1 flex flex-col">
        {view === 'list' && (
          <TaskListView paginated={paginated} selectedTask={selectedTask} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} handleStatusChange={handleStatusChange} handleSnooze={handleSnooze} handleDelete={handleDelete} handleApproveDelete={handleApproveDelete} handleRejectDelete={handleRejectDelete} handlePickBug={handlePickBug} handleResolveBug={handleResolveBug} onBulkDelete={onBulkDelete} />
        )}
        {view === 'board' && (
          <TaskBoardView filtered={filtered} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} handleStatusChange={handleStatusChange} handleSnooze={handleSnooze} handleApproveDelete={handleApproveDelete} handleRejectDelete={handleRejectDelete} />
        )}
        {view === 'timeline' && (
          <TaskTimelineView filtered={filtered} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} />
        )}

        {totalPages > 1 && (
          <footer className="flex gap-1.5 justify-center mt-4 mb-1">
            <button type="button" className="px-3 h-[34px] rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold disabled:opacity-40" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</button>
            {visiblePages(page, totalPages).map((value) => (
              <button key={value} type="button" className={`w-[34px] h-[34px] rounded-lg text-[11px] font-extrabold shadow-sm ${page === value ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} onClick={() => setPage(value)}>{value}</button>
            ))}
            <button type="button" className="px-3 h-[34px] rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold disabled:opacity-40" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next</button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default TaskWorkspace;
