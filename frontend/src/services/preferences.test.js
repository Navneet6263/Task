import { clearAuthentication, readPreference, writePreference } from './preferences';
import { csvCell } from './exportCsv';
import { cachedGet, clearQueryCache } from './queryCache';
beforeEach(() => { localStorage.clear(); clearQueryCache(); localStorage.setItem('user', JSON.stringify({ id: 1, role: 'member' })); localStorage.setItem('active_org_id', '2'); });
test('logout preserves personal preferences but removes authentication', () => {
  localStorage.setItem('token', 'example'); writePreference('view', 'board');
  clearAuthentication(); expect(localStorage.getItem('token')).toBeNull();
  localStorage.setItem('user', JSON.stringify({ id: 1, role: 'member' })); localStorage.setItem('active_org_id', '2');
  expect(readPreference('view', 'list')).toBe('board');
});
test('preferences are isolated by user and organization', () => {
  writePreference('view', 'board'); localStorage.setItem('active_org_id', '3'); expect(readPreference('view', 'list')).toBe('list');
  localStorage.setItem('active_org_id', '2'); localStorage.setItem('user', JSON.stringify({ id: 2, role: 'member' }));
  expect(readPreference('view', 'list')).toBe('list');
});
test('concurrent lookup requests share a promise but not across organizations', async () => {
  const api = { get: jest.fn().mockResolvedValue({ data: [] }) };
  await Promise.all([cachedGet(api, '/clients'), cachedGet(api, '/clients')]); expect(api.get).toHaveBeenCalledTimes(1);
  localStorage.setItem('active_org_id', '3'); await cachedGet(api, '/clients'); expect(api.get).toHaveBeenCalledTimes(2);
});
test('CSV escapes quotes and formula injection', () => {
  expect(csvCell('A,"B"')).toBe('"A,""B"""'); expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
});
