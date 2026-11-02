import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, ClickRow, EmptyRow, ErrorText, Field, Input, Segmented, Select, StatTile, Table, TableWrap, Td, Th } from '../../../ui';
import { errorOf, fmtDate, fmtHours } from '../format';
import { defaultScope, PERIODS, periodRange, scopeOptions, teamPeople } from '../team';
import StatusChip from './StatusChip';
import { exportEntries } from './exportEntries';

const SORTS = [['date_desc', 'Newest first'], ['date_asc', 'Oldest first'], ['hours_desc', 'Most hours'], ['client', 'Client A–Z'], ['person', 'Done by A–Z']];
const STORAGE_KEY = 'timesheet_entries_scope';
const savedScope = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };
const blank = { client_id: '', agent_firm_id: '', agent_id: '', status: '', period: '', from: '', to: '' };

export default function EntriesTab({ config, refreshKey, onOpen, preset }) {
  const isLead = Boolean(config.permissions?.view_reports);
  const options = useMemo(() => scopeOptions(config), [config]);
  const [scope, setScopeState] = useState(() => {
    if (preset?.scope) return preset.scope;
    const saved = savedScope();
    return options.some(([key]) => key === saved) ? saved : defaultScope(config);
  });
  const [filters, setFilters] = useState({ ...blank, ...(preset?.filters || {}) });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setQuery(search.trim()); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const range = filters.period === 'custom' ? { from: filters.from, to: filters.to } : periodRange(filters.period, config.today);
  const params = useMemo(() => ({
    client_id: filters.client_id || undefined,
    agent_firm_id: filters.agent_firm_id || undefined,
    agent_id: filters.agent_id || undefined,
    status: filters.status || undefined,
    from: range.from || undefined,
    to: range.to || undefined,
    q: query || undefined,
    sort,
    scope: isLead && scope === 'team' ? 'team' : undefined,
    mine: isLead && scope === 'mine' ? 'true' : undefined,
  }), [filters.client_id, filters.agent_firm_id, filters.agent_id, filters.status, range.from, range.to, query, sort, scope, isLead]);

  useEffect(() => {
    let active = true;
    setError('');
    timesheet.entries({ ...params, page })
      .then((response) => { if (active) setResult(response.data); })
      .catch((err) => { if (active) setError(errorOf(err, 'Could not load entries.')); });
    return () => { active = false; };
  }, [params, page, refreshKey, retry]);

  const setFilter = (key, value) => { setPage(1); setFilters((prev) => ({ ...prev, [key]: value })); };
  const setScope = (next) => {
    setPage(1); setScopeState(next);
    setFilters((prev) => ({ ...prev, agent_id: '' }));
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* only a convenience */ }
  };
  const clearAll = () => { setPage(1); setFilters(blank); setSearch(''); setQuery(''); setSort('date_desc'); };

  const people = scope === 'team' ? teamPeople(config) : config.users || [];
  const pages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;
  const filtered = Boolean(query || Object.values(filters).some(Boolean));
  const summary = result?.summary;

  const download = async () => {
    setExporting(true);
    try {
      const { data } = await timesheet.entries({ ...params, all: 'true' });
      await exportEntries({ rows: data.data, config, range, scope: options.find(([key]) => key === scope)?.[1] });
      notify(data.total > data.data.length ? `Excel downloaded with the first ${data.data.length} of ${data.total} entries. Narrow the filters to get the rest.` : 'Excel downloaded.', 'success');
    } catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isLead
          ? <Segmented label="Whose entries" options={options} value={scope} onChange={setScope} />
          : <p className="text-sm text-muted">You see only your own entries.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Search entries" className="!w-56" placeholder="Search client, task, job…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button disabled={exporting || !result?.total} onClick={download}>{exporting ? 'Preparing…' : 'Download Excel'}</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
        <Field label="When" htmlFor="ts-filter-period">
          <Select id="ts-filter-period" className="min-w-[140px]" value={filters.period} onChange={(event) => setFilter('period', event.target.value)}>
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
        {filters.period === 'custom' && <>
          <Field label="From" htmlFor="ts-filter-from"><Input id="ts-filter-from" type="date" max={filters.to || undefined} value={filters.from} onChange={(event) => setFilter('from', event.target.value)} /></Field>
          <Field label="To" htmlFor="ts-filter-to"><Input id="ts-filter-to" type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => setFilter('to', event.target.value)} /></Field>
        </>}
        {isLead && scope !== 'mine' && (
          <Field label="Done by" htmlFor="ts-filter-person">
            <Select id="ts-filter-person" className="min-w-[170px]" value={filters.agent_id} onChange={(event) => setFilter('agent_id', event.target.value)}>
              <option value="">{scope === 'team' ? 'Everyone in my team' : 'Everyone'}</option>
              {people.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </Field>
        )}
        {(config.agents || []).length > 0 && (
          <Field label="Agent" htmlFor="ts-filter-agent">
            <Select id="ts-filter-agent" className="min-w-[160px]" value={filters.agent_firm_id} onChange={(event) => setFilter('agent_firm_id', event.target.value)}>
              <option value="">All agents</option>
              {config.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Client" htmlFor="ts-filter-client">
          <Select id="ts-filter-client" className="min-w-[170px]" value={filters.client_id} onChange={(event) => setFilter('client_id', event.target.value)}>
            <option value="">All clients</option>
            {config.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="ts-filter-status">
          <Select id="ts-filter-status" className="min-w-[120px]" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">All</option><option value="OPEN">Editable</option><option value="LOCKED">Locked</option><option value="DRAFT">Draft</option>
          </Select>
        </Field>
        <Field label="Sort by" htmlFor="ts-filter-sort">
          <Select id="ts-filter-sort" className="min-w-[130px]" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}>
            {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
        {filtered && <Button variant="ghost" onClick={clearAll}>Clear filters</Button>}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Hours" value={fmtHours(summary.hours)} />
          <StatTile label="Entries" value={summary.entries} />
          <StatTile label="People" value={summary.people} />
          <StatTile label="Drafts" value={summary.drafts} />
          <StatTile label="Locked" value={summary.locked} />
        </div>
      )}

      <ErrorText onRetry={() => setRetry((value) => value + 1)}>{error}</ErrorText>
      <TableWrap>
        <Table>
          <thead><tr>
            <Th>Date worked</Th><Th>Client</Th><Th>Job / Work type</Th><Th>Period ended</Th><Th>Done by</Th><Th align="right">Hours</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {!result && !error && <EmptyRow colSpan={7}><span role="status">Loading entries...</span></EmptyRow>}
            {result?.data.map((entry) => (
              <ClickRow key={entry.id} onOpen={() => onOpen(entry.id)}>
                <Td mono className="whitespace-nowrap">{fmtDate(entry.date_worked)}</Td>
                <Td className="font-semibold">
                  {entry.client_name}
                  {entry.agent_firm_name && <div className="text-xs font-normal text-muted">{entry.agent_firm_name}</div>}
                  {entry.task_title && <div className="max-w-[220px] truncate text-xs font-normal text-muted" title={entry.task_title}>Task #{entry.task_id} · {entry.task_title}</div>}
                </Td>
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
