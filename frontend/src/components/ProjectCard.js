import React from 'react';

const ProjectCard = ({ project, onSelect, onDelete }) => {
  return (
    <div style={styles.card}>
      <div onClick={() => onSelect(project)} style={styles.body}>
        <h3 style={styles.title}>{project.name}</h3>
        <p style={styles.description}>{project.description || 'No description'}</p>
      </div>
      <div style={styles.footer}>
        <button onClick={() => onSelect(project)} className="btn btn-primary" style={styles.btn}>Open</button>
        <button onClick={() => onDelete(project.id)} className="btn btn-danger" style={styles.btn}>Delete</button>
      </div>
    </div>
  );
};

const styles = {
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 4px 12px rgba(236, 72, 153, 0.15)',
    border: '1px solid #fce7f3',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  body: {
    marginBottom: '15px'
  },
  title: {
    color: '#9d174d',
    fontSize: '18px',
    marginBottom: '8px'
  },
  description: {
    color: '#666',
    fontSize: '14px'
  },
  footer: {
    display: 'flex',
    gap: '10px'
  },
  btn: {
    flex: 1,
    padding: '8px'
  }
};

export default ProjectCard;
