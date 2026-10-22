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
import './dashboardLayout.css';
import { Banner, Button, EmptyState } from '../../ui';
import { readPreference, writePreference } from '../../services/preferences';
import StatusOverview from './StatusOverview';
import UpNext from './UpNext';
import useAgenda from './useAgenda';
import { useDashboardData } from './useDashboardData';
import { useDashboardLogic } from './useDashboardLogic';

const Dashboard = () => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const data = useDashboardData();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMgrModal, setShowMgrModal] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);
  const [showInsights, setShowInsights] = useState(() => readPreference('dashboard-insights', true));
  const agenda = useAgenda();
  const toggleInsights = () => setShowInsights((current) => { writePreference('dashboard-insights', !current); return !current; });
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
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <DashboardHero
        user={user} today={today} agenda={agenda} overdue={stats.overdue}
        teamList={teamList} selectedTeam={selectedTeam} selectTeam={selectTeam}
        onCreateTask={logic.openTaskComposer} onManagerAssign={logic.openManagerModal}
        onFocus={setFocusMode} showInsights={showInsights} onToggleInsights={toggleInsights}
      />
      <MetricCards stats={stats} teamList={teamList} />
      <StatusOverview stats={stats} />

      {loadError && <Banner tone="danger" action={<Button size="sm" onClick={refreshWorkspace}>Retry</Button>}><span role="alert">{loadError}</span></Banner>}

      {!selectedTeam && (
        <EmptyState title="No team selected">Open Team Management and create a team to start assigning tasks.</EmptyState>
      )}

      {selectedTeam && (
        <section className={`dashboard-workspace-grid grid ${showInsights ? 'lg:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]' : 'grid-cols-1'} gap-3.5 items-start`}>
          <div className="flex flex-col gap-3.5 min-w-0">
            {loading && <span role="status" className="text-xs font-semibold text-accent">Refreshing tasks...</span>}
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

          {showInsights && <aside className="dashboard-insights sticky top-[calc(var(--shell-header-height,57px)+16px)] flex min-w-0 flex-col gap-3.5">
            <UpNext agenda={agenda} />
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
