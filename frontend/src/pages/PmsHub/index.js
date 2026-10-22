import React, { useEffect, useState } from 'react';
import { analytics } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { Banner, Button, Card, CardHeader, Loading, PageHeader, Segmented, Tabs } from '../../ui';
import { headline, highlights } from './insights';
import { KpiTiles, StandingCard } from './Standing';
import { DurationChart, WeeklyChart } from './PerformanceCharts';
import RecentWork from './RecentWork';
import FocusPlan from './FocusPlan';
import ActivityLog from './ActivityLog';

const PERIODS = [['30', '30 days'], ['90', '3 months'], ['180', '6 months'], ['365', '1 year']];

export default function PmsHub() {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [days, setDays] = useState(() => readPreference('pms-period', '90'));
  const [tab, setTab] = useState('performance');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    analytics.myPerformance(Number(days), controller.signal)
      .then((r) => setData(r.data))
      .catch((err) => { if (err.name !== 'CanceledError') setError(err.response?.status === 404 ? 'Performance numbers need the latest backend. Restart the server and retry.' : err.response?.data?.error || 'Could not calculate your performance.'); });
    return () => controller.abort();
  }, [days, retry]);

  const choose = (value) => { setDays(value); writePreference('pms-period', value); };
  const notes = data ? highlights(data) : { strengths: [], tips: [] };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <PageHeader title="My performance" subtitle={`Hi ${user.name?.split(' ')[0] || 'there'}, here is how your work is going, calculated automatically from your tasks.`}
        actions={<Segmented label="Period" value={days} onChange={choose} options={PERIODS} />} />
      <Tabs tabs={[['performance', 'Performance'], ['work', 'Completed tasks'], ['activity', 'Activity log']]} value={tab} onChange={setTab} label="My performance" />
      {error && <Banner tone="danger" action={<Button size="sm" onClick={() => setRetry((v) => v + 1)}>Retry</Button>}>{error}</Banner>}
      {!data && !error && tab !== 'activity' && <Loading>Calculating your numbers…</Loading>}

      {data && tab === 'performance' && <>
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Summary</p>
          <p className="mt-1 max-w-3xl text-lg font-semibold leading-snug">{headline(data)}</p>
          {(notes.strengths.length > 0 || notes.tips.length > 0) && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-sm font-semibold text-accent">What is going well</p>
                <ul className="flex flex-col gap-1.5">{notes.strengths.map((s) => <li key={s} className="flex gap-2 text-sm"><span className="text-accent">✓</span>{s}</li>)}</ul>
              </div>
              {notes.tips.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-warn">Ideas to improve</p>
                  <ul className="flex flex-col gap-1.5">{notes.tips.map((s) => <li key={s} className="flex gap-2 text-sm"><span className="text-warn">→</span>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </section>
        <KpiTiles data={data} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <WeeklyChart weeks={data.weekly} />
          <StandingCard data={data} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <DurationChart buckets={data.distribution} />
          <FocusPlan />
        </div>
        <Card><CardHeader title="How these numbers work" />
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 p-4 text-xs text-muted md:grid-cols-2">
            <li><b className="text-ink">Tasks completed:</b> tasks assigned to you and marked done in the period.</li>
            <li><b className="text-ink">Typical time:</b> the middle value of days from start to completion, so one very long task does not distort it.</li>
            <li><b className="text-ink">On time:</b> completed on or before the due date, for tasks that had one.</li>
            <li><b className="text-ink">Team:</b> everyone who shares a team with you, shown only as averages and percentages.</li>
          </ul>
        </Card>
      </>}
      {data && tab === 'work' && <RecentWork tasks={data.recent} typical={data.me.medianDays} />}
      {tab === 'activity' && <ActivityLog />}
    </div>
  );
}
