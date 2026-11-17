import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ConversationView from './ConversationView';
import { fileProblem, sizeLabel, TOO_BIG } from './ChatAttachment';

const h = {};
jest.mock('../../services/api', () => ({
  chat: {
    messages: (...a) => h.messages(...a), markRead: async () => ({}), send: (...a) => h.send(...a),
    uploadFile: (...a) => h.upload(...a), downloadFile: (...a) => h.download(...a),
  },
}));
jest.mock('../../services/feedback', () => ({ notify: () => {} }));

const file = (name, size, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type });
let c, r;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c);
  h.messages = jest.fn(async () => ({ data: { messages: [{ id: 1, user_id: 11, user_name: 'Ashu Kumar', message: 'Here is the statement', created_at: new Date().toISOString(), thread_id: 5, attachment: { id: 31, file_name: 'Bank statement.pdf', mime: 'application/pdf', size: 245760 } }] } }));
});
afterEach(() => { act(() => r.unmount()); c.remove(); });
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
const choose = async (f) => {
  const input = c.querySelector('[aria-label="Choose a document"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [f] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};

test('files over 1 MB or of the wrong kind are refused before sending, with a clear reason', () => {
  expect(fileProblem(file('scan.pdf', 1024 * 1024 + 1))).toBe(TOO_BIG);
  expect(TOO_BIG).toBe('This file is over 1 MB. Please compress it first, then attach it again.');
  expect(fileProblem(file('setup.exe', 100))).toMatch(/cannot be sent/);
  expect(fileProblem(file('scan.pdf', 1024 * 1024))).toBe('');
  expect([sizeLabel(245760), sizeLabel(1572864)]).toEqual(['240 KB', '1.5 MB']);
});

test('a document is attached, uploaded and sent with the message; files in messages can be downloaded', async () => {
  h.upload = jest.fn(async () => ({ data: { id: 40, file_name: 'VAT return.pdf' } }));
  h.send = jest.fn(async (teamId, data) => ({ data: { id: 2, user_id: 10, user_name: 'You', message: data.message, created_at: new Date().toISOString(), thread_id: 5, client_temp_id: data.client_temp_id, attachment: { id: 40, file_name: 'VAT return.pdf', mime: 'application/pdf', size: 2048 } } }));
  h.download = jest.fn(async () => ({ data: new Blob(['%PDF']) }));
  global.URL.createObjectURL = jest.fn(() => 'blob:x'); global.URL.revokeObjectURL = jest.fn();
  await act(async () => r.render(<ConversationView teamId={2} thread={{ id: 5 }} selfId={10} onRead={() => {}} />));
  await flush();
  // A file already in the conversation.
  expect(c.textContent).toContain('Bank statement.pdf');
  expect(c.textContent).toContain('240 KB');
  await act(async () => c.querySelector('[aria-label="Download Bank statement.pdf"]').click());
  expect(h.download).toHaveBeenCalledWith(2, 31);
  // Too big: refused at once.
  await choose(file('scan.pdf', 2 * 1024 * 1024));
  expect(c.textContent).toContain('Please compress it first');
  expect(c.querySelector('[aria-label="Send"]').disabled).toBe(true);
  // A good file can be sent without text.
  await choose(file('VAT return.pdf', 2048));
  expect(c.textContent).not.toContain('Please compress it first');
  expect(c.textContent).toContain('VAT return.pdf');
  expect(c.querySelector('[aria-label="Send"]').disabled).toBe(false);
  await act(async () => c.querySelector('[aria-label="Send"]').click());
  await flush();
  expect(h.upload).toHaveBeenCalledWith(2, expect.any(File));
  expect(h.send).toHaveBeenCalledWith(2, expect.objectContaining({ message: '', thread_id: 5, attachment_id: 40 }));
  expect(c.querySelector('[aria-label="Remove the file"]')).toBeNull();
});
