import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tasks, teams } from '../../services/api';
import { filterTasksLocally, paginateTasks, summarizeTasks } from './taskDataUtils';
import { readPreference, writePreference } from '../../services/preferences';
import { useLocation } from 'react-router-dom';

const EMPTY_SUMMARY = {
  total: 0, done: 0, in_progress: 0, pending: 0, todo: 0,
  overdue: 0, high: 0, medium: 0, low: 0,
};

export const useDashboardData = () => {
  const location = useLocation();
  const currentUser = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [teamList, setTeamList] = useState([]);
  const [teamRetry, setTeamRetry] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [taskList, setTaskList] = useState([]);
  const [clientNameOptions, setClientNameOptions] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [teamSummary, setTeamSummary] = useState(EMPTY_SUMMARY);
  const [boardPages, setBoardPages] = useState({});
  const [boardBusy, setBoardBusy] = useState('');
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });
  const [view, setView] = useState(() => readPreference('view', 'list'));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [sheetTab, setSheetTab] = useState('details');
  const [filterPriority, setFilterPriority] = useState([]);
  const [filterAssignee, setFilterAssignee] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterType, setFilterType] = useState([]);
  const [filterClientNames, setFilterClientNames] = useState([]);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
  const [filterCreatedTo, setFilterCreatedTo] = useState('');
  const [focusMode, setFocusMode] = useState('');
  const [sort, setSort] = useState(() => readPreference('task-sort', 'newest'));
  const requestIdRef = useRef(0);
  const controllerRef = useRef(null);
  const scopeRef = useRef('');
  const debouncedSearch = filterSearch;

  const selectTeam = useCallback((team) => {
    setSelectedTeam(team);
    setTaskList([]); setSummary(EMPTY_SUMMARY); setTeamSummary(EMPTY_SUMMARY); setMembers([]);
    writePreference('team', team.id);
    setPage(1);
  }, []);

  useEffect(() => {
    teams.getAll().then((response) => {
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list.length > 0) selectTeam(list.find(team => team.id === readPreference('team', null)) || list[0]);
    }).catch(() => setLoadError('Unable to load teams.'));
    tasks.getClients().then((response) => {
      setClientNameOptions(Array.isArray(response.data) ? response.data : []);
    }).catch(() => {});
  }, [selectTeam, teamRetry]);
  useEffect(() => {
    setClientNameOptions(prev => [...new Set([...prev, ...taskList.map(task => task.client_name).filter(Boolean)])].sort());
  }, [taskList]);

  const loadMembers = useCallback(async () => {
    if (!selectedTeam?.id) return;
    const response = await teams.getMembers(selectedTeam.id);
    setMembers(Array.isArray(response.data) ? response.data : []);
  }, [selectedTeam?.id]);

  useEffect(() => {
    loadMembers().catch(() => setMembers([]));
  }, [loadMembers]);

  const queryFilters = useMemo(() => ({
    statuses: filterStatus,
    priorities: filterPriority,
    issueTypes: filterType,
    assignees: filterAssignee,
    clientNames: filterClientNames,
    search: debouncedSearch,
    createdFrom: filterCreatedFrom,
    createdTo: filterCreatedTo,
    focus: focusMode,
    sort,
    currentUserId: currentUser.id,
  }), [currentUser.id, debouncedSearch, filterAssignee, filterClientNames, filterCreatedFrom, filterCreatedTo, filterPriority, filterStatus, filterType, focusMode, sort]);

  const loadTasks = useCallback(async () => {
    if (!selectedTeam?.id) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError('');
    try {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const scope = JSON.stringify([selectedTeam.id, queryFilters, view]);
      const scopeChanged = scopeRef.current !== scope;
      scopeRef.current = scope;
      if (scopeChanged && page !== 1) { setPage(1); return; }
      const limit = view === 'timeline' ? 48 : 12;
      const response = await tasks.getByTeam(selectedTeam.id, page, limit, { ...queryFilters, board: view === 'board' }, controller.signal);
      if (requestId !== requestIdRef.current) return;
      const serverSummary = response.data?.summary;
      if (serverSummary && Number.isFinite(Number(serverSummary.total))) {
        setTaskList(Array.isArray(response.data?.data) ? response.data.data : []);
        setSummary({ ...EMPTY_SUMMARY, ...serverSummary });
        setTeamSummary({ ...EMPTY_SUMMARY, ...(response.data.team_summary || serverSummary) });
        setBoardPages({});
        setPagination(response.data?.pagination || { total: Number(serverSummary.total), total_pages: 1 });
      } else {
        const legacyResponse = await tasks.getByTeam(selectedTeam.id, 1, 5000, {
          createdFrom: queryFilters.createdFrom,
          createdTo: queryFilters.createdTo,
        });
        if (requestId !== requestIdRef.current) return;
        const legacyTasks = Array.isArray(legacyResponse.data?.data) ? legacyResponse.data.data : [];
        const filteredTasks = filterTasksLocally(legacyTasks, queryFilters);
        const legacyPage = paginateTasks(filteredTasks, page, limit);
        setTaskList(legacyPage.data);
        setSummary(summarizeTasks(filteredTasks));
        setTeamSummary(summarizeTasks(legacyTasks));
        setPagination(legacyPage.pagination);
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      if (error.code === 'ERR_CANCELED') return;
      setLoadError(error.response?.data?.error || 'Unable to load tasks.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, queryFilters, selectedTeam?.id, view]);

  useEffect(() => { loadTasks(); return () => { controllerRef.current?.abort(); requestIdRef.current += 1; }; }, [loadTasks]);
  useEffect(() => { writePreference('view', view); }, [view]);
  useEffect(() => { writePreference('task-sort', sort); }, [sort]);
  useEffect(() => {
    if (page > pagination.total_pages) setPage(Math.max(1, pagination.total_pages));
  }, [page, pagination.total_pages]);

  const refreshWorkspace = useCallback(async () => {
    if (!selectedTeam?.id) { setTeamRetry(value => value + 1); return; }
    await loadTasks();
  }, [loadTasks, selectedTeam?.id]);

  const loadBoardColumn = async status => {
    if (boardBusy) return;
    setBoardBusy(status);
    const requestId = requestIdRef.current;
    try {
      const next = (boardPages[status] || 1) + 1;
      const response = await tasks.getByTeam(selectedTeam.id, next, 12, { ...queryFilters, statuses: [status] });
      if (requestId !== requestIdRef.current) return;
      setTaskList(prev => [...prev, ...response.data.data.filter(task => !prev.some(item => item.id === task.id))]);
      setBoardPages(prev => ({ ...prev, [status]: next }));
    } catch { setLoadError('Could not load more tasks. Please retry.'); }
    finally { setBoardBusy(''); }
  };

  const openTask = useCallback(async (task) => {
    if (!task?.id) return;
    try {
      const response = await tasks.getDetail(task.id);
      setSelectedTask(response.data);
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Unable to open task.');
    }
  }, []);

  useEffect(() => {
    const taskId = new URLSearchParams(location.search).get('task');
    if (taskId) { openTask({ id: taskId }); setSheetTab('details'); }
  }, [location.search, openTask]);

  const handleBulkDelete = useCallback(async (ids) => {
    await tasks.bulkDelete(ids);
    if (selectedTask && ids.includes(selectedTask.id)) setSelectedTask(null);
    await refreshWorkspace();
  }, [refreshWorkspace, selectedTask]);

  const stats = useMemo(() => {
    const total = Number(teamSummary.total || 0);
    const done = Number(teamSummary.done || 0);
    const todo = Number(teamSummary.todo || 0);
    const inProgress = Number(teamSummary.in_progress || 0);
    const pending = Number(teamSummary.pending || 0);
    return {
      total, done, todo, inProgress, pending,
      overdue: Number(teamSummary.overdue || 0),
      completion: total ? Math.round((done / total) * 100) : 0,
      open: todo + inProgress + pending,
    };
  }, [teamSummary]);
  const priorityStats = useMemo(() => ({
    HIGH: Number(summary.high || 0),
    MEDIUM: Number(summary.medium || 0),
    LOW: Number(summary.low || 0),
  }), [summary]);
  const memberSummary = useMemo(() => members
    .map((member) => ({ ...member, load: Number(member.current_tasks || 0) }))
    .sort((a, b) => b.load - a.load).slice(0, 6), [members]);
  const reminders = useMemo(() => {
    const list = [];
    if (stats.overdue) list.push({ tone: 'danger', title: `${stats.overdue} overdue tasks`, note: 'Check blockers and adjust deadlines.' });
    if (stats.pending) list.push({ tone: 'warning', title: `${stats.pending} pending tasks`, note: 'Dependencies may be waiting.' });
    if (!stats.open && stats.total) list.push({ tone: 'success', title: 'Sprint is clean', note: 'No open tasks currently.' });
    if (!list.length) list.push({ tone: 'info', title: 'Add more tasks', note: 'Use create task to plan next work.' });
    return list.slice(0, 4);
  }, [stats]);

  return {
    teamList, selectedTeam, selectTeam, members, taskList, view, setView,
    page, setPage, totalPages: Number(pagination.total_pages || 1),
    totalTasks: Number(pagination.total || 0), loading, loadError,
    selectedTask, setSelectedTask, openTask, sheetTab, setSheetTab,
    filterPriority, setFilterPriority, filterAssignee, setFilterAssignee,
    filterStatus, setFilterStatus, filterType, setFilterType,
    filterClientNames, setFilterClientNames, filterSearch, setFilterSearch,
    filterCreatedFrom, setFilterCreatedFrom, filterCreatedTo, setFilterCreatedTo,
    focusMode, setFocusMode,
    clientNameOptions, stats, priorityStats, memberSummary,
    maxLoad: Math.max(1, ...memberSummary.map((member) => member.load)),
    reminders, refreshWorkspace, handleBulkDelete,
    summary, loadBoardColumn, boardBusy,
    sort, setSort,
  };
};
