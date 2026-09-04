import React, { useEffect, useState } from 'react';
import { tasks } from '../../services/api';
import './MessageTaskModal.css';

const initialForm = (message) => ({
  title: String(message?.message || '').replace(/\s+/g, ' ').trim().slice(0, 90),
  assigned_to: '',
  priority: 'MEDIUM',
  due_date: '',
  issue_type: 'task',
});

const MessageTaskModal = ({ message, team, thread, members, onClose, onCreated }) => {
  const [form, setForm] = useState(() => initialForm(message));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setForm(initialForm(message)), [message]);
  if (!message || !team) return null;

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const source = [
        `Created from Team Chat${message.id ? ` message #${message.id}` : ''}.`,
        `Conversation: ${thread?.display_title || thread?.title || 'General'}.`,
        `Message from ${message.user_name || 'a teammate'}:`,
        String(message.message || '').trim(),
      ].join('\n\n');
      await tasks.create({
        ...form,
        title: form.title.trim(),
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
        team_id: team.id,
        description: source,
      });
      onCreated?.();
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to create task');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="message-task-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="message-task-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="message-task-title">
        <header>
          <div><span>Chat to task</span><h2 id="message-task-title">Turn this message into work</h2></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <blockquote><strong>{message.user_name}</strong><p>{message.message}</p></blockquote>
        <label>Task title<input autoFocus maxLength={255} value={form.title} onChange={update('title')} required /></label>
        <div className="message-task-grid">
          <label>Assignee<select value={form.assigned_to} onChange={update('assigned_to')}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Priority<select value={form.priority} onChange={update('priority')}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
          <label>Type<select value={form.issue_type} onChange={update('issue_type')}><option value="task">Task</option><option value="bug">Bug</option><option value="story">Story</option><option value="feature">Feature</option><option value="enhancement">Enhancement</option></select></label>
          <label>Due date<input type="date" value={form.due_date} onChange={update('due_date')} /></label>
        </div>
        {error && <p className="message-task-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !form.title.trim()}>{busy ? 'Creating...' : 'Create task'}</button></footer>
      </form>
    </div>
  );
};

export default MessageTaskModal;
