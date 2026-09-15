import React, { useState } from 'react';
import CreateTaskModal from './CreateTaskModal';
import DashboardHero from './DashboardHero';
import ManagerAssignModal from './ManagerAssignModal';
import MetricCards from './MetricCards';
import PriorityBreakdown from './PriorityBreakdown';
import Reminders from './Reminders';
import TaskDetailModal from './TaskDetailModal';
import TaskWorkspace from './TaskWorkspace';
import TeamSnapshot from './TeamSnapshot';
import { useDashboardData } from './useDashboardData';
import { useDashboardLogic } from './useDashboardLogic';

const Dashboard = () => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const data = useDashboardData();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMgrModal, setShowMgrModal] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);
  const [showInsights, setShowInsights] = useState(false);
  const {
    teamList, selectedTeam, selectTeam, members, taskList, view, setView,
    page, setPage, totalPages, totalTasks, loading, loadError,
    selectedTask, setSelectedTask, openTask, sheetTab, setSheetTab,
    filterPriority, setFilterPriority, filterAssignee, setFilterAssignee,
    filterStatus, setFilterStatus, filterType, setFilterType,
    filterClientNames, setFilterClientNames, filterSearch, setFilterSearch,
    filterCreatedFrom, setFilterCreatedFrom, filterCreatedTo, setFilterCreatedTo,
    focusMode, setFocusMode,
    clientNameOptions, stats, priorityStats, memberSummary, maxLoad,
    reminders, refreshWorkspace, handleBulkDelete,
  } = data;

  const logic = useDashboardLogic(
    selectedTeam, members, orgUsers, setOrgUsers, setShowTaskModal,
    setShowMgrModal, selectedTask, setSelectedTask, refreshWorkspace
  );
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-4 text-gray-900">
      <style>{`
        @keyframes dashRise { to { opacity: 1; transform: translateY(0); } }
        @keyframes dsv2Slide { from { opacity: 0; transform: scale(0.94) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <DashboardHero user={user} today={today} teamList={teamList} selectedTeam={selectedTeam} selectTeam={selectTeam} onCreateTask={logic.openTaskComposer} onManagerAssign={logic.openManagerModal} />
      <div className="flex justify-between items-center text-sm text-slate-500"><span>Team totals · filters below only change your task results</span><button type="button" onClick={() => setShowInsights(!showInsights)} className="rounded-lg border bg-white px-3 py-2">{showInsights ? 'Hide insights' : 'Show insights'}</button></div>
      <MetricCards stats={stats} teamList={teamList} />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700" role="alert">
          {loadError} <button type="button" onClick={refreshWorkspace} className="ml-3 underline">Retry</button>
        </div>
      )}

      {!selectedTeam && (
        <section className="rounded-2xl px-5 py-8 border border-dashed border-gray-300 bg-white/75 text-center">
          <h2 className="font-display mb-2">No team selected</h2>
          <p className="text-sm text-gray-500">Open Team Management and create a team to start assigning tasks.</p>
        </section>
      )}

      {selectedTeam && (
        <section className={`dashboard-workspace-grid grid ${showInsights ? 'lg:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]' : 'grid-cols-1'} gap-3.5 items-start`}>
          <div className="flex flex-col gap-3.5 min-w-0">
            {loading && <span className="text-xs font-semibold text-blue-600">Refreshing tasks...</span>}
            <TaskWorkspace
              sort={data.sort} setSort={data.setSort} onUpdated={refreshWorkspace} view={view} setView={setView} selectedTeam={selectedTeam}
              filtered={taskList} paginated={taskList} members={members}
              filterPriority={filterPriority} setFilterPriority={setFilterPriority}
              filterAssignee={filterAssignee} setFilterAssignee={setFilterAssignee}
              filterStatus={filterStatus} setFilterStatus={setFilterStatus}
              filterType={filterType} setFilterType={setFilterType}
              filterClientNames={filterClientNames} setFilterClientNames={setFilterClientNames}
              clientNameOptions={clientNameOptions}
              filterSearch={filterSearch} setFilterSearch={setFilterSearch}
              filterCreatedFrom={filterCreatedFrom} setFilterCreatedFrom={setFilterCreatedFrom}
              filterCreatedTo={filterCreatedTo} setFilterCreatedTo={setFilterCreatedTo}
              focusMode={focusMode} setFocusMode={setFocusMode} userId={user.id}
              selectedTask={selectedTask} setSelectedTask={openTask} setSheetTab={setSheetTab}
              handleStatusChange={logic.handleStatusChange} handleDelete={logic.handleDelete}
              handleSnooze={logic.handleSnooze}
              handleApproveDelete={logic.handleApproveDelete} handleRejectDelete={logic.handleRejectDelete}
              handlePickBug={logic.handlePickBug} handleResolveBug={logic.handleResolveBug}
              onBulkDelete={handleBulkDelete} page={page} setPage={setPage}
              totalPages={totalPages} totalTasks={totalTasks} summary={data.summary} loadBoardColumn={data.loadBoardColumn} boardBusy={data.boardBusy}
            />
          </div>

          {showInsights && <aside className="dashboard-insights flex flex-col gap-3.5 sticky top-[78px] min-w-0">
            <PriorityBreakdown priorityStats={priorityStats} stats={stats} />
            <TeamSnapshot memberSummary={memberSummary} members={members} maxLoad={maxLoad} />
            <Reminders reminders={reminders} />
          </aside>}
        </section>
      )}

      {selectedTask && (
        <TaskDetailModal
          selectedTask={selectedTask} sheetTab={sheetTab} setSheetTab={setSheetTab}
          setSelectedTask={setSelectedTask} handleDelete={logic.handleDelete}
          handleApproveDelete={logic.handleApproveDelete} handleRejectDelete={logic.handleRejectDelete}
          handlePanelUpdate={logic.handlePanelUpdate} members={members}
          availableTaskOptions={logic.availableTaskOptions}
          selectedTaskCategories={logic.selectedTaskCategories}
          onSaved={refreshWorkspace}
        />
      )}

      <ManagerAssignModal
        showMgrModal={showMgrModal} setShowMgrModal={setShowMgrModal}
        mgrForm={logic.mgrForm} setMgrForm={logic.setMgrForm}
        updateMgrFormField={logic.updateMgrFormField} handleManagerAssign={logic.handleManagerAssign}
        orgUsers={orgUsers} availableTaskOptions={logic.availableTaskOptions}
        mgrTaskCategories={logic.mgrTaskCategories}
      />
      <CreateTaskModal
        showTaskModal={showTaskModal} setShowTaskModal={setShowTaskModal}
        taskForm={logic.taskForm} updateTaskFormField={logic.updateTaskFormField}
        handleReferenceImageChange={logic.handleReferenceImageChange}
        handleCreateTask={logic.handleCreateTask} selectedTeam={selectedTeam}
        members={members} availableTaskOptions={logic.availableTaskOptions}
        createTaskCategories={logic.createTaskCategories}
      />
    </div>
  );
};

export default Dashboard;
