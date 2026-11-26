import React, { useEffect, useState } from 'react';
import { taskExtras } from '../../services/api';
import UserAvatar from '../account/UserAvatar';

const FIELD = {
  status: 'Status', priority: 'Priority', assigned_to: 'Assignee', due_date: 'Due date', start_date: 'Start date', assigned_date: 'Assigned date',
  title: 'Title', description: 'Description', client_name: 'Client', agent_firm_id: 'Agent', task_type: 'Task type', product: 'Product', category: 'Category',
  blocked_reason: 'Blocked by', review: 'Review', severity: 'Severity', custom_fields: 'Form answers', sent_back: 'Sent back because', picture: 'Picture', team: 'Team',
};
const STATUS = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };
const LONG = new Set(['description', 'custom_fields']);

export function ago(value, now = Date.now()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.round((now - d.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function show(key, value, people) {
  if (value === null || value === undefined || value === '') return 'None';
  if (key === 'status') return STATUS[value] || value;
  if (key === 'assigned_to') return people[String(value)] || `Person #${value}`;
  if (/_date$/.test(key)) return String(value).slice(0, 10);
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

// Activity → History: who changed what and when, with the old and new value.
export default function TaskHistory({ taskId, members = [] }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setRows(null); setError('');
    Promise.resolve().then(() => taskExtras.history(taskId))
      .then(({ data }) => { if (alive) setRows(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) { setRows([]); setError('Could not load the history.'); } });
    return () => { alive = false; };
  }, [taskId]);
  const people = Object.fromEntries(members.map((m) => [String(m.id), m.name]));

  if (rows === null) return <p role="status" className="py-4 text-sm text-muted">Loading history…</p>;
  if (error) return <p role="alert" className="py-4 text-sm text-danger">{error}</p>;
  if (!rows.length) return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No changes recorded yet.</p>;
  return (
    <ol className="flex flex-col">
      {rows.map((row) => {
        const changes = Object.entries(row.changes || {}).filter(([, v]) => v && typeof v === 'object' && 'before' in v);
        return (
          <li key={row.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
            <UserAvatar name={row.user_name} src={row.avatar} size="h-8 w-8 text-[11px]" />
            <div className="min-w-0 flex-1 text-sm">
              <p><span className="font-semibold">{row.user_name}</span> <span className="text-muted">{String(row.activity || 'updated the task').toLowerCase()}</span> <span className="text-xs text-muted">· {ago(row.created_at)}</span></p>
              {changes.map(([key, v]) => (
                <p key={key} className="mt-1 text-sm">
                  <span className="text-muted">{FIELD[key] || key.replace(/_/g, ' ')}: </span>
                  {LONG.has(key) ? <span>changed</span> : <><span className="text-muted line-through">{show(key, v.before, people)}</span> <span aria-hidden="true" className="text-muted">→</span> <span className="font-medium">{show(key, v.after, people)}</span></>}
                </p>
              ))}
              {row.note && !changes.length && <p className="mt-1 text-sm text-muted">{row.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
