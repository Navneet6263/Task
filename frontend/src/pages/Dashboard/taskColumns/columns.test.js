import { COLUMNS, defaultLayout, moveColumn, normalizeLayout, presetLayout } from './columns';

const visibleIds = (layout) => layout.filter((entry) => entry.visible).map((entry) => entry.id);

test('default layout shows the core columns and honours the old "show created" setting', () => {
  expect(visibleIds(defaultLayout())).toEqual(['task', 'type', 'assignee', 'due', 'priority', 'status']);
  expect(visibleIds(defaultLayout(true))).toEqual(expect.arrayContaining(['createdBy', 'createdAt']));
  expect(defaultLayout()).toHaveLength(COLUMNS.length);
});

test('moving a column reorders it, but the pinned Task column never moves', () => {
  const layout = defaultLayout();
  const moved = moveColumn(layout, 'status', 'type');
  expect(moved.map((entry) => entry.id).slice(0, 4)).toEqual(['task', 'status', 'type', 'assignee']);
  expect(moveColumn(layout, 'status', 'task')).toBe(layout);
  expect(moveColumn(layout, 'task', 'due')).toBe(layout);
});

test('saved layouts survive new releases: unknown ids dropped, new columns appended, Task kept first and visible', () => {
  const saved = [{ id: 'due', visible: true }, { id: 'gone', visible: true }, { id: 'task', visible: false }, { id: 'status', visible: false }];
  const result = normalizeLayout(saved, defaultLayout());
  expect(result[0]).toEqual({ id: 'task', visible: true });
  expect(result.map((entry) => entry.id)).not.toContain('gone');
  expect(result).toHaveLength(COLUMNS.length);
  expect(result.find((entry) => entry.id === 'status').visible).toBe(false);
  expect(normalizeLayout('broken', defaultLayout())).toEqual(defaultLayout());
});

test('presets change which columns show without losing the user order', () => {
  const custom = moveColumn(defaultLayout(), 'status', 'type');
  const compact = presetLayout('Compact', custom);
  expect(visibleIds(compact)).toEqual(['task', 'status', 'assignee', 'due']);
});
