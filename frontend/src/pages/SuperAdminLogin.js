import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './SuperAdminLogin.css';

const sa = axios.create({ baseURL: `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/sa` });

const SuperAdminLogin = () => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const response = await sa.post('/verify-email', { email: email.trim() });
      setUserInfo(response.data);
      if (response.data.is_master) {
        setStep(2);
      } else {
        const loginResponse = await sa.post('/login', { email: email.trim() });
        localStorage.setItem('sa_token', loginResponse.data.token);
        localStorage.setItem('sa_user', JSON.stringify(loginResponse.data));
        navigate('/sa-dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Email not authorized');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const response = await sa.post('/login', { email: email.trim(), password });
      localStorage.setItem('sa_token', response.data.token);
      localStorage.setItem('sa_user', JSON.stringify(response.data));
      navigate('/sa-dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sa-auth">
      <div className="sa-auth__grid" />
      <div className="sa-auth__floor-glow" />

      <div className="sa-auth__card">
        <div className="sa-auth__brand">
          <span className="sa-auth__badge">SA</span>
          <div>
            <p className="sa-auth__kicker">CONTROL CENTER</p>
            <h1>Super Admin Login</h1>
          </div>
        </div>

        <p className="sa-auth__subtitle">
          {step === 1 ? 'Verify your email for admin access.' : `Welcome ${userInfo?.name || ''}, enter password to continue.`}
        </p>

        {error && <div className="sa-auth__error">{error}</div>}

        {step === 1 ? (
          <form onSubmit={handleEmailSubmit} className="sa-auth__form">
            <label className="sa-auth__label">Email Address</label>
            <input
              className="sa-auth__input"
              type="email"
              placeholder="superadmin@navtask.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
            <button type="submit" className="sa-auth__primary-btn" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify Email'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="sa-auth__form">
            <div className="sa-auth__verified-email">{email}</div>
            <label className="sa-auth__label">Password</label>
            <input
              className="sa-auth__input"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
            <button type="submit" className="sa-auth__primary-btn" disabled={busy}>
              {busy ? 'Signing In...' : 'Login'}
            </button>
            <button
              type="button"
              className="sa-auth__secondary-btn"
              onClick={() => {
                setStep(1);
                setError('');
                setPassword('');
              }}
            >
              Change Email
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SuperAdminLogin;
