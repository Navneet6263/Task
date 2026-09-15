import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

jest.mock('./components/Layout', () => {
  const { Link, Outlet } = jest.requireActual('react-router-dom');
  return function TestLayout() {
    return <><Link to="/audit-logs">Audit</Link><Link to="/dashboard">Home</Link><Outlet /></>;
  };
});
jest.mock('./pages/Login', () => () => <p>Login screen</p>);
jest.mock('./pages/Dashboard/index', () => () => <p>Dashboard screen</p>);
jest.mock('./pages/AuditLogs', () => () => <p>Audit screen</p>);
jest.mock('./pages/Updates', () => () => <p>Product updates page</p>);

test('router handles redirects and lazy page navigation without future-flag warnings', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState({}, '', '/dashboard');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const warningSpy = jest.spyOn(console, 'warn');
  try {
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Login screen');
    expect(window.location.pathname).toBe('/login');
    act(() => root.render(null));
    localStorage.setItem('token', 'test-token');
    window.history.replaceState({}, '', '/');
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Dashboard screen');
    await act(async () => container.querySelector('a[href="/audit-logs"]').click());
    expect(container.textContent).toContain('Audit screen');
    await act(async () => container.querySelector('a[href="/dashboard"]').click());
    expect(container.textContent).toContain('Dashboard screen');
    expect(warningSpy.mock.calls.filter(args => args.some(arg =>
      String(arg).includes('React Router Future Flag Warning')
    ))).toEqual([]);
  } finally {
    act(() => root.unmount()); container.remove();
    warningSpy.mockRestore(); localStorage.clear();
    window.history.replaceState({}, '', '/');
  }
});

test('direct Updates page is authenticated and opens outside the dashboard shell', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    localStorage.clear(); window.history.replaceState({}, '', '/updates');
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Login screen');
    act(() => root.render(null));
    localStorage.setItem('token', 'test-token'); window.history.replaceState({}, '', '/updates');
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain('Product updates page');
    expect(container.querySelector('a[href="/audit-logs"]')).toBeNull();
  } finally {
    act(() => root.unmount()); container.remove(); localStorage.clear(); window.history.replaceState({}, '', '/');
  }
});
