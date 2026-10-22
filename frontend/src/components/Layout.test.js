import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';
import useLayout from './useLayout';

jest.mock('./useLayout');
jest.mock('./ToastHost', () => () => null);

test('one larger logo stays in the full-width header through sidebar collapse and expand', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let state = {
    user: { name: 'Test User' }, resolvedRole: 'member', navGroups: [],
    accessibleOrgs: [], visibleNotifications: [], initials: 'TU',
    unreadCount: 0, sidebarCollapsed: false, sidebarOpen: false,
    toggleSidebarCollapsed: jest.fn(() => { state = { ...state, sidebarCollapsed: !state.sidebarCollapsed }; }),
  };
  useLayout.mockImplementation(() => state);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const render = () => act(() => root.render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Layout /></MemoryRouter>
  ));
  try {
    render();
    const brand = container.querySelector('.shell-root > header .shell-header-brand');
    expect(brand.textContent).toBe('GreenTask');
    expect(container.querySelectorAll('.greentask-brand')).toHaveLength(1);
    expect(container.querySelector('.shell-sidebar .greentask-brand')).toBeNull();
    expect(brand.querySelector('.greentask-brand--compact')).toBeNull();
    expect(container.querySelector('.shell-main header')).toBeNull();
    expect(container.querySelector('.shell-brand-badge')).toBeNull();
    expect(container.querySelector('.shell-brand .greentask-brand__subtitle')).toBeNull();
    act(() => container.querySelector('[aria-label="Collapse sidebar"]').click());
    render();
    expect(container.querySelector('.shell-sidebar-collapsed')).not.toBeNull();
    expect(container.querySelector('header .shell-header-brand').textContent).toBe('GreenTask');
    expect(container.querySelector('header .shell-header-brand img')).toBeNull();
    act(() => container.querySelector('[aria-label="Expand sidebar"]').click());
    render();
    expect(container.querySelector('.shell-sidebar-collapsed')).toBeNull();
    expect(container.querySelector('header .shell-header-brand')).toBe(brand);
  } finally { act(() => root.unmount()); container.remove(); }
});
