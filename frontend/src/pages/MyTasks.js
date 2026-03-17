import React, { useEffect, useMemo, useState } from 'react';
import { tasks, teams } from '../services/api';
import './MyTasks.css';

const MyTasks = () => {
  const [taskList, setTaskList] = useState([]);
  const [reassignModal, setReassignModal] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await tasks.getMy();
      const list = response.data?.data || response.data;
      setTaskList(Array.isArray(list) ? list : []);
    } catch (error) {}
  };

  const handleStatusChange = async (task, status) => {
    try {
      await tasks.update(task.id, { ...task, status });
      await fetchTasks();
    } catch (error) {}
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
    } catch (error) {}
  };

  const handleReassign = async () => {
    if (!selectedMember) {
      alert('Select a team member');
      return;
    }

    try {
      await tasks.reassign(reassignModal.id, selectedMember);
      setReassignModal(null);
      await fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed');
    }
  };

  const summary = useMemo(
    () => ({
      total: taskList.length,
      inProgress: taskList.filter((task) => task.status === 'IN_PROGRESS').length,
      done: taskList.filter((task) => task.status === 'DONE').length,
      locked: taskList.filter((task) => task.priority_locked).length,
    }),
    [taskList]
  );

  return (
    <div className="mytasks-page">
      <header className="mytasks-head">
        <h1>My Tasks</h1>
        <p>Track, update, and reassign your current workload.</p>
      </header>

      <section className="mytasks-stats">
        <article>
          <p>Total Tasks</p>
          <h3>{summary.total}</h3>
        </article>
        <article>
          <p>In Progress</p>
          <h3>{summary.inProgress}</h3>
        </article>
        <article>
          <p>Completed</p>
          <h3>{summary.done}</h3>
        </article>
        <article>
          <p>Priority Locked</p>
          <h3>{summary.locked}</h3>
        </article>
      </section>

      <section className="mytasks-card">
        <div className="mytasks-table-wrap">
          <table className="mytasks-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Team</th>
                <th>Assigned By</th>
                <th>Priority</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {taskList.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>
                    <span className="mytasks-team-pill">{task.team_name}</span>
                  </td>
                  <td>{task.assigned_by_name || '-'}</td>
                  <td>
                    <span className={`mytasks-priority ${priorityClass(task.priority)}`}>{task.priority}</span>
                  </td>
                  <td>{dateLabel(task.due_date)}</td>
                  <td>
                    <select value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)}>
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="PENDING">Pending</option>
                      <option value="DONE">Done</option>
                    </select>
                  </td>
                  <td>
                    <div className="mytasks-actions">
                      <button type="button" onClick={() => handlePriorityLock(task.id)}>
                        {task.priority_locked ? 'Priority Locked' : 'Lock Priority'}
                      </button>
                      <button type="button" onClick={() => openReassign(task)}>
                        Reassign
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {taskList.length === 0 && (
                <tr>
                  <td colSpan={7} className="mytasks-empty">
                    No tasks assigned to you.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {reassignModal && (
        <div className="mytasks-overlay" onClick={() => setReassignModal(null)}>
          <div className="mytasks-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Reassign Task</h3>
            <p>{reassignModal.title}</p>

            <div className="mytasks-member-list">
              {teamMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={`mytasks-member ${selectedMember === member.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedMember(member.id)}
                >
                  <span>{initials(member.name)}</span>
                  <div>
                    <strong>{member.name}</strong>
                    <small>
                      {member.team_role} | {member.current_tasks} active tasks
                    </small>
                  </div>
                </button>
              ))}
              {teamMembers.length === 0 && <p className="mytasks-empty">No members available.</p>}
            </div>

            <div className="mytasks-modal-actions">
              <button type="button" onClick={() => setReassignModal(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleReassign}>
                Confirm Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const initials = (name) => {
  if (!name) return 'US';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const dateLabel = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const priorityClass = (value) => {
  if (value === 'HIGH') return 'high';
  if (value === 'LOW') return 'low';
  return 'medium';
};

export default MyTasks;
