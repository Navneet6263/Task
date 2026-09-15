import React, { useEffect, useState } from 'react';
import { analytics, teams } from '../services/api';
import { readPreference } from '../services/preferences';
import { exportCsv } from '../services/exportCsv';
import './Reports.css';

const columns = [
  { key: 'name', label: 'Member' }, { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' }, { key: 'high_priority', label: 'High priority open' },
  { key: 'overdue', label: 'Overdue' }, { key: 'blocked', label: 'Blocked' },
  { key: 'on_time', label: 'On-time completions' }, { key: 'measured_completions', label: 'Measured completions' },
];
export default function Reports() {
  const [teamList, setTeamList] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [draft, setDraft] = useState({ created_from: '', created_to: '' });
  const [period, setPeriod] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    teams.getAll().then(response => {
      if (!active) return;
      setTeamList(response.data);
      setTeamId(prev => prev || String(response.data.find(t => t.id === readPreference('team', null))?.id || response.data[0]?.id || ''));
    }).catch(() => active && setError('Could not load teams. Please retry.'));
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!teamId) return undefined;
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null);
    analytics.report(teamId, period, controller.signal).then(response => {
      if (!controller.signal.aborted) setReport(response.data);
    }).catch(err => {
      if (!controller.signal.aborted) setError(err.response?.data?.error || 'Could not load report.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [teamId, period, retry]);
  return <div className="reports-page">
    <header className="reports-head"><h1>Team reports</h1><p>Real workload and delivery counts. No employee scores or wellbeing predictions.</p></header>
    <form className="flex flex-wrap gap-3 items-end rounded-xl bg-white border p-4" onSubmit={event => { event.preventDefault(); setPeriod({ ...draft }); }}>
      <label className="text-sm">Team<select aria-label="Report team" className="block border rounded-lg p-2" value={teamId} onChange={e => setTeamId(e.target.value)}>{teamList.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label className="text-sm">Created from<input className="block border rounded-lg p-2" type="date" value={draft.created_from} max={draft.created_to || undefined} onChange={e => setDraft({ ...draft, created_from: e.target.value })} /></label>
      <label className="text-sm">Created to<input className="block border rounded-lg p-2" type="date" value={draft.created_to} min={draft.created_from || undefined} onChange={e => setDraft({ ...draft, created_to: e.target.value })} /></label>
      <button className="rounded-lg bg-blue-600 text-white px-4 py-2" disabled={loading}>Apply period</button>
      <button type="button" disabled={!report || loading} className="rounded-lg border px-4 py-2" onClick={() => exportCsv('team-report.csv', columns, report.members)}>Export CSV</button>
    </form>
    {loading && <p role="status">Loading report...</p>}
    {error && <p role="alert" className="text-red-700">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    {report && <>
      <p className="text-sm text-slate-500">{report.scope}</p>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {['active', 'completed', 'overdue', 'blocked'].map(key => <article key={key} className="rounded-xl border bg-white p-5"><p className="capitalize text-slate-500">{key}</p><strong className="text-3xl">{report.totals[key] || 0}</strong></article>)}
      </section>
      <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm text-left"><thead><tr>{columns.map(column => <th key={column.key} className="p-3 bg-slate-50">{column.label}</th>)}</tr></thead>
        <tbody>{report.members.map(member => <tr key={member.id} className="border-t">{columns.map(column => <td key={column.key} className="p-3">{member[column.key]}</td>)}</tr>)}
        {!report.members.length && <tr><td className="p-5" colSpan={columns.length}>No members in this team yet.</td></tr>}</tbody></table></div>
      <p className="text-sm text-slate-500">{report.measurement} Workload counts do not account for complexity, leave or part-time schedules.</p>
    </>}
  </div>;
}
