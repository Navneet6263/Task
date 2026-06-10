import React, { useEffect, useMemo, useState } from 'react';
import { tasks, teams } from '../../services/api';
import TaskQueue from './TaskQueue';
import ReassignModal from './ReassignModal';
import TaskDetailModal from '../Dashboard/TaskDetailModal';

const MyTasks = () => {
  const [taskList, setTaskList] = useState([]);
  const [reassignModal, setReassignModal] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [sheetTab, setSheetTab] = useState('details');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await tasks.getMy();
      const list = response.data?.data || response.data;
      setTaskList(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleStatusChange = async (task, status) => {
    try {
      await tasks.update(task.id, { ...task, status });
      await fetchTasks();
    } catch (error) {
      console.error(error);
    }
  };

  const handlePriorityLock = async (taskId) => {
    try {
      await tasks.togglePriorityLock(taskId);
      await fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed');
    }
  };

  const openReassign = async (task) => {
    setReassignModal(task);
    setSelectedMember('');
    try {
      const response = await teams.getMembers(task.team_id);
      const currentUser = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
      const members = Array.isArray(response.data) ? response.data : [];
      setTeamMembers(members.filter((member) => member.email !== currentUser.email));
    } catch (error) {
      console.error(error);
    }
  };

  const handleReassign = async () => {
    if (!selectedMember) return;
    try {
      await tasks.reassign(reassignModal.id, selectedMember);
      setReassignModal(null);
      await fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed');
    }
  };

  const handlePanelUpdate = async (field, value) => {
    if (!selectedTask) return;
    try {
      await tasks.update(selectedTask.id, { ...selectedTask, [field]: value });
      setSelectedTask((prev) => ({ ...prev, [field]: value }));
      await fetchTasks();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDrop = async (taskId, newStatus) => {
    const task = taskList.find(t => String(t.id) === String(taskId));
    if (task && task.status !== newStatus) {
      await handleStatusChange(task, newStatus);
    }
  };

  const queues = useMemo(() => ({
    TODO: taskList.filter((t) => t.status === 'TODO'),
    IN_PROGRESS: taskList.filter((t) => t.status === 'IN_PROGRESS'),
    PENDING: taskList.filter((t) => t.status === 'PENDING'),
    DONE: taskList.filter((t) => t.status === 'DONE'),
  }), [taskList]);

  const summary = useMemo(() => ({
    total: taskList.length,
    inProgress: queues.IN_PROGRESS.length,
    done: queues.DONE.length,
    locked: taskList.filter((t) => t.priority_locked).length,
  }), [taskList, queues]);

  return (
    <div className="min-h-full flex flex-col p-6 max-w-[1600px] mx-auto gap-6 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 tracking-tight">My Tasks</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Manage your queue, update progress, and hit your goals.</p>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', val: summary.total, color: 'text-blue-600' },
          { label: 'In Progress', val: summary.inProgress, color: 'text-amber-600' },
          { label: 'Completed', val: summary.done, color: 'text-emerald-600' },
          { label: 'Priority Locked', val: summary.locked, color: 'text-rose-600' },
        ].map((stat) => (
          <article key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex flex-col justify-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
            <h3 className={`font-display text-3xl font-black ${stat.color}`}>{stat.val}</h3>
          </article>
        ))}
      </section>

      <section className="flex-1 bg-white rounded-[32px] border border-slate-200/60 shadow-sm p-6 overflow-x-auto">
        <div className="grid grid-cols-4 gap-4 min-w-[1200px] h-full">
          <TaskQueue 
            title="Up Next" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>} colorClass="bg-blue-100 text-blue-600 border border-blue-200"
            tasks={queues.TODO} statusValue="TODO" handleStatusChange={handleStatusChange} handlePriorityLock={handlePriorityLock} openReassign={openReassign} handleDrop={handleDrop} onCardClick={setSelectedTask}
          />
          <TaskQueue 
            title="In Progress" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>} colorClass="bg-amber-100 text-amber-600 border border-amber-200"
            tasks={queues.IN_PROGRESS} statusValue="IN_PROGRESS" handleStatusChange={handleStatusChange} handlePriorityLock={handlePriorityLock} openReassign={openReassign} handleDrop={handleDrop} onCardClick={setSelectedTask}
          />
          <TaskQueue 
            title="Pending Blocked" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} colorClass="bg-rose-100 text-rose-600 border border-rose-200"
            tasks={queues.PENDING} statusValue="PENDING" handleStatusChange={handleStatusChange} handlePriorityLock={handlePriorityLock} openReassign={openReassign} handleDrop={handleDrop} onCardClick={setSelectedTask}
          />
          <TaskQueue 
            title="Completed" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} colorClass="bg-emerald-100 text-emerald-600 border border-emerald-200"
            tasks={queues.DONE} statusValue="DONE" handleStatusChange={handleStatusChange} handlePriorityLock={handlePriorityLock} openReassign={openReassign} handleDrop={handleDrop} onCardClick={setSelectedTask}
          />
        </div>
      </section>

      <ReassignModal 
        reassignModal={reassignModal} setReassignModal={setReassignModal}
        teamMembers={teamMembers} selectedMember={selectedMember} setSelectedMember={setSelectedMember}
        handleReassign={handleReassign}
      />

      {selectedTask && (
        <TaskDetailModal
          selectedTask={selectedTask}
          sheetTab={sheetTab}
          setSheetTab={setSheetTab}
          setSelectedTask={setSelectedTask}
          handleDelete={async () => { /* dummy */ }}
          handleApproveDelete={async () => { /* dummy */ }}
          handleRejectDelete={async () => { /* dummy */ }}
          handlePanelUpdate={handlePanelUpdate}
          members={teamMembers}
          availableTaskOptions={{ task_types: [], products: [], categories: [] }}
          selectedTaskCategories={[]}
        />
      )}
    </div>
  );
};

export default MyTasks;
