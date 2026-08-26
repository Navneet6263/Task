import React, { useEffect, useRef, useState } from 'react';
import TaskListView from './TaskListView';
import TaskBoardView from './TaskBoardView';
import TaskTimelineView from './TaskTimelineView';

const STATUS_OPTIONS = [
  { value: 'TODO', label: '📋 To Do' },
  { value: 'IN_PROGRESS', label: '⚙️ In Progress' },
  { value: 'PENDING', label: '⏳ Pending' },
  { value: 'DONE', label: '✅ Done' },
];

const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: '🔥 High' },
  { value: 'MEDIUM', label: '⚡ Medium' },
  { value: 'LOW', label: '☕ Low' },
];

const TYPE_OPTIONS = [
  { value: 'task', label: '📌 Task' },
  { value: 'bug', label: '🐛 Bug' },
  { value: 'feature', label: '✨ Feature' },
  { value: 'story', label: '📖 Story' },
  { value: 'enhancement', label: '🚀 Enhancement' },
];

const MultiSelectFilter = ({ label, values, onChange, options, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleValue = (value) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const selectedLabel = values.length === 1
    ? options.find((option) => option.value === values[0])?.label || values[0] || label
    : values.length > 1
      ? `${values.length} selected`
      : label;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`h-[34px] min-w-[132px] max-w-[190px] rounded-lg border bg-white/80 px-2.5 text-[11px] font-medium shadow-sm transition-all outline-none flex items-center justify-between gap-2 ${
          values.length > 0
            ? 'border-blue-300 text-blue-700 ring-2 ring-blue-500/10'
            : 'border-slate-200 text-slate-700 hover:border-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        <span className="truncate">{disabled ? `No ${label.replace(/^All\s+/i, '').toLowerCase()}` : selectedLabel}</span>
        <span className="flex items-center gap-1 shrink-0">
          {values.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-extrabold grid place-items-center">
              {values.length}
            </span>
          )}
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[39px] z-50 w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]" role="listbox" aria-multiselectable="true">
          <div className="max-h-[260px] overflow-y-auto p-1.5">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-slate-700 cursor-pointer hover:bg-blue-50"
                role="option"
                aria-selected={values.includes(option.value)}
              >
                <input
                  type="checkbox"
                  checked={values.includes(option.value)}
                  onChange={() => toggleValue(option.value)}
                  className="h-3.5 w-3.5 rounded accent-blue-600"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
          {values.length > 0 && (
            <button
              type="button"
              className="w-full border-t border-slate-100 px-3 py-2 text-left text-[11px] font-bold text-red-600 hover:bg-red-50"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

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
  filterClientNames,
  setFilterClientNames,
  clientNameOptions,
  filterSearch,
  setFilterSearch,
  filterCreatedFrom,
  setFilterCreatedFrom,
  filterCreatedTo,
  setFilterCreatedTo,
  selectedTask,
  setSelectedTask,
  setSheetTab,
  handleStatusChange,
  handleDelete,
  handleApproveDelete,
  handleRejectDelete,
  handlePickBug,
  handleResolveBug,
  onBulkDelete,
  page,
  setPage,
  totalPages,
}) => {
  const activeFilterCount = [
    filterPriority.length > 0,
    filterAssignee.length > 0,
    filterStatus.length > 0,
    filterType.length > 0,
    filterClientNames.length > 0,
    filterSearch,
    filterCreatedFrom,
    filterCreatedTo,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
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
      <div className="relative z-30 flex flex-wrap gap-2 items-center">
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

        <MultiSelectFilter
          label="All Statuses"
          values={filterStatus}
          onChange={setFilterStatus}
          options={STATUS_OPTIONS}
        />

        <MultiSelectFilter
          label="All Priorities"
          values={filterPriority}
          onChange={setFilterPriority}
          options={PRIORITY_OPTIONS}
        />

        <MultiSelectFilter
          label="All Types"
          values={filterType}
          onChange={setFilterType}
          options={TYPE_OPTIONS}
        />

        <MultiSelectFilter
          label="All Members"
          values={filterAssignee}
          onChange={setFilterAssignee}
          options={members.map((member) => ({ value: String(member.id), label: member.name }))}
          disabled={members.length === 0}
        />

        <MultiSelectFilter
          label="All Clients"
          values={filterClientNames}
          onChange={setFilterClientNames}
          options={clientNameOptions.map((clientName) => ({ value: clientName, label: clientName }))}
          disabled={clientNameOptions.length === 0}
        />

        <div className="flex items-center gap-1.5 h-[34px] rounded-lg border border-slate-200 bg-white/80 px-2.5 shadow-sm">
          <label htmlFor="created-from" className="text-[10px] font-bold text-slate-500 whitespace-nowrap">Created from</label>
          <input
            id="created-from"
            type="date"
            value={filterCreatedFrom}
            max={filterCreatedTo || undefined}
            onChange={(e) => {
              const value = e.target.value;
              setFilterCreatedFrom(value);
              if (value && filterCreatedTo && value > filterCreatedTo) setFilterCreatedTo(value);
            }}
            className="bg-transparent text-slate-700 text-[11px] font-medium outline-none w-[112px]"
          />
        </div>

        <div className="flex items-center gap-1.5 h-[34px] rounded-lg border border-slate-200 bg-white/80 px-2.5 shadow-sm">
          <label htmlFor="created-to" className="text-[10px] font-bold text-slate-500 whitespace-nowrap">Created to</label>
          <input
            id="created-to"
            type="date"
            value={filterCreatedTo}
            min={filterCreatedFrom || undefined}
            onChange={(e) => {
              const value = e.target.value;
              setFilterCreatedTo(value);
              if (value && filterCreatedFrom && value < filterCreatedFrom) setFilterCreatedFrom(value);
            }}
            className="bg-transparent text-slate-700 text-[11px] font-medium outline-none w-[112px]"
          />
        </div>

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
            onBulkDelete={onBulkDelete}
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
