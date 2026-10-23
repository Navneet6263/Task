import React, { useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { exportTimesheetReport } from './exportTimesheet';
import { Banner, Button, Card, EmptyState, ErrorText, Field, Input, Select } from '../../../ui';
import { errorOf } from '../format';
import { ClientBreakdown, HoursByPerson, ReportStats } from './ReportSections';

const monthStart = (today) => `${today.slice(0, 8)}01`;

export default function ReportsTab({ config }) {
  const [filters, setFilters] = useState({ client_id: '', user_id: '', from: monthStart(config.today), to: config.today });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async (event) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const params = { ...filters, client_id: filters.client_id || undefined, user_id: filters.user_id || undefined };
      setReport((await timesheet.report(params)).data);
    } catch (err) { setError(errorOf(err, 'Could not load the report.')); setReport(null); }
    finally { setLoading(false); }
  };
  const set = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));

  const [exporting, setExporting] = useState(false);
  const exportFile = async () => {
    setExporting(true);
    try {
      await exportTimesheetReport({
        report, config,
        clientName: config.clients.find((client) => String(client.id) === filters.client_id)?.name,
        personName: config.users.find((user) => String(user.id) === filters.user_id)?.name,
      });
      notify('Excel report downloaded.', 'success');
    } catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <form onSubmit={run} className="flex flex-wrap items-end gap-3">
          <Field label="Client" htmlFor="ts-report-client">
            <Select id="ts-report-client" className="min-w-[190px]" value={filters.client_id} onChange={set('client_id')}>
              <option value="">All clients</option>{config.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </Select>
          </Field>
          <Field label="From" htmlFor="ts-report-from"><Input id="ts-report-from" type="date" required value={filters.from} max={filters.to} onChange={set('from')} /></Field>
          <Field label="To" htmlFor="ts-report-to"><Input id="ts-report-to" type="date" required value={filters.to} min={filters.from} onChange={set('to')} /></Field>
          <Field label="Person" htmlFor="ts-report-person">
            <Select id="ts-report-person" className="min-w-[160px]" value={filters.user_id} onChange={set('user_id')}>
              <option value="">Everyone</option>{config.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Loading...' : 'Show report'}</Button>
          <Button disabled={!report?.rows.length || exporting} onClick={exportFile}>{exporting ? 'Preparing…' : 'Download Excel'}</Button>
        </form>
      </Card>
      <ErrorText>{error}</ErrorText>
      {!report && !error && <EmptyState title="Pick a client and dates">Then press <b>Show report</b> to see who spent how much time. Drafts are not counted.</EmptyState>}
      {report && <>
        {report.truncated && <Banner tone="warn">This range has more than 10,000 time logs. Only the first 10,000 are shown. Pick a shorter range or one client.</Banner>}
        <ReportStats summary={report.summary} />
        {!report.rows.length && <EmptyState title="No time logged">Widen the date range or pick another client.</EmptyState>}
        {report.rows.length > 0 && <>
          <HoursByPerson people={report.summary.by_person} />
          {report.summary.by_client.map((client) => <ClientBreakdown key={client.client_id} client={client} />)}
        </>}
      </>}
    </div>
  );
}
