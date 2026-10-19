import React, { useState } from 'react';
import { timesheet } from '../../services/api';
import { exportCsv } from '../../services/exportCsv';
import { cls, fmtDate, fmtHours, errorOf } from './shared';

const CSV_COLUMNS = [
  { key: 'client_name', label: 'Client' }, { key: 'job_type', label: 'Job Type' }, { key: 'work_type', label: 'Work Type' },
  { key: 'period_type', label: 'Period Type' }, { key: 'period_ended', label: 'Period Ended' }, { key: 'user_name', label: 'Person' },
  { key: 'work_date', label: 'Date' }, { key: 'hours', label: 'Hours' }, { key: 'note', label: 'Note' },
];
const monthStart = (today) => `${today.slice(0, 8)}01`;

export default function ReportsTab({ config }) {
  const [filters, setFilters] = useState({ client_id: '', user_id: '', from: monthStart(config.today), to: config.today });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async (event) => {
    event?.preventDefault();
    setLoading(true); setError('');
    try { setReport((await timesheet.report({ ...filters, client_id: filters.client_id || undefined, user_id: filters.user_id || undefined })).data); }
    catch (err) { setError(errorOf(err, 'Could not load the report.')); setReport(null); }
    finally { setLoading(false); }
  };
  const set = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  const clientName = config.clients.find((client) => String(client.id) === filters.client_id)?.name || 'all-clients';
  const exportFile = () => exportCsv(`timesheet-${clientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${report.from}-to-${report.to}.csv`, CSV_COLUMNS,
    report.rows.map((row) => ({ ...row, period_ended: fmtDate(row.period_ended), work_date: fmtDate(row.work_date), hours: fmtHours(row.hours) })));
  const max = report?.summary.by_person[0]?.hours || 1;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={run} className={`${cls.card} flex flex-wrap items-end gap-3 p-4`}>
        <label className={cls.label}>Client
          <select className={`${cls.input} mt-1 min-w-[180px]`} value={filters.client_id} onChange={set('client_id')}>
            <option value="">All clients</option>{config.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className={cls.label}>From<input type="date" required className={`${cls.input} mt-1`} value={filters.from} max={filters.to} onChange={set('from')} /></label>
        <label className={cls.label}>To<input type="date" required className={`${cls.input} mt-1`} value={filters.to} min={filters.from} onChange={set('to')} /></label>
        <label className={cls.label}>Person
          <select className={`${cls.input} mt-1 min-w-[160px]`} value={filters.user_id} onChange={set('user_id')}>
            <option value="">Everyone</option>{config.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <button type="submit" className={cls.primary} disabled={loading}>{loading ? 'Loading...' : 'Show report'}</button>
        <button type="button" className={cls.button} disabled={!report?.rows.length} onClick={exportFile}>Export CSV</button>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!report && !error && <p className="text-sm text-slate-500">Pick a client and dates, then press <b>Show report</b>. Drafts are not counted.</p>}
      {report && <>
        {report.truncated && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This range has more than 10,000 time logs. Only the first 10,000 are shown. Pick a shorter range or one client.</p>}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[['Total hours', fmtHours(report.summary.total_hours)], ['Entries', report.summary.entry_count], ['People', report.summary.by_person.length]].map(([label, value]) => (
            <article key={label} className={`${cls.card} p-4`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><strong className="text-2xl tabular-nums">{value}</strong></article>
          ))}
        </section>
        {!report.rows.length && <p className={`${cls.card} p-6 text-center text-slate-500`}>No time logged for these filters. Widen the date range or pick another client.</p>}
        {report.rows.length > 0 && <>
          <section className={cls.card}>
            <h3 className="border-b px-4 py-3 font-semibold">Hours by person</h3>
            <table className="w-full text-sm"><tbody>
              {report.summary.by_person.map((person) => (
                <tr key={person.user_id} className="border-t first:border-t-0">
                  <td className={`${cls.td} w-1/3`}>{person.name}</td>
                  <td className={cls.td}><div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${(person.hours / max) * 100}%` }} /></div></td>
                  <td className={`${cls.td} w-20 text-right font-semibold tabular-nums`}>{fmtHours(person.hours)}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
          {report.summary.by_client.map((client) => (
            <section key={client.client_id} className={cls.card}>
              <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-semibold">{client.name}</h3><span className="text-sm"><b className="tabular-nums">{fmtHours(client.hours)}</b> hours</span></div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr><th className={cls.th}>Date worked</th><th className={cls.th}>Job type</th><th className={cls.th}>Work type</th><th className={cls.th}>Period ended</th><th className={cls.th}>Who worked</th><th className={`${cls.th} text-right`}>Hours</th></tr></thead>
                <tbody>{client.entries.map((entry) => (
                  <tr key={entry.entry_id} className="border-t">
                    <td className={`${cls.td} whitespace-nowrap`}>{fmtDate(entry.date_worked)}</td><td className={cls.td}>{entry.job_type}</td><td className={cls.td}>{entry.work_type}</td>
                    <td className={`${cls.td} whitespace-nowrap`}>{fmtDate(entry.period_ended)}</td>
                    <td className={cls.td}>{entry.people.map((person) => <div key={person.user_id}>{person.name} <span className="text-slate-500 tabular-nums">{fmtHours(person.hours)} h</span></div>)}</td>
                    <td className={`${cls.td} text-right font-semibold tabular-nums`}>{fmtHours(entry.hours)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </section>
          ))}
        </>}
      </>}
    </div>
  );
}
