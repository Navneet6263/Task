import { arrange, threadName, upsert } from './quickChatUtils';
import { clearDraft, draftIds, readDraft, writeDraft } from '../notes/notesDraft';

test('the server copy replaces its optimistic twin instead of duplicating it', () => {
  const sending = [{ client_temp_id: 't1', message: 'hi', status: 'sending' }];
  const saved = upsert(sending, { id: 9, client_temp_id: 't1', message: 'hi', status: 'sent' });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: 9, status: 'sent' });
  expect(upsert(saved, { id: 10, message: 'new' })).toHaveLength(2);
});

test('messages are grouped by day and by runs from the same person', () => {
  const now = new Date();
  const at = (m) => new Date(now.getTime() + m * 60000).toISOString();
  const items = arrange([
    { id: 1, user_id: 1, created_at: at(0) }, { id: 2, user_id: 1, created_at: at(1) },
    { id: 3, user_id: 2, created_at: at(2) }, { id: 4, user_id: 2, created_at: at(20) },
  ]);
  expect(items[0]).toMatchObject({ type: 'day', label: 'Today' });
  expect(items.filter((i) => i.type === 'msg').map((i) => i.startsRun)).toEqual([true, false, true, true]);
});

test('direct conversations are named after the other person', () => {
  const members = [{ id: 1, name: 'Me' }, { id: 2, name: 'Asha' }];
  expect(threadName({ thread_type: 'direct', direct_user_one: 1, direct_user_two: 2 }, members, 1)).toBe('Asha');
  expect(threadName({ thread_type: 'group', is_default: true, title: 'x' }, members, 1)).toBe('General');
});

test('note drafts stay in this browser until cleared', () => {
  localStorage.clear();
  writeDraft(null, { title: 'Plan', body: 'Points' });
  writeDraft(7, { title: 'Edit', body: '' });
  expect(readDraft(null)).toMatchObject({ title: 'Plan' });
  expect(draftIds().sort()).toEqual(['7', 'new']);
  clearDraft(null);
  expect(readDraft(null)).toBeNull();
});
