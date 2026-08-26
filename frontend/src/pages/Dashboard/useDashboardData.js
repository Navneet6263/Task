import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tasks, teams } from '../../services/api';
import { filterTasksLocally, paginateTasks, summarizeTasks } from './taskDataUtils';

const EMPTY_SUMMARY = {
  total: 0, done: 0, in_progress: 0, pending: 0, todo: 0,
  overdue: 0, high: 0, medium: 0, low: 0,
};

const useDebouncedValue = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
};

export const useDashboardData = () => {
  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [taskList, setTaskList] = useState([]);
  const [clientNameOptions, setClientNameOptions] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });
  const [view, setView] = useState('list');
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
  const requestIdRef = useRef(0);
  const debouncedSearch = useDebouncedValue(filterSearch);

  const selectTeam = useCallback((team) => {
    setSelectedTeam(team);
    setSelectedTask(null);
    setPage(1);
  }, []);

  useEffect(() => {
    teams.getAll().then((response) => {
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list.length > 0) selectTeam(list[0]);
    }).catch(() => setLoadError('Unable to load teams.'));
    tasks.getClients().then((response) => {
      setClientNameOptions(Array.isArray(response.data) ? response.data : []);
    }).catch(() => {});
  }, [selectTeam]);

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
  }), [debouncedSearch, filterAssignee, filterClientNames, filterCreatedFrom, filterCreatedTo, filterPriority, filterStatus, filterType]);

  const loadTasks = useCallback(async () => {
    if (!selectedTeam?.id) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const limit = view === 'list' ? 12 : 48;
      const response = await tasks.getByTeam(selectedTeam.id, page, limit, queryFilters);
      if (requestId !== requestIdRef.current) return;
      const serverSummary = response.data?.summary;
      if (serverSummary && Number.isFinite(Number(serverSummary.total))) {
        setTaskList(Array.isArray(response.data?.data) ? response.data.data : []);
        setSummary({ ...EMPTY_SUMMARY, ...serverSummary });
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
        setPagination(legacyPage.pagination);
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setTaskList([]);
      setLoadError(error.response?.data?.error || 'Unable to load tasks.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, queryFilters, selectedTeam?.id, view]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { setPage(1); }, [selectedTeam?.id, queryFilters, view]);
  useEffect(() => {
    if (page > pagination.total_pages) setPage(Math.max(1, pagination.total_pages));
  }, [page, pagination.total_pages]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([loadTasks(), loadMembers()]);
  }, [loadMembers, loadTasks]);

  const openTask = useCallback(async (task) => {
    if (!task?.id) return;
    try {
      const response = await tasks.getDetail(task.id);
      setSelectedTask(response.data);
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Unable to open task.');
    }
  }, []);

  const handleBulkDelete = useCallback(async (ids) => {
    await tasks.bulkDelete(ids);
    if (selectedTask && ids.includes(selectedTask.id)) setSelectedTask(null);
    await refreshWorkspace();
  }, [refreshWorkspace, selectedTask]);

  const stats = useMemo(() => {
    const total = Number(summary.total || 0);
    const done = Number(summary.done || 0);
    const todo = Number(summary.todo || 0);
    const inProgress = Number(summary.in_progress || 0);
    const pending = Number(summary.pending || 0);
    return {
      total, done, todo, inProgress, pending,
      overdue: Number(summary.overdue || 0),
      completion: total ? Math.round((done / total) * 100) : 0,
      open: todo + inProgress + pending,
    };
  }, [summary]);
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
    clientNameOptions, stats, priorityStats, memberSummary,
    maxLoad: Math.max(1, ...memberSummary.map((member) => member.load)),
    reminders, refreshWorkspace, handleBulkDelete,
  };
};
