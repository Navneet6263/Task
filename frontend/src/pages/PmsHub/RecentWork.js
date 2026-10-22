import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, EmptyRow, Table, TableWrap, Td, Th } from '../../ui';
import { fmtDays } from './insights';

const day = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');
const PRIORITY = { HIGH: 'danger', MEDIUM: 'warn', LOW: 'ok' };

// Every task you completed in the period, with how long it took.
export default function RecentWork({ tasks, typical }) {
  const navigate = useNavigate();
  return (
    <TableWrap>
      <Table>
        <thead><tr><Th>Task</Th><Th>Priority</Th><Th>Started</Th><Th>Completed</Th><Th align="right">Time taken</Th><Th>Due date</Th></tr></thead>
        <tbody>
          {tasks.map((t) => {
            const slow = typical && t.days_taken > typical * 2;
            return (
              <tr key={t.id} tabIndex={0} className="cursor-pointer hover:bg-subtle focus:bg-subtle focus:outline-none" onClick={() => navigate(`/dashboard?task=${t.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/dashboard?task=${t.id}`); }}>
                <Td className="align-middle"><span className="block max-w-[360px] truncate font-semibold">{t.title}</span><span className="text-xs text-muted">{t.team_name}</span></Td>
                <Td className="align-middle"><Chip tone={PRIORITY[t.priority] || 'neutral'}>{t.priority}</Chip></Td>
                <Td className="whitespace-nowrap align-middle text-muted">{day(t.start_date || t.assigned_date || t.created_at)}</Td>
                <Td className="whitespace-nowrap align-middle">{day(t.completed_at)}</Td>
                <Td align="right" mono className={`whitespace-nowrap align-middle ${slow ? 'font-semibold text-warn' : ''}`}>{fmtDays(t.days_taken)}</Td>
                <Td className="align-middle">{t.on_time === null ? <span className="text-xs text-muted">No due date</span> : t.on_time ? <Chip tone="ok">On time</Chip> : <Chip tone="warn">Late</Chip>}</Td>
              </tr>
            );
          })}
          {!tasks.length && <EmptyRow colSpan={6}>No completed tasks in this period.</EmptyRow>}
        </tbody>
      </Table>
    </TableWrap>
  );
}
