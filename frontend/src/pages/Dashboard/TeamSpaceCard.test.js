import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TeamSpaceCard from './TeamSpaceCard';
import PhotoNudge from '../../components/account/PhotoNudge';
import TeamPhoto from '../../components/shell/TeamPhoto';
import { SpaceAvatar } from '../../components/shell/spaces';
import { clampOffset, coverScale, cropRect } from '../../components/account/PhotoCropper';

const h = {};
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...a) => h.get(...a) },
  users: { me: (...a) => h.me(...a), uploadAvatar: (...a) => h.upload(...a) },
  teams: { uploadPhoto: (...a) => h.teamUpload(...a), removePhoto: (...a) => h.teamRemove(...a), getAll: async () => ({ data: [] }) },
}));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify?.(...a) }));
// The crop window needs a real browser to draw; here it simply hands back a cropped picture.
jest.mock('../../components/account/PhotoCropper', () => {
  const actual = jest.requireActual('../../components/account/PhotoCropper');
  return { __esModule: true, ...actual, default: ({ onDone, shape }) => <button type="button" onClick={() => onDone(`data:image/jpeg;base64,${shape || 'circle'}`)}>Save photo</button> };
});

const team = { id: 7, name: 'Payroll' };
const stats = { total: 40, todo: 10, inProgress: 5, pending: 2, done: 23, open: 17, overdue: 3 };
const crowd = (n) => [
  { id: 1, name: 'Asha Rao', current_tasks: 4, overdue_tasks: 0, avatar: '/api/users/avatar/abc' },
  { id: 2, name: 'Vikram Singh', current_tasks: 2, overdue_tasks: 2 },
  ...Array.from({ length: n - 2 }, (_, i) => ({ id: 10 + i, name: `Person ${i + 1}`, current_tasks: 1, overdue_tasks: 0 })),
];
let c, r, seen;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); c = document.createElement('div'); document.body.append(c); r = createRoot(c);
  h.get = jest.fn(async () => ({ data: { counts: { due_7d: 6, done_7d: 9 } } }));
});
afterEach(() => { act(() => r.unmount()); c.remove(); });
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
const button = (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
const pickFile = async (input) => {
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};

function Harness({ members }) {
  const [focusMode, setFocusMode] = useState('');
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterAssignee, setFilterAssignee] = useState([]);
  seen = { focusMode, filterStatus, filterAssignee };
  return <MemoryRouter><TeamSpaceCard team={team} stats={stats} members={members} filters={{ focusMode, setFocusMode, filterStatus, setFilterStatus, filterAssignee, setFilterAssignee }} /></MemoryRouter>;
}

test('the dashboard card shows the team at a glance, and its numbers filter the task list', async () => {
  await act(async () => r.render(<Harness members={crowd(12)} />));
  await flush();
  expect(h.get).toHaveBeenCalledWith('/teams/7/summary');
  expect(c.textContent).toContain('12 people · 40 tasks in all');
  expect(c.textContent).toContain('Due in 7 days6');
  expect(c.textContent).toContain('Done in 7 days9');
  expect(c.querySelector('a[href="/spaces/7"]').textContent).toBe('Open space');
  await act(async () => button('Open').click());
  expect(seen.filterStatus).toEqual(['TODO', 'IN_PROGRESS', 'PENDING']);
  await act(async () => button('Overdue').click());
  expect(seen).toMatchObject({ focusMode: 'OVERDUE', filterStatus: [] });
  await act(async () => button('Overdue').click());
  expect(seen.focusMode).toBe('');
});

test('people scroll sideways and more are drawn as the row is scrolled; clicking a face shows their work', async () => {
  // Like a browser: the row is 300 px wide and grows 112 px for every face drawn in it.
  const sizes = { clientWidth: () => 300, scrollWidth: (el) => el.querySelectorAll('li').length * 112 };
  const saved = Object.keys(sizes).map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)]);
  Object.keys(sizes).forEach((k) => Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get() { return sizes[k](this); } }));
  try {
    await act(async () => r.render(<Harness members={crowd(30)} />));
    await flush();
    const faces = () => [...c.querySelectorAll('[title^="Show "][title$="’s work"]')];
    expect(faces()).toHaveLength(12);
    expect(faces()[0].textContent).toBe('VSVikram2 open2 late');
    expect(c.querySelector('[aria-label="More people"]')).toBeTruthy();
    expect(c.querySelector('[aria-label="Earlier people"]')).toBeNull();
    const row = c.querySelector('[aria-label="Team members"]');
    row.scrollLeft = 12 * 112 - 300 - 50; // close to the end of the first twelve
    await act(async () => { row.dispatchEvent(new Event('scroll')); });
    expect(faces()).toHaveLength(24);
    expect(c.querySelector('[aria-label="Earlier people"]')).toBeTruthy();
    await act(async () => faces()[1].click());
    expect(seen.filterAssignee).toEqual(['1']);
    expect(c.textContent).toContain('Showing Asha Rao’s work.');
    await act(async () => button('Show everyone').click());
    expect(seen.filterAssignee).toEqual([]);
    expect(c.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  } finally {
    saved.forEach(([k, d]) => (d ? Object.defineProperty(HTMLElement.prototype, k, d) : delete HTMLElement.prototype[k]));
  }
});

