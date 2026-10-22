import { useState } from 'react';
import { readConsolePref, writeConsolePref } from '../consoleUtils';

// Overview widgets: [key, title, what it shows, default size].
export const WIDGETS = [
  ['kpis', 'Key numbers', 'Companies, organizations, users and pending approvals', 'full'],
  ['queue', 'Approval queue', 'Companies waiting for a decision, oldest first', 'half'],
  ['status', 'Account status', 'Approved, pending and rejected companies', 'half'],
  ['growth', 'New companies', 'Registrations in each of the last six months', 'half'],
  ['top', 'Largest companies', 'Companies with the most users', 'half'],
  ['activity', 'Recent activity', 'The latest changes made by platform admins', 'full'],
];
const KEYS = WIDGETS.map(([key]) => key);
export const DEFAULT_LAYOUT = { order: KEYS, hidden: [], size: Object.fromEntries(WIDGETS.map(([key, , , size]) => [key, size])) };

// Keeps saved layouts valid when widgets are added or removed in a later release.
function normalize(saved) {
  const order = [...(saved?.order || []).filter((key) => KEYS.includes(key)), ...KEYS.filter((key) => !(saved?.order || []).includes(key))];
  return { order, hidden: (saved?.hidden || []).filter((key) => KEYS.includes(key)), size: { ...DEFAULT_LAYOUT.size, ...(saved?.size || {}) } };
}

export default function useOverviewLayout() {
  const [layout, setLayout] = useState(() => normalize(readConsolePref('overview-layout', DEFAULT_LAYOUT)));
  const save = (next) => { setLayout(next); writeConsolePref('overview-layout', next); };
  return {
    layout,
    toggle: (key) => save({ ...layout, hidden: layout.hidden.includes(key) ? layout.hidden.filter((k) => k !== key) : [...layout.hidden, key] }),
    resize: (key, size) => save({ ...layout, size: { ...layout.size, [key]: size } }),
    // `target` is a position, or another widget key: dragging down lands after it, dragging up lands before it.
    move: (key, target) => {
      const order = layout.order.filter((k) => k !== key);
      let index;
      if (typeof target === 'number') index = Math.max(0, Math.min(order.length, target));
      else index = order.indexOf(target) + (layout.order.indexOf(key) < layout.order.indexOf(target) ? 1 : 0);
      order.splice(index, 0, key);
      save({ ...layout, order });
    },
    reset: () => save(DEFAULT_LAYOUT),
  };
}
