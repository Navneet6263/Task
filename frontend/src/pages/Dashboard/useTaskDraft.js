import { useEffect, useRef, useState } from 'react';
import { tasks } from '../../services/api';

export const changedFields = (original, draft) => Object.fromEntries(
  Object.entries(draft).filter(([key, value]) => key !== 'version' && value !== original[key])
);

export default function useTaskDraft(task, setSelectedTask, onSaved) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  useEffect(() => { setDraft(task); setError(''); setMessage(''); }, [task]);
  const changes = changedFields(task, draft);
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => {
    if (!dirty) return undefined;
    const preventLoss = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  const update = (field, value) => {
    setMessage('');
    setDraft(prev => ({ ...prev, [field]: field === 'assigned_to' ? (value ? Number(value) : null) : value,
      ...(field === 'task_type' ? { category: '' } : {}) }));
  };
  const save = async () => {
    if (busy.current || !dirty) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const response = await tasks.update(task.id, { ...changes, version: task.version });
      setSelectedTask(prev => prev?.id === task.id ? { ...draft, version: response.data.version } : prev);
      setMessage('Saved');
      onSaved?.();
    } catch (err) {
      setError(err.response?.status === 409
        ? 'Someone changed this task. Your draft is still here. Copy any text you need, then reload the latest task.'
        : err.response?.data?.error || 'Could not save. Your draft is preserved; please retry.');
    } finally { busy.current = false; setSaving(false); }
  };
  const reload = async () => {
    if (dirty && !window.confirm('Discard your unsaved edits and load the latest task?')) return;
    try { const response = await tasks.getDetail(task.id); setSelectedTask(response.data); }
    catch { setError('Could not reload. Please try again.'); }
  };
  const close = () => {
    if (saving) return;
    if (!dirty || window.confirm('Discard unsaved edits?')) setSelectedTask(null);
  };
  return { draft, dirty, saving, error, message, update, save, reload, close };
}
