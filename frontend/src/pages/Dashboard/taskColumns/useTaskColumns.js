import { useCallback, useMemo, useState } from 'react';
import { readPreference, writePreference } from '../../../services/preferences';
import { COLUMN_BY_ID, defaultLayout, moveColumn, normalizeLayout, presetLayout } from './columns';

const KEY = 'task-columns';

// The user's column layout for the task list, saved per user and organization.
export default function useTaskColumns() {
  const fallback = useMemo(() => defaultLayout(readPreference('columns-created', false)), []);
  const [layout, setLayout] = useState(() => normalizeLayout(readPreference(KEY, null), fallback));

  const commit = useCallback((next) => { setLayout(next); writePreference(KEY, next); }, []);
  const toggle = useCallback((id) => {
    if (COLUMN_BY_ID[id].pinned) return;
    setLayout((current) => { const next = current.map((entry) => (entry.id === id ? { ...entry, visible: !entry.visible } : entry)); writePreference(KEY, next); return next; });
  }, []);
  const move = useCallback((fromId, toId) => {
    setLayout((current) => { const next = moveColumn(current, fromId, toId); if (next !== current) writePreference(KEY, next); return next; });
  }, []);
  const applyPreset = useCallback((name) => setLayout((current) => { const next = presetLayout(name, current); writePreference(KEY, next); return next; }), []);
  const reset = useCallback(() => commit(defaultLayout()), [commit]);

  const visibleColumns = useMemo(() => layout.filter((entry) => entry.visible).map((entry) => COLUMN_BY_ID[entry.id]), [layout]);
  return { layout, visibleColumns, toggle, move, applyPreset, reset };
}
