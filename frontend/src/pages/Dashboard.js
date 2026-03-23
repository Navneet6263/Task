import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { teams, tasks } from '../services/api';
import './Dashboard.css';

const PAGE_SIZE = 12;
const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const STATUS_LABEL = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  DONE: 'Done',
};

const DEFAULT_TASK_FORM_OPTIONS = {
  task_types: [
    { label: 'Feature', parent_value: '' },
    { label: 'Improvement', parent_value: '' },
    { label: 'Testing', parent_value: '' },
    { label: 'Research', parent_value: '' },
  ],
  products: [
    { label: 'Dashboard', parent_value: '' },
    { label: 'UI/UX', parent_value: '' },
    { label: 'Backend API', parent_value: '' },
    { label: 'Mobile App', parent_value: '' },
    { label: 'Authentication', parent_value: '' },
    { label: 'Reports', parent_value: '' },
  ],
  categories: [
    { label: 'New Feature', parent_value: 'Feature' },
    { label: 'Workflow', parent_value: 'Feature' },
    { label: 'Optimization', parent_value: 'Improvement' },
    { label: 'Refactor', parent_value: 'Improvement' },
    { label: 'Regression', parent_value: 'Testing' },
    { label: 'UAT', parent_value: 'Testing' },
    { label: 'Discovery', parent_value: 'Research' },
    { label: 'Documentation', parent_value: 'Research' },
  ],
};
const MAX_REFERENCE_IMAGE_BYTES = 450 * 1024;

const buildInitialTaskForm = () => {
  const today = new Date().toISOString().split('T')[0];

  return {
    title: '',
    description: '',
    priority: 'MEDIUM',
    assigned_to: '',
    assigned_date: today,
    start_date: today,
    due_date: '',
    issue_type: 'task',
    task_type: '',
    product: '',
    category: '',
    reference_image: '',
  };
};

