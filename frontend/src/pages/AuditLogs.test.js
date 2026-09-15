import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AuditLogs from './AuditLogs';
import { buildActorOptions } from './auditActors';
import { logs, teams } from '../services/api';

jest.mock('../services/api', () => ({
  logs: { getByTeam: jest.fn() },
  teams: { getAll: jest.fn() },
}));

const actors = [
  { user_id: 20, user_name: 'Niraj', automated_by: 'Manual' },
  { user_id: '20', user_name: 'Niraj', automated_by: 'System' },
  { user_id: 22, user_name: 'Navneet', automated_by: 'Manual' },
  { user_id: 22, user_name: 'Navneet', automated_by: 'System' },
];

test('groups actors by filter identity while retaining their sources', () => {
  expect(buildActorOptions(actors)).toEqual([
    { key: 'u-20', name: 'Niraj', subtitle: 'Manual · System' },
    { key: 'u-22', name: 'Navneet', subtitle: 'Manual · System' },
  ]);
});

test('keeps different user IDs with the same name separate', () => {
  expect(buildActorOptions([
    { user_id: 20, user_name: 'Alex' },
    { user_id: 22, user_name: 'Alex' },
  ]).map(option => option.key)).toEqual(['u-20', 'u-22']);
});

test('deduplicates fallback name and automation identities too', () => {
  expect(buildActorOptions([
    { user_name: 'Former Member' }, { user_name: 'former member' },
    { automated_by: 'Bot' }, { automated_by: 'bot' }, {}, {},
  ]).map(option => option.key)).toEqual(['n-former member', 'a-bot', 'a-system']);
  expect(buildActorOptions()).toEqual([]);
});

test('renders one chip per user without key warnings and preserves logs and filtering', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }));
  teams.getAll.mockResolvedValue({ data: [{ id: 2, name: 'Test Team' }] });
  const data = actors.map((actor, index) => ({
    ...actor, id: index + 1, activity: 'Task Updated', description: `Event ${index + 1}`,
  }));
  logs.getByTeam.mockResolvedValue({ data: {
    data, actors, pagination: { page: 1, limit: 20, total: 4, total_pages: 1 },
  } });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const errorSpy = jest.spyOn(console, 'error');
  try {
    await act(async () => root.render(<AuditLogs />));
    const chips = () => [...container.querySelectorAll('.audit-member-chip')];
    expect(chips().map(chip => chip.querySelector('strong').textContent))
      .toEqual(['All Members', 'Niraj', 'Navneet']);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
    for (const [index, key] of [[1, 'u-20'], [2, 'u-22']]) {
      await act(async () => chips()[index].click());
      expect(logs.getByTeam).toHaveBeenLastCalledWith(2, 1, 20, key, 'all');
    }
    expect(errorSpy.mock.calls.filter(args => args.some(arg =>
      String(arg).includes('same key') || String(arg).includes('unique "key"')
    ))).toEqual([]);
  } finally {
    act(() => root.unmount());
    container.remove();
    errorSpy.mockRestore();
    localStorage.removeItem('user');
  }
});
