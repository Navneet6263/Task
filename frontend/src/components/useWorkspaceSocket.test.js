import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import useWorkspaceSocket from './useWorkspaceSocket';

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.close = jest.fn(() => {
      if (this.readyState === FakeSocket.CONNECTING) throw new Error('Handshake aborted');
      this.readyState = FakeSocket.CLOSED;
      this.onclose?.();
    });
    FakeSocket.instances.push(this);
  }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  disconnect() { this.readyState = FakeSocket.CLOSED; this.onclose?.(); }
}

let container, root, options, originalSocket;
function Harness(props) { useWorkspaceSocket(props); return null; }
const render = (extra = {}) => act(() => root.render(
  <StrictMode><Harness {...options} {...extra} /></StrictMode>
));
const advance = milliseconds => act(() => jest.advanceTimersByTime(milliseconds));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  originalSocket = global.WebSocket;
  global.WebSocket = FakeSocket;
  FakeSocket.instances = [];
  localStorage.clear();
  localStorage.setItem('token', 'test-token');
  options = { wsRef: { current: null }, setSocketVersion: jest.fn(), fetchNotifications: jest.fn(), token: 'test-token', orgId: '4' };
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllTimers(); jest.useRealTimers();
  global.WebSocket = originalSocket;
  localStorage.clear();
});

test('StrictMode creates only one socket without aborting a handshake', () => {
  render();
  expect(FakeSocket.instances).toHaveLength(0);
  advance(0);
  expect(FakeSocket.instances).toHaveLength(1);
  const ws = FakeSocket.instances[0];
  expect(ws.close).not.toHaveBeenCalled();
  act(() => ws.open());
  expect(options.setSocketVersion).toHaveBeenCalledTimes(1);
  act(() => ws.onmessage({ data: JSON.stringify({ event: 'task_updated' }) }));
  expect(options.fetchNotifications).toHaveBeenCalledTimes(1);
});

test('unmount during handshake closes only after open and never reconnects', () => {
  render(); advance(0);
  const ws = FakeSocket.instances[0];
  act(() => root.render(null));
  expect(options.wsRef.current).toBeNull();
  expect(ws.close).not.toHaveBeenCalled();
  act(() => ws.open());
  expect(ws.close).toHaveBeenCalledTimes(1);
  expect(options.setSocketVersion).not.toHaveBeenCalled();
  advance(180000);
  expect(FakeSocket.instances).toHaveLength(1);
});

test('disconnect retries with backoff but unmount cancels the retry', () => {
  render(); advance(0);
  act(() => { FakeSocket.instances[0].open(); FakeSocket.instances[0].disconnect(); });
  advance(4999);
  expect(FakeSocket.instances).toHaveLength(1);
  advance(1);
  expect(FakeSocket.instances).toHaveLength(2);
  act(() => FakeSocket.instances[1].disconnect());
  act(() => root.render(null));
  advance(180000);
  expect(FakeSocket.instances).toHaveLength(2);
});

test('changing organization retires the old socket without touching the new one', () => {
  render(); advance(0);
  const oldSocket = FakeSocket.instances[0];
  render({ orgId: '5' }); advance(0);
  const newSocket = FakeSocket.instances[1];
  expect(new URL(newSocket.url).searchParams.get('orgId')).toBe('5');
  act(() => oldSocket.open());
  expect(oldSocket.close).toHaveBeenCalledTimes(1);
  expect(options.wsRef.current).toBe(newSocket);
  act(() => newSocket.open());
  act(() => root.render(null));
  expect(newSocket.close).toHaveBeenCalledTimes(1);
});

test('does not reconnect after logout', () => {
  render(); advance(0);
  act(() => FakeSocket.instances[0].disconnect());
  localStorage.removeItem('token');
  advance(5000);
  expect(FakeSocket.instances).toHaveLength(1);
});
