import React, { useCallback, useEffect, useState } from 'react';
import { logs } from '../../services/api';
import { Button, Chip, EmptyRow, ErrorText, Table, TableWrap, Td, Th } from '../../ui';

const TONE = { 'Task Completed': 'ok', 'Task Assigned': 'info', 'Overdue Alert': 'danger', 'Task Commented': 'warn' };
const when = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };

// Your own activity trail: the evidence behind the numbers.
export default function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await logs.getMy(page);
      setRows(Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : []);
      setPages(r.data.pagination?.total_pages || 1); setError('');
    } catch { setError('Could not load your activity.'); }
  }, [page]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="flex flex-col gap-3">
      <ErrorText onRetry={load}>{error}</ErrorText>
      <TableWrap>
        <Table>
          <thead><tr><Th>When</Th><Th>Activity</Th><Th>Task</Th><Th>Team</Th></tr></thead>
          <tbody>
            {rows.map((log) => (
              <tr key={log.id} className="hover:bg-subtle">
                <Td className="whitespace-nowrap text-muted">{when(log.created_at)}</Td>
                <Td><Chip tone={TONE[log.activity] || 'neutral'}>{log.activity}</Chip></Td>
                <Td className="max-w-[420px]"><span className="line-clamp-2">{log.task_details || '—'}</span></Td>
                <Td className="whitespace-nowrap text-muted">{log.team_name || '—'}</Td>
              </tr>
            ))}
            {!rows.length && !error && <EmptyRow colSpan={4}>No activity yet.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="font-mono text-xs text-muted">{page} / {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
