import React from 'react';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <nav style={styles.nav}>
      <h1 style={styles.logo}>Task Manager</h1>
      <div style={styles.right}>
        <span style={styles.username}>{user.name}</span>
        <button onClick={handleLogout} className="btn btn-secondary">
          Logout
        </button>
      </div>
    </nav>
  );
};

const styles = {
  nav: {
    background: 'white',
    padding: '15px 30px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 10px rgba(236, 72, 153, 0.2)',
    marginBottom: '30px',
  },
  logo: {
    color: '#ec4899',
    fontSize: '24px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  username: {
    color: '#9d174d',
    fontWeight: '600',
  },
};

export default Navbar;
