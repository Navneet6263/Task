import React from 'react';
import MyDayPlan from './MyDayPlan';
import ActiveFilterSummary from './TaskFilters/ActiveFilterSummary';
import TaskBoardView from './TaskBoardView';
import TaskListView from './TaskListView';
import TaskTimelineView from './TaskTimelineView';
import TaskFilterBar from './TaskFilters/TaskFilterBar';
import FocusViews from './TaskFilters/FocusViews';
import SavedViewsBar from './TaskFilters/SavedViewsBar';
import { Button, Card, Chip, Segmented, Select } from '../../ui';

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

  const count = props.totalTasks ?? filtered.length;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Tasks</h2>
            <Chip tone="ok">{selectedTeam.name}</Chip>
          </div>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            {count} {count === 1 ? 'task' : 'tasks'} found
            {activeFilterCount > 0 && <Chip tone="info">{activeFilterCount} filters active</Chip>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select aria-label="Task sort order" value={props.sort || 'newest'} onChange={e => props.setSort(e.target.value)} className="!w-auto py-1.5 text-xs">
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="due">Due date</option><option value="priority">Priority</option><option value="title">Title A–Z</option>
          </Select>
          <Segmented label="Task view" value={view} onChange={setView} options={[['list', 'list'], ['board', 'board'], ['timeline', 'timeline']]} />
        </div>
      </header>

      <div className="relative z-40 flex flex-wrap items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2">
        <FocusViews value={focusMode} onChange={setFocusMode} />
        <span className="hidden h-5 w-px bg-line xl:block" />
        <SavedViewsBar members={members} clientNameOptions={clientNameOptions} teamId={selectedTeam.id} userId={userId} view={view} setView={setView} focusMode={focusMode} setFocusMode={setFocusMode} filters={filters} setters={setters} />
        <TaskFilterBar filters={filters} setters={setters} members={members} clientNameOptions={clientNameOptions} onClear={clearFilters} />
      </div>

      {focusMode === 'MY_DAY' && <MyDayPlan key={selectedTeam.id} teamId={selectedTeam.id} tasks={filtered} onOpen={setSelectedTask} />}
      <ActiveFilterSummary filters={filters} setters={setters} members={members} onClear={clearFilters} />
      <div className="relative z-10 flex flex-1 flex-col">
        {view === 'list' && (
          <TaskListView members={members} onUpdated={props.onUpdated} paginated={paginated} selectedTask={selectedTask} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} handleStatusChange={handleStatusChange} handleSnooze={handleSnooze} handleDelete={handleDelete} handleApproveDelete={handleApproveDelete} handleRejectDelete={handleRejectDelete} handlePickBug={handlePickBug} handleResolveBug={handleResolveBug} onBulkDelete={onBulkDelete} />
        )}
        {view === 'board' && (
          <TaskBoardView summary={props.summary} loadMore={props.loadBoardColumn} boardBusy={props.boardBusy} filtered={filtered} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} handleStatusChange={handleStatusChange} handleSnooze={handleSnooze} handleApproveDelete={handleApproveDelete} handleRejectDelete={handleRejectDelete} />
        )}
        {view === 'timeline' && (
          <TaskTimelineView filtered={filtered} setSelectedTask={setSelectedTask} setSheetTab={setSheetTab} />
        )}
        {view !== 'board' && totalPages > 1 && <Pagination page={page} setPage={setPage} totalPages={totalPages} />}
      </div>
    </Card>
  );
};

function Pagination({ page, setPage, totalPages }) {
  return (
    <footer className="mb-1 mt-4 flex justify-center gap-1.5">
      <Button size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</Button>
      {visiblePages(page, totalPages).map((value) => (
        <Button key={value} size="sm" variant={page === value ? 'primary' : 'secondary'} className="min-w-[32px] font-mono" aria-current={page === value ? 'page' : undefined} onClick={() => setPage(value)}>{value}</Button>
      ))}
      <Button size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next</Button>
    </footer>
  );
}

export default TaskWorkspace;
