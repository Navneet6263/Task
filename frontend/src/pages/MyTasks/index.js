import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tasks, teams } from '../../services/api';
import TaskQueue from './TaskQueue';
import ReassignModal from './ReassignModal';
import TaskDetailModal from '../Dashboard/TaskDetailModal';
import PrivateReports from '../../components/Updates/PrivateReports';

const labels = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Completed' };
export default function MyTasks() {
  const [taskList, setTaskList] = useState([]), [summary, setSummary] = useState({});
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState(null), [sheetTab, setSheetTab] = useState('details');
  const [reassignModal, setReassignModal] = useState(null), [teamMembers, setTeamMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const requestId = useRef(0);
  const fetchTasks = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const response = await tasks.getMy(page, 24, status);
      if (id !== requestId.current) return;
      setTaskList(response.data.data); setSummary(response.data.team_summary || response.data.summary);
      setPages(response.data.pagination.total_pages);
      if (page > response.data.pagination.total_pages) setPage(response.data.pagination.total_pages);
    } catch (err) { if (id === requestId.current) setError(err.response?.data?.error || 'Could not load your tasks.'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [page, status]);
  useEffect(() => { fetchTasks(); return () => { requestId.current += 1; }; }, [fetchTasks]);
  const act = async action => {
    try { await action(); await fetchTasks(); }
    catch (err) { setError(err.response?.data?.error || 'Action failed. Please retry.'); }
  };
  const open = async task => {
    try { const response = await tasks.getDetail(task.id); setSelectedTask(response.data); setSheetTab('details'); }
    catch (err) { setError(err.response?.data?.error || 'Could not open task.'); }
  };
  const handleStatusChange = (task, next) => act(() => tasks.update(task.id, { status: next, version: task.version }));
  const handleDrop = (id, next) => { const task = taskList.find(item => String(item.id) === String(id)); if (task) handleStatusChange(task, next); };
  const openReassign = async task => {
    setReassignModal(task); setSelectedMember(''); setTeamMembers([]);
    try { const response = await teams.getMembers(task.team_id); setTeamMembers(response.data); }
    catch { setError('Could not load team members.'); }
  };
  const remove = id => { if (window.confirm('Delete this task?')) act(async () => { const response = await tasks.delete(id); alert(response.data.message || 'Task deleted'); setSelectedTask(null); }); };
  return <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-3 sm:p-6">
    <header><h1 className="text-3xl font-bold">My Tasks</h1><p className="mt-1 text-sm text-slate-500">Your assignments in the active organization. Filter a status to work through the full queue.</p></header>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Total Tasks', 'total'], ['In Progress', 'in_progress'], ['Completed', 'done'], ['Overdue', 'overdue']].map(([label, key]) => <article key={key} className="rounded-2xl border bg-white p-4"><p className="text-sm text-slate-500">{label}</p><strong className="text-3xl">{summary[key] || 0}</strong></article>)}</section>
    <div className="flex flex-wrap gap-2">{[['', 'All statuses'], ...Object.entries(labels)].map(([key, label]) => <button key={key} onClick={() => { setStatus(key); setPage(1); }} className={`rounded-xl border px-4 py-2 text-sm ${status === key ? 'bg-blue-600 text-white' : 'bg-white'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="text-red-700">{error} <button onClick={fetchTasks} className="underline">Retry</button></p>}
    {loading && <p role="status">Loading tasks...</p>}
    <p className="text-xs text-slate-500">Page {page} of {pages}. Column cards below are the tasks loaded on this page; use a status filter to see its complete queue.</p>
    <section className={`grid gap-3 ${status ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'}`}>
      {Object.entries(labels).filter(([key]) => !status || key === status).map(([key, label]) => <TaskQueue key={key} title={label} icon={null} colorClass="bg-blue-50 text-blue-700" tasks={taskList.filter(task => task.status === key)} statusValue={key}
        handleStatusChange={handleStatusChange} handlePriorityLock={id => act(() => tasks.togglePriorityLock(id))} openReassign={openReassign} handleDrop={handleDrop} onCardClick={open} />)}
    </section>
    <div className="flex justify-center gap-3"><button disabled={loading || page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Previous</button><button disabled={loading || page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Next</button></div>
    <PrivateReports />
    <ReassignModal reassignModal={reassignModal} setReassignModal={setReassignModal} teamMembers={teamMembers} selectedMember={selectedMember} setSelectedMember={setSelectedMember}
      handleReassign={() => selectedMember && act(async () => { await tasks.reassign(reassignModal.id, selectedMember); setReassignModal(null); })} />
    {selectedTask && <TaskDetailModal key={selectedTask.id} selectedTask={selectedTask} setSelectedTask={setSelectedTask} sheetTab={sheetTab} setSheetTab={setSheetTab}
      handleDelete={remove} handleApproveDelete={id => { if (window.confirm('Approve deletion?')) act(async () => { await tasks.approveDelete(id); setSelectedTask(null); }); }}
      handleRejectDelete={id => act(async () => { await tasks.rejectDelete(id); await open({ id }); })}
      members={[]} availableTaskOptions={{ task_types: [], products: [], categories: [] }} selectedTaskCategories={[]} onSaved={fetchTasks} />}
  </div>;
}
