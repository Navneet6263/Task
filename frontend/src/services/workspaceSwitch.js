// People who work in more than one workspace see all their tasks in My Tasks. Opening a task of another workspace
// switches to it first (the server answers 409 OTHER_WORKSPACE), so its form, people and settings are right.

export const activeOrgId = () => {
  try { return Number(localStorage.getItem('active_org_id')) || null; } catch { return null; }
};

// Switches workspace and opens the task there. Returns true when it did (the page reloads).
export function openInOtherWorkspace(error, taskId) {
  const data = error?.response?.data;
  if (error?.response?.status !== 409 || data?.code !== 'OTHER_WORKSPACE' || !data.org_id) return false;
  // Already there: never loop.
  if (activeOrgId() === Number(data.org_id)) return false;
  try { localStorage.setItem('active_org_id', String(data.org_id)); } catch { return false; }
  window.location.assign(`/dashboard?task=${encodeURIComponent(taskId)}`);
  return true;
}

// "Accounts" or, for a task of another workspace, "Accounts · Vision India".
export const teamLabel = (task) => {
  const team = task?.team_name || '';
  const other = task?.workspace_name && task?.org_id && Number(task.org_id) !== activeOrgId();
  return other ? `${team}${team ? ' · ' : ''}${task.workspace_name}` : team;
};
