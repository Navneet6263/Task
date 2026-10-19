import React, { useEffect, useState } from 'react';
import { timesheet } from '../../services/api';
import { StatusChip, cls, fmtDate, fmtHours, errorOf } from './shared';

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
        <label className={cls.label}>Client
          <select className={`${cls.input} mt-1 min-w-[180px]`} value={filters.client_id} onChange={(event) => setFilter('client_id', event.target.value)}>
            <option value="">All clients</option>
            {config.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className={cls.label}>Status
          <select className={`${cls.input} mt-1 min-w-[150px]`} value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">All</option><option value="OPEN">Editable</option><option value="LOCKED">Locked</option><option value="DRAFT">Draft</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={filters.mine} onChange={(event) => setFilter('mine', event.target.checked)} /> Only entries I worked on
        </label>
      </div>
      {error && <p role="alert" className="text-red-700">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
      <div className={`${cls.card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr>
            <th className={cls.th}>Date worked</th><th className={cls.th}>Client</th><th className={cls.th}>Job / Work type</th>
            <th className={cls.th}>Period ended</th><th className={cls.th}>Agent</th><th className={`${cls.th} text-right`}>Hours</th><th className={cls.th}>Status</th>
          </tr></thead>
          <tbody>
            {!result && !error && <tr><td colSpan={7} className="p-6 text-center text-slate-500" role="status">Loading entries...</td></tr>}
            {result?.data.map((entry) => (
              <tr key={entry.id} tabIndex={0} className="cursor-pointer border-t hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                onClick={() => onOpen(entry.id)} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(entry.id); }}>
                <td className={`${cls.td} whitespace-nowrap tabular-nums`}>{fmtDate(entry.date_worked)}</td>
                <td className={`${cls.td} font-medium`}>{entry.client_name}</td>
                <td className={cls.td}>{entry.job_type || '—'}<div className="text-xs text-slate-500">{entry.work_type}</div></td>
                <td className={`${cls.td} whitespace-nowrap tabular-nums`}>{fmtDate(entry.period_ended)}<div className="text-xs text-slate-500">{entry.period_type}</div></td>
                <td className={cls.td}>{entry.agent_name || '—'}{entry.people_count > 1 && <div className="text-xs text-slate-500">+{entry.people_count - 1} more logged time</div>}</td>
                <td className={`${cls.td} text-right font-semibold tabular-nums`}>{fmtHours(entry.total_hours)}</td>
                <td className={cls.td}><StatusChip entry={entry} /></td>
              </tr>
            ))}
            {result && !result.data.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No entries match these filters. Use <b>+ Add Timesheet</b> to create one.</td></tr>}
          </tbody>
        </table>
      </div>
      {result && pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" className={cls.small} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className={cls.small} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
