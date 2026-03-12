import React from 'react';

const TaskCard = ({ task, onEdit, onDelete }) => {
  const statusColors = {
    TODO: 'badge-todo',
    IN_PROGRESS: 'badge-progress',
    DONE: 'badge-done',
  };

  const priorityColors = {
    LOW: 'badge-low',
    MEDIUM: 'badge-medium',
    HIGH: 'badge-high',
  };

  return (
    <div className="card" style={styles.card}>
      <div style={styles.header}>
        <h4 style={styles.title}>{task.title}</h4>
        <button onClick={() => onDelete(task.id)} style={styles.deleteBtn}>
          Delete
        </button>
      </div>
      <p style={styles.description}>{task.description}</p>
      <div style={styles.badges}>
        <span className={`badge ${statusColors[task.status]}`}>{task.status}</span>
        <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
      </div>
      {task.due_date && <p style={styles.dueDate}>Due: {new Date(task.due_date).toLocaleDateString()}</p>}
      <button onClick={() => onEdit(task)} className="btn btn-primary" style={styles.editBtn}>
        Edit
      </button>
    </div>
  );
};

const styles = {
  card: {
    marginBottom: '15px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  title: {
    color: '#9d174d',
    fontSize: '16px',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#b91c1c',
    fontWeight: 700,
  },
  description: {
    color: '#666',
    marginBottom: '10px',
    fontSize: '14px',
  },
  badges: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px',
  },
  dueDate: {
    fontSize: '13px',
    color: '#ec4899',
    marginBottom: '10px',
  },
  editBtn: {
    width: '100%',
  },
};

export default TaskCard;
