import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { teams, tasks } from '../../services/api';
import DashboardHero from './DashboardHero';
import MetricCards from './MetricCards';
import TaskWorkspace from './TaskWorkspace';
import PriorityBreakdown from './PriorityBreakdown';
import TeamSnapshot from './TeamSnapshot';
import Reminders from './Reminders';
import TaskDetailModal from './TaskDetailModal';
import CreateTaskModal from './CreateTaskModal';
import ManagerAssignModal from './ManagerAssignModal';
import { useDashboardLogic } from './useDashboardLogic';

const PAGE_SIZE = 12;

const Dashboard = () => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [taskList, setTaskList] = useState([]);
  const [view, setView] = useState('list');
  const [page, setPage] = useState(1);
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [sheetTab, setSheetTab] = useState('details');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMgrModal, setShowMgrModal] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);

  const {
    taskForm,
    mgrForm,
    setMgrForm,
    updateTaskFormField,
    updateMgrFormField,
    handleReferenceImageChange,
    handleCreateTask,
    handleManagerAssign,
    handleStatusChange,
    handleDelete,
    handleApproveDelete,
    handleRejectDelete,
    handlePickBug,
    handleResolveBug,
    handlePanelUpdate,
    openManagerModal,
    openTaskComposer,
    availableTaskOptions,
    createTaskCategories,
    mgrTaskCategories,
    selectedTaskCategories,
  } = useDashboardLogic(selectedTeam, members, orgUsers, setOrgUsers, setShowTaskModal, setShowMgrModal, selectedTask, setSelectedTask, () => selectTeam(selectedTeam))

  const selectTeam = useCallback(async (team) => {
    setSelectedTeam(team);
    setSelectedTask(null);
    try {
      const [taskRes, memberRes] = await Promise.all([tasks.getByTeam(team.id, 1, 1000), teams.getMembers(team.id)]);

      setTaskList(Array.isArray(taskRes.data?.data) ? taskRes.data.data : []);
      setMembers(Array.isArray(memberRes.data) ? memberRes.data : []);
    } catch (error) {}
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const response = await teams.getAll();
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list.length > 0) await selectTeam(list[0]);
    } catch (error) {}
  }, [selectTeam]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);
  useEffect(() => { setPage(1); }, [selectedTeam?.id, filterPriority, filterAssignee, filterStatus, filterType, filterSearch, view]);

  const filtered = useMemo(() => taskList.filter((task) => {
    const matchPriority = !filterPriority || task.priority === filterPriority;
    const matchAssignee = !filterAssignee || task.assigned_to === Number(filterAssignee);
    const matchStatus = !filterStatus || task.status === filterStatus;
    const matchType = !filterType || task.issue_type === filterType;
    const matchSearch = !filterSearch || (task.title || '').toLowerCase().includes(filterSearch.toLowerCase());
    return matchPriority && matchAssignee && matchStatus && matchType && matchSearch;
  }), [taskList, filterPriority, filterAssignee, filterStatus, filterType, filterSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const stats = useMemo(() => {
    const total = taskList.length;
    const done = taskList.filter((task) => task.status === 'DONE').length;
    const inProgress = taskList.filter((task) => task.status === 'IN_PROGRESS').length;
    const pending = taskList.filter((task) => task.status === 'PENDING').length;
    const todo = taskList.filter((task) => task.status === 'TODO').length;
    const overdue = taskList.filter((task) => task.due_date && task.status !== 'DONE' && new Date(task.due_date) < new Date()).length;
    const completion = total ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, pending, todo, overdue, completion, open: todo + inProgress + pending };
  }, [taskList]);

  const priorityStats = useMemo(() => ({
    HIGH: taskList.filter((task) => task.priority === 'HIGH').length,
    MEDIUM: taskList.filter((task) => task.priority === 'MEDIUM').length,
    LOW: taskList.filter((task) => task.priority === 'LOW').length,
  }), [taskList]);

  const memberSummary = useMemo(() => {
    const mapped = members.map((member) => {
      const derived = taskList.filter((task) => task.assigned_to === member.id && task.status !== 'DONE').length;
      return { ...member, load: typeof member.current_tasks === 'number' ? member.current_tasks : derived };
    });
    return mapped.sort((a, b) => b.load - a.load).slice(0, 6);
  }, [members, taskList]);

  const maxLoad = Math.max(1, ...memberSummary.map((member) => member.load));
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const reminders = useMemo(() => {
    const list = [];
    if (stats.overdue > 0) list.push({ tone: 'danger', title: `${stats.overdue} overdue tasks`, note: 'Check blockers and adjust deadlines.' });
    if (stats.pending > 0) list.push({ tone: 'warning', title: `${stats.pending} pending tasks`, note: 'Dependencies may be waiting.' });
    if (stats.open === 0 && stats.total > 0) list.push({ tone: 'success', title: 'Sprint is clean', note: 'No open tasks currently.' });
    if (list.length === 0) list.push({ tone: 'info', title: 'Add more tasks', note: 'Use create task to plan next work.' });
    return list.slice(0, 4);
  }, [stats]);

  return (
    <div className="flex flex-col gap-4 text-gray-900">
      <style>{`
        @keyframes dashRise { to { opacity: 1; transform: translateY(0); } }
        @keyframes dsv2Slide { from { opacity: 0; transform: scale(0.94) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <DashboardHero user={user} today={today} teamList={teamList} selectedTeam={selectedTeam} selectTeam={selectTeam} onCreateTask={openTaskComposer} onManagerAssign={openManagerModal} />
      <MetricCards stats={stats} teamList={teamList} />

      {!selectedTeam && (
        <section className="rounded-2xl px-5 py-8 border border-dashed border-gray-300 bg-white/75 text-center">
          <h2 className="font-display mb-2">No team selected</h2>
          <p className="text-sm text-gray-500">Open Team Management and create a team to start assigning tasks.</p>
        </section>
      )}

      {selectedTeam && (
        <section className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3.5 items-start">
          <div className="flex flex-col gap-3.5 min-w-0">
            <TaskWorkspace
              view={view}
              setView={setView}
              selectedTeam={selectedTeam}
              filtered={filtered}
              paginated={paginated}
              members={members}
              filterPriority={filterPriority}
              setFilterPriority={setFilterPriority}
              filterAssignee={filterAssignee}
              setFilterAssignee={setFilterAssignee}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterType={filterType}
              setFilterType={setFilterType}
              filterSearch={filterSearch}
              setFilterSearch={setFilterSearch}
              selectedTask={selectedTask}
              setSelectedTask={setSelectedTask}
              setSheetTab={setSheetTab}
              handleStatusChange={handleStatusChange}
              handleDelete={handleDelete}
              handleApproveDelete={handleApproveDelete}
              handleRejectDelete={handleRejectDelete}
              handlePickBug={handlePickBug}
              handleResolveBug={handleResolveBug}
              page={page}
              setPage={setPage}
              totalPages={totalPages}
            />
          </div>

          <aside className="flex flex-col gap-3.5 sticky top-[78px] min-w-0">
            <PriorityBreakdown priorityStats={priorityStats} stats={stats} />
            <TeamSnapshot memberSummary={memberSummary} members={members} maxLoad={maxLoad} />
            <Reminders reminders={reminders} />
          </aside>
        </section>
      )}

      {selectedTask && (
        <TaskDetailModal
          selectedTask={selectedTask}
          sheetTab={sheetTab}
          setSheetTab={setSheetTab}
          setSelectedTask={setSelectedTask}
          handleDelete={handleDelete}
          handleApproveDelete={handleApproveDelete}
          handleRejectDelete={handleRejectDelete}
          handlePanelUpdate={handlePanelUpdate}
          members={members}
          availableTaskOptions={availableTaskOptions}
          selectedTaskCategories={selectedTaskCategories}
        />
      )}

      <ManagerAssignModal
        showMgrModal={showMgrModal}
        setShowMgrModal={setShowMgrModal}
        mgrForm={mgrForm}
        setMgrForm={setMgrForm}
        updateMgrFormField={updateMgrFormField}
        handleManagerAssign={handleManagerAssign}
        orgUsers={orgUsers}
        availableTaskOptions={availableTaskOptions}
        mgrTaskCategories={mgrTaskCategories}
      />

      <CreateTaskModal
        showTaskModal={showTaskModal}
        setShowTaskModal={setShowTaskModal}
        taskForm={taskForm}
        updateTaskFormField={updateTaskFormField}
        handleReferenceImageChange={handleReferenceImageChange}
        handleCreateTask={handleCreateTask}
        selectedTeam={selectedTeam}
        members={members}
        availableTaskOptions={availableTaskOptions}
        createTaskCategories={createTaskCategories}
      />
    </div>
  );
};

export default Dashboard;