const initialMgrForm = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  assigned_to: '',
  due_date: '',
};

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

  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMgrModal, setShowMgrModal] = useState(false);

  const [orgUsers, setOrgUsers] = useState([]);
  const [taskForm, setTaskForm] = useState(buildInitialTaskForm());
  const [taskFormOptions, setTaskFormOptions] = useState(DEFAULT_TASK_FORM_OPTIONS);
  const [mgrForm, setMgrForm] = useState(initialMgrForm);

  const selectTeam = useCallback(async (team) => {
    setSelectedTeam(team);
    setSelectedTask(null);

    try {
      const [taskRes, memberRes] = await Promise.all([
        tasks.getByTeam(team.id, 1, 200),
        teams.getMembers(team.id),
      ]);

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

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const fetchTaskFormOptions = useCallback(async () => {
    try {
      const response = await tasks.getFormOptions();
      setTaskFormOptions({
        task_types: Array.isArray(response.data?.task_types) && response.data.task_types.length > 0
          ? response.data.task_types
          : DEFAULT_TASK_FORM_OPTIONS.task_types,
        products: Array.isArray(response.data?.products) && response.data.products.length > 0
          ? response.data.products
          : DEFAULT_TASK_FORM_OPTIONS.products,
        categories: Array.isArray(response.data?.categories) && response.data.categories.length > 0
          ? response.data.categories
          : DEFAULT_TASK_FORM_OPTIONS.categories,
      });
    } catch (error) {
      setTaskFormOptions(DEFAULT_TASK_FORM_OPTIONS);
    }
  }, []);

  useEffect(() => {
    fetchTaskFormOptions();
  }, [fetchTaskFormOptions]);

  useEffect(() => {
    setPage(1);
  }, [selectedTeam?.id, filterPriority, filterAssignee, view]);

  const refresh = useCallback(async () => {
    if (!selectedTeam) return;
    await selectTeam(selectedTeam);
  }, [selectedTeam, selectTeam]);

  const handleCreateTask = async (event) => {
    event.preventDefault();
    if (!selectedTeam) return;

    try {
      await tasks.create({
        ...taskForm,
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        team_id: selectedTeam.id,
        assigned_to: taskForm.assigned_to || null,
        task_type: taskForm.task_type || null,
        product: taskForm.product || null,
        category: taskForm.category || null,
        assigned_date: taskForm.assigned_date || null,
        start_date: taskForm.start_date || null,
        due_date: taskForm.due_date || null,
        reference_image: taskForm.reference_image || null,
      });
      setShowTaskModal(false);
      setTaskForm(buildInitialTaskForm());
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create task');
    }
  };

  const handleManagerAssign = async (event) => {
    event.preventDefault();
    try {
      await tasks.managerAssign({ ...mgrForm, team_id: selectedTeam?.id || null });
      setShowMgrModal(false);
      setMgrForm(initialMgrForm);
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign');
    }
  };

  const openManagerModal = async () => {
    if (orgUsers.length === 0) {
      try {
        const response = await tasks.getOrgUsers();
        setOrgUsers(Array.isArray(response.data) ? response.data : []);
      } catch (error) {}
    }
    setShowMgrModal(true);
  };

  const openTaskComposer = async () => {
    if (!selectedTeam) return;
    setTaskForm(buildInitialTaskForm());
    await fetchTaskFormOptions();
    setShowTaskModal(true);
  };

  const updateTaskFormField = (field, value) => {
    setTaskForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'task_type') next.category = '';
      return next;
    });
  };

  const handleReferenceImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }

    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      alert('Please upload an image under 450KB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateTaskFormField('reference_image', typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => alert('Failed to read the selected image');
    reader.readAsDataURL(file);
  };

  const handleStatusChange = async (task, status) => {
    try {
      await tasks.update(task.id, { ...task, status });
      await refresh();
    } catch (error) {}
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await tasks.delete(taskId);
      setSelectedTask(null);
      await refresh();
    } catch (error) {}
  };

  const handlePickBug = async (taskId) => {
    try {
      await tasks.pickBug(taskId);
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to pick bug');
    }
  };

  const handleResolveBug = async (taskId) => {
    try {
      await tasks.resolveBug(taskId);
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to resolve bug');
    }
  };

  const handlePanelUpdate = async (field, value) => {
    if (!selectedTask) return;
    const normalized = field === 'assigned_to' ? (value ? Number(value) : null) : value;
    const nextTask = { ...selectedTask, [field]: normalized };
    if (field === 'task_type') nextTask.category = '';

    try {
      await tasks.update(selectedTask.id, {
        ...nextTask,
        assigned_to: nextTask.assigned_to || null,
      });
      setSelectedTask(nextTask);
      await refresh();
    } catch (error) {}
  };

  const availableTaskOptions = useMemo(
    () => ({
      task_types: taskFormOptions.task_types?.length ? taskFormOptions.task_types : DEFAULT_TASK_FORM_OPTIONS.task_types,
      products: taskFormOptions.products?.length ? taskFormOptions.products : DEFAULT_TASK_FORM_OPTIONS.products,
      categories: taskFormOptions.categories?.length ? taskFormOptions.categories : DEFAULT_TASK_FORM_OPTIONS.categories,
    }),
    [taskFormOptions]
  );

  const createTaskCategories = useMemo(
    () => filterCategoryOptions(availableTaskOptions.categories, taskForm.task_type),
    [availableTaskOptions.categories, taskForm.task_type]
  );

  const selectedTaskCategories = useMemo(
    () => filterCategoryOptions(availableTaskOptions.categories, selectedTask?.task_type),
    [availableTaskOptions.categories, selectedTask?.task_type]
  );

  const filtered = useMemo(
    () =>
      taskList.filter((task) => {
        const matchPriority = !filterPriority || task.priority === filterPriority;
        const matchAssignee = !filterAssignee || task.assigned_to === Number(filterAssignee);
        return matchPriority && matchAssignee;
      }),
    [taskList, filterPriority, filterAssignee]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const stats = useMemo(() => {
    const total = taskList.length;
    const done = taskList.filter((task) => task.status === 'DONE').length;
    const inProgress = taskList.filter((task) => task.status === 'IN_PROGRESS').length;
    const pending = taskList.filter((task) => task.status === 'PENDING').length;
    const todo = taskList.filter((task) => task.status === 'TODO').length;
    const overdue = taskList.filter((task) => isOverdue(task)).length;
    const completion = total ? Math.round((done / total) * 100) : 0;

    return {
      total,
      done,
      inProgress,
      pending,
      todo,
      overdue,
      completion,
      open: todo + inProgress + pending,
    };
  }, [taskList]);

  const priorityStats = useMemo(
    () => ({
      HIGH: taskList.filter((task) => task.priority === 'HIGH').length,
      MEDIUM: taskList.filter((task) => task.priority === 'MEDIUM').length,
      LOW: taskList.filter((task) => task.priority === 'LOW').length,
    }),
    [taskList]
  );

  const memberSummary = useMemo(() => {
    const mapped = members.map((member) => {
      const derived = taskList.filter(
        (task) => task.assigned_to === member.id && task.status !== 'DONE'
      ).length;

      return {
        ...member,
        load: typeof member.current_tasks === 'number' ? member.current_tasks : derived,
      };
    });

    return mapped.sort((a, b) => b.load - a.load).slice(0, 6);
  }, [members, taskList]);

  const maxLoad = Math.max(1, ...memberSummary.map((member) => member.load));
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const reminders = useMemo(() => {
    const list = [];

    if (stats.overdue > 0) {
      list.push({ tone: 'danger', title: `${stats.overdue} overdue tasks`, note: 'Check blockers and adjust deadlines.' });
    }

    if (stats.pending > 0) {
      list.push({ tone: 'warning', title: `${stats.pending} pending tasks`, note: 'Dependencies may be waiting.' });
    }

    if (stats.open === 0 && stats.total > 0) {
      list.push({ tone: 'success', title: 'Sprint is clean', note: 'No open tasks currently.' });
    }

    if (list.length === 0) {
      list.push({ tone: 'info', title: 'Add more tasks', note: 'Use create task to plan next work.' });
    }

    return list.slice(0, 4);
  }, [stats]);

  const renderListView = () => (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Assignee</th>
            <th>Due</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {paginated.map((task) => (
            <tr key={task.id} className={selectedTask?.id === task.id ? 'is-selected' : ''} onClick={() => setSelectedTask(task)}>
              <td>
                <div className="dash-task-main">
                  <span className={`dash-issue-tag ${task.issue_type || 'task'}`}>{(task.issue_type || 'task').toUpperCase()}</span>
                  {task.manager_assigned && <span className="dash-manager-tag">MANAGER</span>}
                  <strong>{task.title}</strong>
                </div>
              </td>

              <td>
                <div className="dash-assignee-cell">
                  <span className="dash-mini-avatar">{initials(task.assigned_to_name)}</span>
                  <span>{task.assigned_to_name || 'Unassigned'}</span>
                </div>
              </td>

              <td>{dateLabel(task.due_date)}</td>

              <td>
                <span className={`dash-priority-pill ${priorityClass(task.priority)}`}>{task.priority || 'MEDIUM'}</span>
              </td>

              <td>
                <span className={`dash-status ${statusClass(task.status)}`}>{STATUS_LABEL[task.status] || task.status}</span>
              </td>

              <td>
                <div className="dash-action-row" onClick={(event) => event.stopPropagation()}>
                  {task.issue_type === 'bug' && task.status !== 'DONE' && !task.picked_by && (
                    <button type="button" className="dash-btn dash-btn-secondary" onClick={() => handlePickBug(task.id)}>
                      Pick
                    </button>
                  )}

                  {task.issue_type === 'bug' && task.status !== 'DONE' && task.picked_by && (
                    <button type="button" className="dash-btn dash-btn-secondary" onClick={() => handleResolveBug(task.id)}>
                      Resolve
                    </button>
                  )}

                  {task.issue_type !== 'bug' && (
                    <select className="dash-select dash-status-select" value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)}>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                      ))}
                    </select>
                  )}

                  <button type="button" className="dash-btn dash-btn-danger" onClick={() => handleDelete(task.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}

          {paginated.length === 0 && (
            <tr>
              <td colSpan={6} className="dash-empty-row">No tasks found for selected filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderBoardView = () => (
    <div className="dash-board-grid">
      {STATUS_OPTIONS.map((status) => {
        const columnItems = filtered.filter((task) => task.status === status);
        return (
          <article key={status} className="dash-board-column">
            <header>
              <h4>{STATUS_LABEL[status]}</h4>
              <span>{columnItems.length}</span>
            </header>

            {columnItems.map((task) => (
              <div key={task.id} className="dash-board-card" onClick={() => setSelectedTask(task)}>
                <h5>{task.title}</h5>
                <p>{task.assigned_to_name || 'Unassigned'}</p>

                <div className="dash-board-meta">
                  <span className={`dash-priority-pill ${priorityClass(task.priority)}`}>{task.priority || 'MEDIUM'}</span>
                  <span>{dateLabel(task.due_date)}</span>
                </div>

                <select className="dash-select" value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)}>
                  {STATUS_OPTIONS.map((value) => (
                    <option key={value} value={value}>{STATUS_LABEL[value]}</option>
                  ))}
                </select>
              </div>
            ))}

            {columnItems.length === 0 && <div className="dash-board-empty">No tasks</div>}
          </article>
        );
      })}
    </div>
  );

  const renderTimelineView = () => (
    <div className="dash-timeline">
      {filtered.map((task) => (
        <article key={task.id} className="dash-timeline-item" onClick={() => setSelectedTask(task)}>
          <div className="dash-timeline-top">
            <strong>{task.title}</strong>
            <span>{dateLabel(task.due_date)}</span>
          </div>

          <div className="dash-progress-line">
            <span style={{ width: `${statusProgress(task.status)}%` }} />
          </div>

          <p>
            {task.assigned_to_name || 'Unassigned'} | {STATUS_LABEL[task.status] || task.status}
          </p>
        </article>
      ))}

      {filtered.length === 0 && <div className="dash-board-empty">No tasks for timeline view.</div>}
    </div>
  );

  return (
    <div className="dashboard-page">
      <section className="dash-hero">
        <div>
          <p className="dash-eyebrow">Workspace Pulse</p>
          <h1>Welcome back, {firstName(user.name)}.</h1>
          <p className="dash-hero-sub">Plan faster, assign clearly, and keep delivery smooth. {today}</p>

          <div className="dash-team-pills">
            {teamList.map((team) => (
              <button key={team.id} type="button" className={`dash-team-pill ${selectedTeam?.id === team.id ? 'is-active' : ''}`} onClick={() => selectTeam(team)}>
                {team.name}
              </button>
            ))}
            {teamList.length === 0 && <span className="dash-team-empty">Create a team to begin.</span>}
          </div>
        </div>

        <div className="dash-hero-actions">
          <button type="button" className="dash-btn dash-btn-primary" onClick={openTaskComposer} disabled={!selectedTeam}>Create Task</button>
          {user.role === 'manager' && (
            <button type="button" className="dash-btn dash-btn-secondary" onClick={openManagerModal}>Manager Assign</button>
          )}
        </div>
      </section>

      <section className="dash-metric-grid">
        {[
          { label: 'Total Tasks', value: stats.total, note: `${teamList.length} teams`, progress: stats.total ? 100 : 0, tone: 'blue' },
          { label: 'Open Queue', value: stats.open, note: `${stats.inProgress} in progress`, progress: stats.total ? Math.round((stats.open / stats.total) * 100) : 0, tone: 'amber' },
          { label: 'Completed', value: `${stats.completion}%`, note: `${stats.done} finished`, progress: stats.completion, tone: 'green' },
          { label: 'Overdue', value: stats.overdue, note: stats.overdue ? 'Needs attention' : 'On track', progress: stats.total ? Math.round((stats.overdue / stats.total) * 100) : 0, tone: 'coral' },
        ].map((card, index) => (
          <article key={card.label} className={`dash-metric-card tone-${card.tone}`} style={{ '--delay': `${index * 80}ms` }}>
            <div>
              <p>{card.label}</p>
              <h3>{card.value}</h3>
              <span>{card.note}</span>
            </div>
            <div className="dash-ring" style={{ '--progress': `${card.progress}%` }}>
              <strong>{card.progress}%</strong>
            </div>
          </article>
        ))}
      </section>

      {!selectedTeam && (
        <section className="dash-empty-state">
          <h2>No team selected</h2>
          <p>Open Team Management and create a team to start assigning tasks.</p>
        </section>
      )}

      {selectedTeam && (
        <section className="dash-main-grid">
          <div className="dash-left-column">
            <article className="dash-panel">
              <header className="dash-panel-head dash-panel-head-wrap">
                <div>
                  <h2>Task Workspace</h2>
                  <span>{filtered.length} tasks in {selectedTeam.name}</span>
                </div>

                <div className="dash-toolbar">
                  <div className="dash-view-tabs">
                    {['list', 'board', 'timeline'].map((type) => (
                      <button key={type} type="button" className={view === type ? 'is-active' : ''} onClick={() => setView(type)}>{type}</button>
                    ))}
                  </div>

                  <select className="dash-select" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}>
                    <option value="">All priority</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>

                  <select className="dash-select" value={filterAssignee} onChange={(event) => setFilterAssignee(event.target.value)}>
                    <option value="">All members</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
              </header>

              {view === 'list' ? renderListView() : view === 'board' ? renderBoardView() : renderTimelineView()}

              {view === 'list' && filtered.length > PAGE_SIZE && (
                <footer className="dash-pagination">
                  <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1}>Prev</button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
                    <button key={value} type="button" className={page === value ? 'is-active' : ''} onClick={() => setPage(value)}>{value}</button>
                  ))}
                  <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page === totalPages}>Next</button>
                </footer>
              )}
            </article>
          </div>

          <aside className="dash-right-column">
            <article className="dash-panel">
              <header className="dash-panel-head">
                <h2>Priority Split</h2>
                <span>Backlog mix</span>
              </header>

              {[
                { key: 'HIGH', label: 'High', tone: 'high' },
                { key: 'MEDIUM', label: 'Medium', tone: 'medium' },
                { key: 'LOW', label: 'Low', tone: 'low' },
              ].map((item) => {
                const count = priorityStats[item.key];
                const ratio = stats.total ? Math.round((count / stats.total) * 100) : 0;

                return (
                  <div key={item.key} className="dash-breakdown-row">
                    <div className="dash-breakdown-title">
                      <span className={`dash-dot ${item.tone}`} />
                      <p>{item.label}</p>
                    </div>
                    <div className="dash-breakdown-bar"><span style={{ width: `${ratio}%` }} /></div>
                    <strong>{ratio}%</strong>
                  </div>
                );
              })}
            </article>

            <article className="dash-panel">
              <header className="dash-panel-head">
                <h2>Team Snapshot</h2>
                <span>{members.length} members</span>
              </header>

              {memberSummary.length === 0 && <p className="dash-muted">No members in this team yet.</p>}

              {memberSummary.map((member) => (
                <div key={member.id} className="dash-member-row">
                  <div className="dash-member-ident">
                    <span className="dash-mini-avatar">{initials(member.name)}</span>
                    <div>
                      <p>{member.name}</p>
                      <span>{member.role || member.team_role || 'Member'}</span>
                    </div>
                  </div>

                  <div className="dash-member-load">
                    <div><span style={{ width: `${Math.round((member.load / maxLoad) * 100)}%` }} /></div>
                    <small>{member.load} active</small>
                  </div>
                </div>
              ))}
            </article>

            <article className="dash-panel">
              <header className="dash-panel-head">
                <h2>Reminders</h2>
                <span>Action points</span>
              </header>

              <div className="dash-reminders">
                {reminders.map((item) => (
                  <div key={item.title} className={`dash-reminder ${item.tone}`}>
                    <p>{item.title}</p>
                    <span>{item.note}</span>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      )}

      {selectedTask && (
        <div className="dash-sheet-overlay" onClick={() => setSelectedTask(null)}>
          <aside className="dash-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="dash-sheet-head">
              <span>TASK-{selectedTask.id}</span>
              <button type="button" onClick={() => setSelectedTask(null)}>Close</button>
            </div>

            <div className="dash-sheet-tags">
              <span className={`dash-issue-tag ${selectedTask.issue_type || 'task'}`}>{(selectedTask.issue_type || 'task').toUpperCase()}</span>
              {selectedTask.manager_assigned && <span className="dash-manager-tag">MANAGER</span>}
            </div>

            <h3>{selectedTask.title}</h3>
            <p className="dash-sheet-desc">{selectedTask.description || 'No description available.'}</p>

            <div className="dash-sheet-grid">
              <div className="dash-sheet-meta">
                <span>Task Type</span>
                <strong>{selectedTask.task_type || '-'}</strong>
              </div>
              <div className="dash-sheet-meta">
                <span>Product</span>
                <strong>{selectedTask.product || '-'}</strong>
              </div>
              <div className="dash-sheet-meta">
                <span>Category</span>
                <strong>{selectedTask.category || '-'}</strong>
              </div>
              <div className="dash-sheet-meta">
                <span>End Date</span>
                <strong>{dateLabel(selectedTask.due_date)}</strong>
              </div>
            </div>

            {selectedTask.reference_image && (
              <div className="dash-sheet-media">
                <span>Reference Image</span>
                <img src={selectedTask.reference_image} alt={`${selectedTask.title} reference`} />
              </div>
            )}

            <label>
              <span>Status</span>
              <select className="dash-select" value={selectedTask.status} onChange={(event) => handlePanelUpdate('status', event.target.value)}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                ))}
              </select>
            </label>

            <div className="dash-field-row">
              <label>
                <span>Priority</span>
                <select className="dash-select" value={selectedTask.priority} onChange={(event) => handlePanelUpdate('priority', event.target.value)}>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </label>

              <label>
                <span>Assignee</span>
                <select className="dash-select" value={selectedTask.assigned_to || ''} onChange={(event) => handlePanelUpdate('assigned_to', event.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="dash-field-row">
              <label>
                <span>Task Type</span>
                <select className="dash-select" value={selectedTask.task_type || ''} onChange={(event) => handlePanelUpdate('task_type', event.target.value)}>
                  <option value="">Select task type</option>
                  {availableTaskOptions.task_types.map((option) => (
                    <option key={option.id || option.label} value={option.label}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Product / Module</span>
                <select className="dash-select" value={selectedTask.product || ''} onChange={(event) => handlePanelUpdate('product', event.target.value)}>
                  <option value="">Select product</option>
                  {availableTaskOptions.products.map((option) => (
                    <option key={option.id || option.label} value={option.label}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Category</span>
              <select className="dash-select" value={selectedTask.category || ''} onChange={(event) => handlePanelUpdate('category', event.target.value)}>
                <option value="">Select category</option>
                {selectedTaskCategories.map((option) => (
                  <option key={option.id || `${option.label}-${option.parent_value || 'general'}`} value={option.label}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="dash-field-row">
              <label>
                <span>Assigned Date</span>
                <input className="dash-input" type="date" value={toInputDate(selectedTask.assigned_date)} onChange={(event) => handlePanelUpdate('assigned_date', event.target.value)} />
              </label>

              <label>
                <span>Start Date</span>
                <input className="dash-input" type="date" value={toInputDate(selectedTask.start_date)} onChange={(event) => handlePanelUpdate('start_date', event.target.value)} />
              </label>
            </div>

            <label>
              <span>End Date</span>
              <input className="dash-input" type="date" value={toInputDate(selectedTask.due_date)} onChange={(event) => handlePanelUpdate('due_date', event.target.value)} />
            </label>

            <button type="button" className="dash-btn dash-btn-danger dash-sheet-delete" onClick={() => handleDelete(selectedTask.id)}>Delete Task</button>
          </aside>
        </div>
      )}

      {showMgrModal && (
        <div className="dash-modal-overlay" onClick={() => setShowMgrModal(false)}>
          <div className="dash-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Manager Assign</h3>
            <p>Assign a task to any user in your organization.</p>

            <form onSubmit={handleManagerAssign}>
              <input className="dash-input" placeholder="Task title" value={mgrForm.title} onChange={(event) => setMgrForm({ ...mgrForm, title: event.target.value })} required />
              <textarea className="dash-input" placeholder="Description" value={mgrForm.description} onChange={(event) => setMgrForm({ ...mgrForm, description: event.target.value })} />

              <select className="dash-select" value={mgrForm.priority} onChange={(event) => setMgrForm({ ...mgrForm, priority: event.target.value })}>
                <option value="LOW">Low priority</option>
                <option value="MEDIUM">Medium priority</option>
                <option value="HIGH">High priority</option>
              </select>

              <select className="dash-select" value={mgrForm.assigned_to} onChange={(event) => setMgrForm({ ...mgrForm, assigned_to: event.target.value })} required>
                <option value="">Select member</option>
                {orgUsers.map((orgUser) => (
                  <option key={orgUser.id} value={orgUser.id}>{orgUser.name} ({orgUser.role})</option>
                ))}
              </select>

              <input className="dash-input" type="date" value={mgrForm.due_date} onChange={(event) => setMgrForm({ ...mgrForm, due_date: event.target.value })} />

              <div className="dash-modal-actions">
                <button type="button" className="dash-btn" onClick={() => setShowMgrModal(false)}>Cancel</button>
                <button type="submit" className="dash-btn dash-btn-primary">Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="dash-composer-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="dash-composer" onClick={(event) => event.stopPropagation()}>
            <div className="dash-composer-head">
              <div>
                <p className="dash-eyebrow">Task Composer</p>
                <h3>Create a detailed task</h3>
                <p className="dash-composer-sub">Open the form wide, set dates clearly, and attach one small reference image.</p>
              </div>
              <button type="button" className="dash-btn" onClick={() => setShowTaskModal(false)}>Close</button>
            </div>

            <form className="dash-composer-form" onSubmit={handleCreateTask}>
              <div className="dash-composer-grid">
                <div className="dash-composer-main">
                  <section className="dash-composer-card">
                    <div className="dash-section-head">
                      <div>
                        <h4>Workflow</h4>
                        <p>Select how this item should move in the workspace.</p>
                      </div>
                    </div>

                    <div className="dash-issue-switch">
                      {[
                        ['task', 'Task'],
                        ['bug', 'Bug'],
                        ['story', 'Story'],
                      ].map(([type, label]) => (
                        <button key={type} type="button" className={taskForm.issue_type === type ? 'is-active' : ''} onClick={() => updateTaskFormField('issue_type', type)}>
                          {label}
                        </button>
                      ))}
                    </div>

                    <label>
                      <span>Task Title</span>
                      <input className="dash-input" placeholder="Write a clear task title" value={taskForm.title} onChange={(event) => updateTaskFormField('title', event.target.value)} required />
                    </label>

                    <label>
                      <span>Description</span>
                      <textarea className="dash-input" placeholder="Explain expected output, dependencies, and delivery details" value={taskForm.description} onChange={(event) => updateTaskFormField('description', event.target.value)} />
                    </label>
                  </section>

                  <section className="dash-composer-card">
                    <div className="dash-section-head">
                      <div>
                        <h4>Task Setup</h4>
                        <p>These dropdowns are controlled from Settings by admin and manager.</p>
                      </div>
                    </div>

                    <div className="dash-field-row dash-field-row-3">
                      <label>
                        <span>Task Type</span>
                        <select className="dash-select" value={taskForm.task_type} onChange={(event) => updateTaskFormField('task_type', event.target.value)}>
                          <option value="">Select task type</option>
                          {availableTaskOptions.task_types.map((option) => (
                            <option key={option.id || option.label} value={option.label}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Product / Module</span>
                        <select className="dash-select" value={taskForm.product} onChange={(event) => updateTaskFormField('product', event.target.value)}>
                          <option value="">Select product/module</option>
                          {availableTaskOptions.products.map((option) => (
                            <option key={option.id || option.label} value={option.label}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Category</span>
                        <select className="dash-select" value={taskForm.category} onChange={(event) => updateTaskFormField('category', event.target.value)}>
                          <option value="">Select category</option>
                          {createTaskCategories.map((option) => (
                            <option key={option.id || `${option.label}-${option.parent_value || 'general'}`} value={option.label}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="dash-composer-card">
                    <div className="dash-section-head">
                      <div>
                        <h4>Ownership & Dates</h4>
                        <p>Assigned date, start date, and end date stay visible for delivery tracking.</p>
                      </div>
                    </div>

                    <div className="dash-field-row">
                      <label>
                        <span>Priority</span>
                        <select className="dash-select" value={taskForm.priority} onChange={(event) => updateTaskFormField('priority', event.target.value)}>
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                        </select>
                      </label>

                      <label>
                        <span>Assignee</span>
                        <select className="dash-select" value={taskForm.assigned_to} onChange={(event) => updateTaskFormField('assigned_to', event.target.value)}>
                          <option value="">Unassigned</option>
                          {members.map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="dash-field-row dash-field-row-3">
                      <label>
                        <span>Assigned Date</span>
                        <input className="dash-input" type="date" value={taskForm.assigned_date} onChange={(event) => updateTaskFormField('assigned_date', event.target.value)} />
                      </label>

                      <label>
                        <span>Start Date</span>
                        <input className="dash-input" type="date" value={taskForm.start_date} onChange={(event) => updateTaskFormField('start_date', event.target.value)} />
                      </label>

                      <label>
                        <span>End Date</span>
                        <input className="dash-input" type="date" value={taskForm.due_date} onChange={(event) => updateTaskFormField('due_date', event.target.value)} />
                      </label>
                    </div>
                  </section>

                  <section className="dash-composer-card">
                    <div className="dash-section-head">
                      <div>
                        <h4>Reference Image</h4>
                        <p>Add one small screenshot or mockup so the assignee understands the task quickly.</p>
                      </div>
                    </div>

                    <label className="dash-upload-box">
                      <span>Upload Image</span>
                      <input className="dash-input dash-file-input" type="file" accept="image/*" onChange={handleReferenceImageChange} />
                      <small>Use PNG, JPG, or WEBP under 450KB.</small>
                    </label>

                    {taskForm.reference_image && (
                      <div className="dash-image-preview">
                        <img src={taskForm.reference_image} alt="Task reference preview" />
                        <button type="button" className="dash-btn dash-btn-secondary" onClick={() => updateTaskFormField('reference_image', '')}>
                          Remove Image
                        </button>
                      </div>
                    )}
                  </section>
                </div>

                <aside className="dash-composer-side">
                  <section className="dash-composer-card dash-composer-summary">
                    <div className="dash-section-head">
                      <div>
                        <h4>Live Summary</h4>
                        <p>Everything here gets saved with the task.</p>
                      </div>
                    </div>

                    <div className="dash-summary-list">
                      <div>
                        <span>Team</span>
                        <strong>{selectedTeam?.name || 'No team selected'}</strong>
                      </div>
                      <div>
                        <span>Workflow</span>
                        <strong>{taskForm.issue_type.toUpperCase()}</strong>
                      </div>
                      <div>
                        <span>Task Type</span>
                        <strong>{taskForm.task_type || 'Not selected'}</strong>
                      </div>
                      <div>
                        <span>Product</span>
                        <strong>{taskForm.product || 'Not selected'}</strong>
                      </div>
                      <div>
                        <span>Category</span>
                        <strong>{taskForm.category || 'Not selected'}</strong>
                      </div>
                      <div>
                        <span>Assignee</span>
                        <strong>{members.find((member) => Number(member.id) === Number(taskForm.assigned_to))?.name || 'Unassigned'}</strong>
                      </div>
                      <div>
                        <span>End Date</span>
                        <strong>{dateLabel(taskForm.due_date)}</strong>
                      </div>
                    </div>

                    <div className="dash-composer-note">
                      <p>Admins and managers can customize these fields from Settings.</p>
                    </div>
                  </section>
                </aside>
              </div>

              <div className="dash-modal-actions">
                <button type="button" className="dash-btn" onClick={() => setShowTaskModal(false)}>Cancel</button>
                <button type="submit" className="dash-btn dash-btn-primary">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const toInputDate = (value) => {
  if (!value) return '';
  return String(value).split('T')[0];
};

const dateLabel = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const isOverdue = (task) => {
  if (!task.due_date || task.status === 'DONE') return false;
  const due = new Date(task.due_date);
  return !Number.isNaN(due.getTime()) && due < new Date();
};

const filterCategoryOptions = (options = [], taskType = '') => {
  if (!taskType) return options;
  return options.filter((option) => !option.parent_value || option.parent_value === taskType);
};

const firstName = (name) => {
  if (!name) return 'there';
  return String(name).split(' ')[0];
};

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const statusProgress = (status) => {
  if (status === 'DONE') return 100;
  if (status === 'IN_PROGRESS') return 62;
  if (status === 'PENDING') return 30;
  return 14;
};

const statusClass = (status) => {
  if (status === 'DONE') return 'done';
  if (status === 'IN_PROGRESS') return 'progress';
  if (status === 'PENDING') return 'pending';
  return 'todo';
};

const priorityClass = (priority) => {
  if (priority === 'HIGH') return 'high';
  if (priority === 'LOW') return 'low';
  return 'medium';
};

export default Dashboard;
