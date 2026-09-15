import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import UpdatesDialog from './UpdatesDialog';
import ReportProblem from './ReportProblem';
import PrivateReports from './PrivateReports';
import UpdatesButton from './UpdatesButton';
import { groupUpdatesByDate } from './updateDates';
import { updatesApi } from './updatesApi';

jest.mock('./updatesApi', () => ({
  updatesApi: Object.fromEntries(['summary', 'list', 'publish', 'edit', 'read', 'assignees', 'report', 'reports', 'saveReport'].map(key => [key, jest.fn()])),
  changed: jest.fn(), dateTime: () => '8 Sep 2026, 10:30 am', errorText: error => error.message,
}));
const release = { id: 7, version: 2, title: 'Saved views', summary: 'Save your filters', why_text: 'Find your work quickly', how_text: 'Choose filters and Save current view', performance_text: '', published_at: '2026-09-08T05:00:00Z', is_read: 0 };
let container, root;
const render = async node => act(async () => { root.render(node); });
const click = async text => act(async () => {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(text));
  if (!button) throw Error(`Button missing: ${text}`);
  button.click();
});
function change(node, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set;
  setter.call(node, value);
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  updatesApi.list.mockResolvedValue({ data: { data: [release], total: 1, can_publish: false } });
  updatesApi.read.mockResolvedValue({ data: {} });
  updatesApi.summary.mockResolvedValue({ data: { unread: 2, reports: 0 } });
  updatesApi.reports.mockResolvedValue({ data: { data: [], total: 0 } });
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => 'report-request-test-12345' } });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

test('employee sees dated guides and report action, but never publish/edit controls', async () => {
  const close = jest.fn(); await render(<UpdatesDialog onClose={close} />);
  expect(document.body.textContent).toContain('8 Sep 2026, 10:30 am');
  expect(document.body.textContent).not.toContain('Publish update');
  expect(document.body.textContent).not.toContain('Edit update');
  await click('Read guide');
  expect(document.body.textContent).toContain(release.how_text);
  expect(updatesApi.read).toHaveBeenCalledWith(7, 2);
  expect(document.body.textContent).not.toContain('NEW / UNREAD');
  expect(document.body.textContent).toContain('Report a problem');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(close).toHaveBeenCalled();
});

test('admin can publish a reviewed starting template without auto-publishing on open', async () => {
  updatesApi.list.mockResolvedValue({ data: { data: [], total: 0, can_publish: true } });
  updatesApi.publish.mockResolvedValue({ data: { id: 8 } });
  await render(<UpdatesDialog onClose={() => {}} />);
  await click('Publish update');
  expect(updatesApi.publish).not.toHaveBeenCalled();
  act(() => change(document.querySelector('.updates-form select'), 'saved'));
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(updatesApi.publish).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('Saved views'), how_text: expect.stringContaining('personal'), performance_text: '' }));
  expect(document.body.textContent).toContain('Update published');
});

test('admin editing submits the viewed version for conflict protection', async () => {
  updatesApi.list.mockResolvedValue({ data: { data: [{ ...release, can_edit: true }], total: 1, can_publish: true } });
  updatesApi.edit.mockRejectedValue(new Error('Update changed. Refresh before editing.'));
  await render(<UpdatesDialog onClose={() => {}} />);
  await click('Edit update');
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(updatesApi.edit).toHaveBeenCalledWith(7, expect.objectContaining({ version: 2 }));
  expect(document.querySelector('[role="alert"]').textContent).toContain('Refresh before editing');
  expect(document.querySelector('input').value).toBe('Saved views');
});

test('report requires explicit assignee and preserves draft plus receipt key across a failed retry', async () => {
  jest.useFakeTimers();
  updatesApi.assignees.mockResolvedValue({ data: [{ id: 20, name: 'Navneet', role: 'admin' }] });
  updatesApi.report.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ data: { id: 45 } });
  const sent = jest.fn();
  await render(<ReportProblem update={release} onSent={sent} onBusy={() => {}} />);
  await act(async () => jest.advanceTimersByTime(300));
  expect(container.querySelector('.updates-primary').disabled).toBe(true);
  await click('Navneet');
  act(() => change(container.querySelector('textarea'), 'Save did not work'));
  const submit = () => act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await submit();
  expect(container.querySelector('textarea').value).toBe('Save did not work');
  expect(container.textContent).toContain('Network unavailable');
  await submit();
  expect(updatesApi.report).toHaveBeenLastCalledWith(expect.objectContaining({ update_id: 7, update_version: 2, assigned_to: 20, request_key: 'report-request-test-12345' }));
  expect(updatesApi.report.mock.calls[0][0].request_key).toBe(updatesApi.report.mock.calls[1][0].request_key);
  expect(sent).toHaveBeenCalledWith(expect.stringContaining('Only this assignee'));
});

test('private queue saves status and resolution with version, not ownership', async () => {
  updatesApi.reports.mockResolvedValue({ data: { total: 1, data: [{ id: 45, version: 3, title: 'Private issue', priority: 'HIGH', status: 'TODO', resolution_note: '', description: 'Broken', steps: '', reporter_name: 'Employee', update_title: 'Saved views', update_version: 2 }] } });
  updatesApi.saveReport.mockResolvedValue({ data: { version: 4 } });
  await render(<PrivateReports />);
  act(() => { change(container.querySelector('form select'), 'DONE'); change(container.querySelector('textarea'), 'Fixed and checked'); });
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(updatesApi.saveReport).toHaveBeenCalledWith(45, { status: 'DONE', resolution_note: 'Fixed and checked', version: 3 });
});

test('feed failure has an actionable retry, not a false empty result', async () => {
  updatesApi.list.mockRejectedValueOnce(new Error('Updates unavailable'));
  await render(<UpdatesDialog onClose={() => {}} />);
  expect(document.querySelector('[role="alert"]').textContent).toContain('Updates unavailable');
  expect(document.body.textContent).not.toContain('No updates published');
  await click('Retry');
  expect(document.body.textContent).toContain('Saved views');
});

test('header Updates is a safe native new-tab link instead of a modal button', async () => {
  await render(<UpdatesButton />);
  const link = container.querySelector('a');
  expect(link.getAttribute('href')).toBe('/updates');
  expect(link.target).toBe('_blank');
  expect(link.rel).toContain('noopener');
  expect(link.getAttribute('aria-label')).toContain('new tab');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('full page groups releases by date without locking document scrolling', async () => {
  updatesApi.list.mockResolvedValue({ data: { data: [release, { ...release, id: 8, published_at: '2026-08-26T05:00:00Z' }], total: 2, can_publish: false } });
  const overflow = document.body.style.overflow;
  await render(<UpdatesDialog fullPage />);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="Close updates"]')).toBeNull();
  expect(container.querySelectorAll('.updates-day')).toHaveLength(2);
  expect(container.querySelector('.updates-day-heading').textContent).toContain('8 September 2026');
  expect(document.body.style.overflow).toBe(overflow);
});

test('date groups sort newest first and preserve deterministic within-day order', () => {
  const rows = [{ id: 1, published_at: '2026-08-26T05:00:00Z' }, { id: 2, published_at: '2026-09-08T05:00:00Z' }, { id: 3, published_at: '2026-09-08T05:00:00Z' }];
  const groups = groupUpdatesByDate(rows);
  expect(groups.map(group => group.updates.map(row => row.id))).toEqual([[3, 2], [1]]);
  expect(rows[0].id).toBe(1);
});
