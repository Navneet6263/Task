import React, { useMemo } from 'react';
import useOverviewLayout, { WIDGETS } from './layoutPrefs';
import CustomizePanel from './CustomizePanel';
import { ApprovalQueue, GrowthBars, KpiRow, LargestCompanies, RecentActivity, StatusDonut } from './widgets';

const TITLES = Object.fromEntries(WIDGETS.map(([key, title, help]) => [key, { title, help }]));

// Overview made of widgets the admin can show, hide, resize and reorder.
export default function Overview({ sa, go, customizing, onCloseCustomize }) {
  const prefs = useOverviewLayout();
  const { layout } = prefs;
  const counts = useMemo(() => sa.data.admins.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), { approved: 0, pending: 0, rejected: 0 }), [sa.data.admins]);

  const render = (key) => ({
    kpis: <KpiRow data={sa.data} counts={counts} go={go} />,
    queue: <ApprovalQueue admins={sa.data.admins} go={go} />,
    status: <StatusDonut counts={counts} go={go} />,
    growth: <GrowthBars admins={sa.data.admins} />,
    top: <LargestCompanies admins={sa.data.admins} go={go} />,
    activity: <RecentActivity logs={sa.logs} go={go} />,
  }[key]);

  const shown = layout.order.filter((key) => !layout.hidden.includes(key));
  return (
    <>
      {sa.data.pending_count > 0 && (
        <button type="button" onClick={() => go('companies', { status: 'pending' })}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-left text-sm transition hover:shadow-sm">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warn" /></span>
          <span className="flex-1"><strong>{sa.data.pending_count} {sa.data.pending_count === 1 ? 'company is' : 'companies are'} waiting for approval.</strong> They cannot sign in until you decide.</span>
          <span className="font-semibold text-ink">Review →</span>
        </button>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {shown.map((key, index) => (
          <section key={key} style={{ animationDelay: `${index * 60}ms` }}
            className={`motion-safe:animate-fade-up ${layout.size[key] === 'full' ? 'lg:col-span-2' : ''} ${key === 'kpis' ? '' : 'rounded-xl border border-line bg-surface p-4 sm:p-5'}`}>
            {key !== 'kpis' && (
              <header className="mb-3"><h2 className="text-[15px] font-semibold">{TITLES[key].title}</h2><p className="text-xs text-muted">{TITLES[key].help}</p></header>
            )}
            {render(key)}
          </section>
        ))}
      </div>
      {customizing && <CustomizePanel {...prefs} onClose={onCloseCustomize} />}
    </>
  );
}
