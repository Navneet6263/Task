export const filterTasksLocally = (taskList, filters) => {
  const search = String(filters.search || '').toLowerCase();
  return taskList.filter((task) => {
    const searchable = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    const createdDate = String(task.created_at || '').slice(0, 10);
    return (
      (!filters.statuses.length || filters.statuses.includes(task.status)) &&
      (!filters.priorities.length || filters.priorities.includes(task.priority)) &&
      (!filters.issueTypes.length || filters.issueTypes.includes(task.issue_type)) &&
      (!filters.assignees.length || filters.assignees.includes(String(task.assigned_to))) &&
      (!filters.clientNames.length || filters.clientNames.includes((task.client_name || '').trim())) &&
      (!search || searchable.includes(search)) &&
      (!filters.createdFrom || createdDate >= filters.createdFrom) &&
      (!filters.createdTo || createdDate <= filters.createdTo)
    );
  });
};

export const summarizeTasks = (taskList) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = (predicate) => taskList.filter(predicate).length;
  return {
    total: taskList.length,
    done: count((task) => task.status === 'DONE'),
    in_progress: count((task) => task.status === 'IN_PROGRESS'),
    pending: count((task) => task.status === 'PENDING'),
    todo: count((task) => task.status === 'TODO'),
    overdue: count((task) => task.due_date && task.status !== 'DONE' && new Date(task.due_date) < today),
    high: count((task) => task.priority === 'HIGH'),
    medium: count((task) => task.priority === 'MEDIUM'),
    low: count((task) => task.priority === 'LOW'),
  };
};

export const paginateTasks = (taskList, page, limit) => {
  const totalPages = Math.max(1, Math.ceil(taskList.length / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;
  return {
    data: taskList.slice(offset, offset + limit),
    pagination: {
      total: taskList.length,
      page: safePage,
      limit,
      total_pages: totalPages,
    },
  };
};
