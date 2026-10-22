import React from 'react';
import { Button, Chip } from '../../ui';
import { dateLabel, val } from './TaskDetailFields';
import { PRIORITY_TONE, STATUS_TONE, statusLabel } from './tones';

export const ISSUE_TONE = { bug: 'danger', story: 'info', feature: 'ok', enhancement: 'warn' };

// Left column of the task dialog: what the task is, who owns it, and delete actions.
export default function TaskDetailSummary({ task: t, type, isCreator, handleDelete, handleApproveDelete, handleRejectDelete }) {
  const facts = [
    ['Assignee', t.assigned_to_name || 'Unassigned'], ['Due Date', dateLabel(t.due_date)],
    ['Start Date', dateLabel(t.start_date)], ['Client', val(t.client_name)],
  ];
  return (
    <div className="flex flex-col gap-4 overflow-y-auto border-r border-line bg-subtle px-6 py-6">
      <span className="w-fit rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted">TASK-{t.id}</span>
      <div className="flex flex-wrap items-center gap-1">
        <Chip tone={ISSUE_TONE[type] || 'neutral'}>{type.toUpperCase()}</Chip>
        {t.manager_assigned && <Chip tone="warn">MGR</Chip>}
        <Chip tone={PRIORITY_TONE[t.priority] || 'warn'}>{t.priority || 'MEDIUM'}</Chip>
        <Chip tone={STATUS_TONE[t.status] || 'neutral'}>{statusLabel(t.status)}</Chip>
      </div>
      <h2 className="m-0 text-xl font-bold leading-tight">{t.title}</h2>
      <p className="whitespace-pre-wrap text-sm text-muted">{t.description || 'No description provided.'}</p>
      <dl className="grid grid-cols-2 gap-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
            <dd className="truncate text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {t.reference_image && (
        <figure className="overflow-hidden rounded-md border border-line bg-surface">
          <figcaption className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Reference Image</figcaption>
          <img src={t.reference_image} alt="Task reference" className="block max-h-[200px] w-full object-cover" />
        </figure>
      )}
      {t.delete_requested_by ? (
        <div className="mt-auto flex flex-col gap-2 rounded-md border border-danger/30 bg-danger-soft p-3">
          <span className="text-center text-xs font-semibold text-danger">Delete requested by {t.delete_requested_by_name || 'User'}</span>
          {isCreator ? (
            <div className="flex gap-2">
              <Button size="sm" variant="danger" className="flex-1 !border-danger/40" onClick={() => handleApproveDelete(t.id)}>Approve</Button>
              <Button size="sm" className="flex-1" onClick={() => handleRejectDelete(t.id)}>Reject</Button>
            </div>
          ) : <span className="text-center text-[11px] text-danger">Pending approval...</span>}
        </div>
      ) : <Button variant="danger" className="mt-auto !border-danger/30" onClick={() => handleDelete(t.id)}>Delete Task</Button>}
    </div>
  );
}
