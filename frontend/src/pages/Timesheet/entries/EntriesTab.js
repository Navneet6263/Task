import React, { useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { Button, ClickRow, EmptyRow, ErrorText, Field, Select, Table, TableWrap, Td, Th } from '../../../ui';
import { errorOf, fmtDate, fmtHours } from '../format';
import StatusChip from './StatusChip';

export default function EntriesTab({ config, refreshKey, onOpen }) {
  const [filters, setFilters] = useState({ client_id: '', status: '', mine: false });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    timesheet.entries({ ...filters, mine: filters.mine ? 'true' : undefined, page })
      .then((response) => { if (active) setResult(response.data); })
      .catch((err) => { if (active) setError(errorOf(err, 'Could not load entries.')); });
    return () => { active = false; };
  }, [filters, page, refreshKey, retry]);

  const setFilter = (key, value) => { setPage(1); setFilters((prev) => ({ ...prev, [key]: value })); };
  const pages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Client" htmlFor="ts-filter-client">
          <Select id="ts-filter-client" className="min-w-[190px]" value={filters.client_id} onChange={(event) => setFilter('client_id', event.target.value)}>
            <option value="">All clients</option>
            {config.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="ts-filter-status">
          <Select id="ts-filter-status" className="min-w-[150px]" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">All</option><option value="OPEN">Editable</option><option value="LOCKED">Locked</option><option value="DRAFT">Draft</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" className="accent-accent" checked={filters.mine} onChange={(event) => setFilter('mine', event.target.checked)} />
          Only entries I worked on
        </label>
      </div>
      <ErrorText onRetry={() => setRetry((value) => value + 1)}>{error}</ErrorText>
      <TableWrap>
        <Table>
          <thead><tr>
            <Th>Date worked</Th><Th>Client</Th><Th>Job / Work type</Th><Th>Period ended</Th><Th>Agent</Th><Th align="right">Hours</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {!result && !error && <EmptyRow colSpan={7}><span role="status">Loading entries...</span></EmptyRow>}
            {result?.data.map((entry) => (
              <ClickRow key={entry.id} onOpen={() => onOpen(entry.id)}>
                <Td mono className="whitespace-nowrap">{fmtDate(entry.date_worked)}</Td>
                <Td className="font-semibold">{entry.client_name}{entry.task_title && <div className="max-w-[220px] truncate text-xs font-normal text-muted" title={entry.task_title}>Task #{entry.task_id} · {entry.task_title}</div>}</Td>
                <Td>{entry.job_type || '—'}<div className="text-xs text-muted">{entry.work_type}</div></Td>
                <Td className="whitespace-nowrap"><span className="font-mono tabular-nums">{fmtDate(entry.period_ended)}</span><div className="text-xs text-muted">{entry.period_type}</div></Td>
                <Td>{entry.agent_name || '—'}{entry.people_count > 1 && <div className="text-xs text-muted">+{entry.people_count - 1} more logged time</div>}</Td>
                <Td align="right" mono className="font-semibold">{fmtHours(entry.total_hours)}</Td>
                <Td><StatusChip entry={entry} /></Td>
              </ClickRow>
            ))}
            {result && !result.data.length && <EmptyRow colSpan={7}>No entries match these filters. Use <b>+ Add Timesheet</b> to create one.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
      {result && pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-muted">Page {page} of {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
