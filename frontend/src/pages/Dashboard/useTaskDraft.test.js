import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import useTaskDraft from './useTaskDraft';
import { tasks } from '../../services/api';
jest.mock('../../services/api', () => ({ tasks: { update: jest.fn(), getDetail: jest.fn() } }));
let current, root, container;
function Harness() { const [task, setTask] = useState({ id: 8, title: 'Original', version: 3 }); current = useTaskDraft(task, setTask); return null; }
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); act(() => root.render(<Harness />)); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
test('typing stays local; save sends changed fields once and uses the returned version next time', async () => {
  act(() => { current.update('title', 'E'); current.update('title', 'Edited'); });
  expect(tasks.update).not.toHaveBeenCalled();
  tasks.update.mockResolvedValue({ data: { version: 4 } });
  await act(async () => { await current.save(); });
  expect(tasks.update).toHaveBeenCalledWith(8, { title: 'Edited', version: 3 });
  act(() => current.update('title', 'Again'));
  await act(async () => { await current.save(); });
  expect(tasks.update).toHaveBeenLastCalledWith(8, { title: 'Again', version: 4 });
});
test('conflicts preserve unsaved text and show a useful error', async () => {
  act(() => current.update('title', 'My unsaved text'));
  tasks.update.mockRejectedValue({ response: { status: 409 } });
  await act(async () => { await current.save(); });
  expect(current.draft.title).toBe('My unsaved text'); expect(current.dirty).toBe(true); expect(current.error).toMatch(/Someone changed/);
});
