import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, Chip, Loading, Meter, Tabs } from '../../../ui';
import { dateLabel, initials, parseCompanyProfile, STATUS_TONE } from '../consoleUtils';
import LimitsPanel from './LimitsPanel';
import OrgTable from './OrgTable';
import EmployeesPanel from './EmployeesPanel';
import EmailInboxPanel from './EmailInboxPanel';

const GROUPS = [
  ['Company', ['Company Name', 'Industry', 'Company Size', 'Headquarters', 'Website']],
  ['Contacts', ['Primary Contact', 'Alternate Contact Number', 'Support Email', 'Billing Contact']],
  ['Operations', ['Work Mode', 'Timezone', 'Active Shifts', 'Onboarding Goal', 'Integration Needs', 'Additional Notes']],
];

function Value({ label, value }) {
  const text = value && value !== '-' ? String(value) : '';
  if (label === 'Website' && /^https?:\/\//i.test(text)) return <a href={text} target="_blank" rel="noreferrer" className="text-accent hover:underline">{text}</a>;
  return text ? <span className="whitespace-pre-line">{text}</span> : <span className="text-muted">—</span>;
}

function Stat({ label, value, sub, meter }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {meter && <div className="mt-2"><Meter value={meter[0]} max={meter[1]} tone={meter[0] >= meter[1] ? 'warn' : 'accent'} label={label} /></div>}
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}

// One company account: profile, limits and approval, organizations and modules.
export default function CompanyDetail({ sa, summary }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState(summary.status === 'pending' ? 'limits' : 'profile');
  const { loadDetail } = sa;
  const reload = useCallback(async () => { const next = await loadDetail(summary.id); if (next) setDetail(next); }, [loadDetail, summary.id]);
  useEffect(() => { reload(); }, [reload, summary.status]);

  const profile = useMemo(() => parseCompanyProfile(detail?.company_description), [detail?.company_description]);
  if (!detail) return <div className="rounded-xl border border-line bg-surface p-6"><Loading>Opening {summary.name}…</Loading></div>;

  const orgs = detail.organizations || [];
  const managers = orgs.reduce((s, o) => s + Number(o.manager_count || 0), 0);
  const staff = orgs.reduce((s, o) => s + Number(o.staff_count || 0), 0);
  const after = (ok) => { if (ok) reload(); return ok; };

  return (
    <section className="flex min-w-0 flex-col gap-4 motion-safe:animate-fade-up">
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-sm">{initials(detail.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">{profile.values['Company Name'] || 'Company account'}</p>
            <h2 className="truncate text-xl font-bold">{detail.name}</h2>
            <p className="truncate text-sm text-muted">{detail.email}{detail.mobile && ` · ${detail.mobile}`}</p>
          </div>
          <div className="text-right">
            <Chip tone={STATUS_TONE[detail.status] || 'neutral'}>{String(detail.status).replace(/^\w/, (c) => c.toUpperCase())}</Chip>
            <p className="mt-1 text-xs text-muted">Registered {dateLabel(detail.created_at)}</p>
          </div>
        </div>
        {detail.status === 'rejected' && detail.rejected_reason && <div className="relative mt-4"><Banner tone="danger"><strong>Rejected:</strong> {detail.rejected_reason}</Banner></div>}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Organizations" value={orgs.length} sub={`of ${detail.max_companies || '—'} allowed`} meter={detail.status === 'approved' ? [orgs.length, Number(detail.max_companies || 1)] : null} />
        <Stat label="Managers" value={managers} sub={`up to ${detail.max_managers_per_company || '—'} per org`} />
        <Stat label="Staff" value={staff} sub={`up to ${detail.max_staff_per_company || '—'} per org`} />
        <Stat label="Requested" value={detail.expected_staff ?? '—'} sub={`staff · ${detail.expected_managers ?? '—'} managers · ${detail.expected_companies ?? '—'} orgs`} />
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 pt-1 sm:px-5">
        <Tabs label="Company sections" value={tab} onChange={setTab}
          tabs={[['profile', 'Profile'], ['limits', detail.status === 'pending' ? 'Decision & limits' : 'Limits'], ['orgs', `Organizations · ${orgs.length}`],
            ...(detail.status === 'approved' ? [['employees', 'Employees & logins'], ['inbox', 'Email to task']] : [])]} />
        <div key={tab} className="pb-5 motion-safe:animate-fade-in">
          {tab === 'profile' && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-sm font-semibold">What they do</h3><p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{profile.summary || 'No description was provided.'}</p></div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {GROUPS.map(([title, fields]) => (
                  <dl key={title} className="rounded-lg border border-line">
                    <p className="border-b border-line bg-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
                    {fields.map((label) => (
                      <div key={label} className="flex flex-col gap-0.5 border-b border-line px-3 py-2 text-sm last:border-b-0">
                        <dt className="text-xs text-muted">{label}</dt><dd className="min-w-0 break-words"><Value label={label} value={profile.values[label]} /></dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </div>
            </div>
          )}
          {tab === 'limits' && (
            <LimitsPanel detail={detail}
              onApprove={async (limits) => after(await sa.actions.approve(detail, limits))}
              onReject={async (reason) => after(await sa.actions.reject(detail, reason))}
              onSave={async (limits) => after(await sa.actions.saveLimits(detail, limits))} />
          )}
          {tab === 'orgs' && <OrgTable orgs={orgs} onToggle={async (org, key, enabled) => after(await sa.actions.toggleModule(org, key, enabled))} />}
          {tab === 'employees' && <EmployeesPanel orgs={orgs} sa={sa} onChanged={reload} />}
          {tab === 'inbox' && <EmailInboxPanel orgs={orgs} sa={sa} onChanged={reload} />}
        </div>
      </div>
    </section>
  );
}