test('the crop window keeps exactly what is inside the frame, and never leaves empty edges', () => {
  // A 1000 x 500 picture in a 250 px frame: it is scaled to cover the frame (height 250).
  expect(coverScale(1000, 500, 250)).toBe(0.5);
  expect(cropRect({ w: 1000, h: 500, frame: 250, zoom: 1, x: 0, y: 0 })).toEqual({ sx: 250, sy: 0, side: 500 });
  // Zoom 2 in the middle keeps the centre 250 px of the picture.
  expect(cropRect({ w: 1000, h: 500, frame: 250, zoom: 2, x: 0, y: 0 })).toEqual({ sx: 375, sy: 125, side: 250 });
  // Dragged all the way right shows the left edge; dragging further is held back.
  expect(clampOffset({ w: 1000, h: 500, frame: 250, zoom: 1, x: 999, y: 50 })).toEqual({ x: 125, y: 0 });
  expect(cropRect({ w: 1000, h: 500, frame: 250, zoom: 1, x: 125, y: 0 }).sx).toBe(0);
});

test('someone without a photo is asked to add one; they choose the part to keep, or put it off', async () => {
  h.me = jest.fn(async () => ({ data: { id: 5, name: 'Asha Rao', avatar: null } }));
  h.upload = jest.fn(async () => ({ data: { avatar: '/api/users/avatar/new' } }));
  await act(async () => r.render(<MemoryRouter initialEntries={['/dashboard']}><PhotoNudge /></MemoryRouter>));
  await flush();
  expect(c.textContent).toContain('Add your photo');
  await pickFile(c.querySelector('input[type="file"]'));
  // Nothing is saved until the crop window says so.
  expect(h.upload).not.toHaveBeenCalled();
  await act(async () => button('Save photo').click());
  await flush();
  expect(h.upload).toHaveBeenCalledWith('data:image/jpeg;base64,circle');
  expect(c.textContent).not.toContain('Add your photo');

  act(() => r.unmount()); r = createRoot(c);
  await act(async () => r.render(<MemoryRouter initialEntries={['/dashboard']}><PhotoNudge /></MemoryRouter>));
  await flush();
  await act(async () => [...c.querySelectorAll('button')].find((b) => b.textContent === 'Later').click());
  act(() => r.unmount()); r = createRoot(c);
  await act(async () => r.render(<MemoryRouter initialEntries={['/dashboard']}><PhotoNudge /></MemoryRouter>));
  await flush();
  expect(c.textContent).not.toContain('Add your photo');

  // A file that is not a picture is refused before anything opens.
  localStorage.clear(); h.notify = jest.fn();
  act(() => r.unmount()); r = createRoot(c);
  await act(async () => r.render(<MemoryRouter initialEntries={['/dashboard']}><PhotoNudge /></MemoryRouter>));
  await flush();
  const input = c.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'cv.pdf', { type: 'application/pdf' })] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(h.notify).toHaveBeenCalledWith('Choose a PNG, JPEG or WebP picture');
  expect(button('Save photo')).toBeUndefined();
});

test('a team photo is chosen and cropped square by admins and managers, and shows in place of the letters', async () => {
  h.teamUpload = jest.fn(async () => ({ data: { photo: '/api/teams/photo/x' } }));
  const onChanged = jest.fn();
  await act(async () => r.render(<TeamPhoto team={{ id: 9, name: "GreenHR Team's" }} canEdit onChanged={onChanged} />));
  expect(c.textContent).toContain('Add photo');
  await pickFile(c.querySelector('[aria-label="Team photo for GreenHR Team\'s"]'));
  await act(async () => button('Save photo').click());
  await flush();
  expect(h.teamUpload).toHaveBeenCalledWith(9, 'data:image/jpeg;base64,square');
  expect(onChanged).toHaveBeenCalled();
  // Members only see the picture.
  act(() => r.unmount()); r = createRoot(c);
  await act(async () => r.render(<TeamPhoto team={{ id: 9, name: 'GreenHR', photo: '/api/teams/photo/x' }} />));
  expect(c.querySelector('input')).toBeNull();
  expect(c.querySelector('img').getAttribute('src')).toBe('/api/teams/photo/x');
  act(() => r.unmount()); r = createRoot(c);
  await act(async () => r.render(<SpaceAvatar team={{ id: 9, name: 'GreenHR Team' }} />));
  expect(c.textContent).toBe('GT');
});
