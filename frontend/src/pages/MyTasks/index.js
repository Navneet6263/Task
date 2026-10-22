import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tasks, teams } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import { Button, CountBadge, ErrorText, PageHeader, Tabs } from '../../ui';
import { updatesApi } from '../../components/Updates/updatesApi';
import TaskDetailModal from '../Dashboard/TaskDetailModal';
import PrivateReports from '../../components/Updates/PrivateReports';
import MyStats from './MyStats';
import MyTasksToolbar from './MyTasksToolbar';
import TaskQueue from './TaskQueue';
import ListView from './ListView';
import AgendaView from './AgendaView';
import ReassignModal from './ReassignModal';
import { STATUSES } from './taskMeta';
import { exportMyTasks } from './exportMyTasks';

const PAGE_SIZE = { agenda: 100, board: 100, list: 25 };

export default function MyTasks() {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [view, setViewState] = useState(() => readPreference('my-tasks-view', 'agenda'));
  const [status, setStatus] = useState('');
  const [focus, setFocus] = useState('');
  const [priorities, setPriorities] = useState([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState(() => readPreference('my-tasks-sort', 'due'));
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], summary: {}, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [sheetTab, setSheetTab] = useState('details');
  const [reassignModal, setReassignModal] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const requestId = useRef(0);
  const [section, setSection] = useState('tasks');
  const [reportCount, setReportCount] = useState(0);
  useEffect(() => { updatesApi.summary().then(({ data }) => setReportCount(Number(data.reports || 0))).catch(() => {}); }, [section]);

  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [status, focus, priorities, debounced, sort, view]);
  const extra = { priorities, search: debounced, sort, focus };

  const fetchTasks = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const response = await tasks.getMy(page, PAGE_SIZE[view], status, { priorities, search: debounced, sort, focus });
      if (id !== requestId.current) return;
      const { data, pagination } = response.data;
      setResult({ data, summary: response.data.team_summary || response.data.summary || {}, pages: pagination.total_pages, total: pagination.total });
    } catch (err) { if (id === requestId.current) setError(err.response?.data?.error || 'Could not load your tasks.'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [page, view, status, priorities, debounced, sort, focus]);
  useEffect(() => { fetchTasks(); return () => { requestId.current += 1; }; }, [fetchTasks]);

  const act = async (action, success) => {
    try { await action(); if (success) notify(success, 'success'); await fetchTasks(); }
    catch (err) { notify(err.response?.data?.error || 'Action failed. Please retry.'); }
  };
  const open = async (task) => {
    try { const response = await tasks.getDetail(task.id); setSelectedTask(response.data); setSheetTab('details'); }
    catch (err) { notify(err.response?.data?.error || 'Could not open task.'); }
  };
  const handleStatusChange = (task, next) => act(() => tasks.update(task.id, { status: next, version: task.version }), next === 'DONE' ? 'Task completed.' : null);
  const handleDrop = (id, next) => { const task = result.data.find((item) => String(item.id) === String(id)); if (task && task.status !== next) handleStatusChange(task, next); };
  const handlePriorityLock = (id) => act(() => tasks.togglePriorityLock(id));
  const openReassign = async (task) => {
    setReassignModal(task); setSelectedMember(''); setTeamMembers([]);
    try { setTeamMembers((await teams.getMembers(task.team_id)).data); } catch { notify('Could not load team members.'); }
  };
  const remove = (id) => { if (window.confirm('Delete this task?')) act(async () => { await tasks.delete(id); setSelectedTask(null); }, 'Delete request sent.'); };
  const setView = (next) => { setViewState(next); writePreference('my-tasks-view', next); };
  const chooseSort = (next) => { setSort(next); writePreference('my-tasks-sort', next); };
  const download = async () => {
    setExporting(true);
    try { const count = await exportMyTasks({ status, extra, userName: user.name }); notify(`Exported ${count} tasks to Excel.`, 'success'); }
    catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };

  const cardProps = { handleStatusChange, handlePriorityLock, openReassign, onCardClick: open };
  const open_ = Number(result.summary.todo || 0) + Number(result.summary.in_progress || 0) + Number(result.summary.pending || 0);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader title="My Tasks" subtitle={`${open_} open · ${Number(result.summary.overdue || 0)} overdue · across all your teams`}
        actions={<Button onClick={download} disabled={exporting || !result.total}>{exporting ? 'Preparing…' : 'Export Excel'}</Button>} />
      <Tabs value={section} onChange={setSection} label="My work" tabs={[['tasks', 'Tasks'], ['reports', 'Private reports', <CountBadge key="r" count={reportCount} tone="accent" />]]} />
      {section === 'reports' ? (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-muted">Problems people reported from product updates and assigned to you. Only you can see them, and they are not counted in team totals.</p>
          <PrivateReports />
        </section>
      ) : <>
      <MyStats summary={result.summary} status={status} focus={focus} onPick={(pick) => { setStatus(pick.status); setFocus(pick.focus); }} />
      <MyTasksToolbar view={view} setView={setView} status={status} setStatus={setStatus} focus={focus} setFocus={setFocus}
        priorities={priorities} setPriorities={setPriorities} search={search} setSearch={setSearch} sort={sort} setSort={chooseSort} />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{loading ? 'Loading…' : `${result.total} ${result.total === 1 ? 'task' : 'tasks'}`}{result.pages > 1 && ` · page ${page} of ${result.pages}`}</span>
        {view === 'board' && <span>Drag a card to another column to change its status.</span>}
      </div>
      <ErrorText onRetry={fetchTasks}>{error}</ErrorText>

      {view === 'agenda' && <AgendaView tasks={result.data} onOpen={open} handleStatusChange={handleStatusChange} handlePriorityLock={handlePriorityLock} openReassign={openReassign} />}
      {view === 'list' && <ListView tasks={result.data} onOpen={open} handleStatusChange={handleStatusChange} handlePriorityLock={handlePriorityLock} openReassign={openReassign} />}
      {view === 'board' && (
        <section className={`grid gap-3 ${status ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'}`}>
          {STATUSES.filter(([key]) => !status || key === status).map(([key, label]) => (
            <TaskQueue key={key} title={label} statusValue={key} tasks={result.data.filter((task) => task.status === key)} handleDrop={handleDrop} {...cardProps} />
          ))}
        </section>
      )}
      {result.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="font-mono text-xs text-muted">{page} / {result.pages}</span>
          <Button size="sm" disabled={loading || page >= result.pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      </>}
      <ReassignModal reassignModal={reassignModal} setReassignModal={setReassignModal} teamMembers={teamMembers} selectedMember={selectedMember} setSelectedMember={setSelectedMember}
        handleReassign={() => selectedMember && act(async () => { await tasks.reassign(reassignModal.id, selectedMember); setReassignModal(null); }, 'Task reassigned.')} />
      {selectedTask && <TaskDetailModal key={selectedTask.id} selectedTask={selectedTask} setSelectedTask={setSelectedTask} sheetTab={sheetTab} setSheetTab={setSheetTab}
        handleDelete={remove} handleApproveDelete={(id) => { if (window.confirm('Approve deletion?')) act(async () => { await tasks.approveDelete(id); setSelectedTask(null); }); }}
        handleRejectDelete={(id) => act(async () => { await tasks.rejectDelete(id); await open({ id }); })}
        members={[]} availableTaskOptions={{ task_types: [], products: [], categories: [] }} selectedTaskCategories={[]} onSaved={fetchTasks} />}
    </div>
  );
}
