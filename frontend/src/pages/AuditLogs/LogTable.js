import React from 'react';
import { Chip, EmptyRow, Table, TableWrap, Td, Th } from '../../ui';
import { actorKey } from '../auditActors';

const TONE = { 'Task Assigned': 'info', 'Task Completed': 'ok', 'Task Commented': 'warn', 'Overdue Alert': 'danger', 'Task Created': 'ok', 'Task Updated': 'neutral' };

const initials = (name) => {
  if (!name) return 'SY';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

export function relative(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} d ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export const exact = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB'); };

export default function LogTable({ rows, loading, canFilterActor, onActor }) {
  return (
    <TableWrap>
      <Table>
        <thead><tr><Th>Who</Th><Th>Activity</Th><Th>Task</Th><Th>Details</Th><Th>When</Th><Th>Source</Th></tr></thead>
        <tbody>
          {loading && <EmptyRow colSpan={6}><span role="status">Loading activity…</span></EmptyRow>}
          {!loading && rows.map((log) => (
            <tr key={log.id} className="hover:bg-subtle">
              <Td className="align-middle">
                <button type="button" disabled={!canFilterActor} onClick={() => onActor(actorKey(log))} title={canFilterActor ? 'Show only this person' : undefined}
                  className="flex items-center gap-2 text-left enabled:hover:text-accent">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${log.user_name ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>{initials(log.user_name)}</span>
                  <span className="whitespace-nowrap font-semibold">{log.user_name || 'System'}</span>
                </button>
              </Td>
              <Td className="align-middle"><Chip tone={TONE[log.activity] || 'neutral'}>{log.activity}</Chip></Td>
              <Td className="max-w-[260px] align-middle"><span className="line-clamp-2">{log.task_details || <span className="text-muted">—</span>}</span></Td>
              <Td className="max-w-[360px] align-middle text-muted"><span className="line-clamp-2">{log.description || '—'}</span></Td>
              <Td className="whitespace-nowrap align-middle" title={exact(log.created_at)}>{relative(log.created_at)}</Td>
              <Td className="align-middle">{log.automated_by ? <Chip tone={/manual/i.test(log.automated_by) ? 'neutral' : 'info'}>{log.automated_by}</Chip> : <span className="text-muted">—</span>}</Td>
            </tr>
          ))}
          {!loading && !rows.length && <EmptyRow colSpan={6}>No activity matches these filters.</EmptyRow>}
        </tbody>
      </Table>
    </TableWrap>
  );
}
