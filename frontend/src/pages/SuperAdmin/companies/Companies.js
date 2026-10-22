import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, Input, Segmented, Select } from '../../../ui';
import { initials, STATUS_TONE, timeAgo } from '../consoleUtils';
import CompanyDetail from './CompanyDetail';

const SORTS = {
  newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
  users: (a, b) => Number(b.total_users || 0) - Number(a.total_users || 0),
  name: (a, b) => String(a.name).localeCompare(String(b.name)),
};
const DOT = { ok: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' };

// Company accounts: filter and search on the left, the selected company on the right.
export default function Companies({ sa, focus }) {
  const admins = sa.data.admins;
  const [status, setStatus] = useState(focus?.status || (sa.data.pending_count ? 'pending' : 'all'));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState(focus?.id || null);

  useEffect(() => {
    if (!focus) return;
    if (focus.status) setStatus(focus.status);
    if (focus.id) setSelected(focus.id);
  }, [focus]);

  const counts = useMemo(() => admins.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), { all: admins.length }), [admins]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return admins.filter((a) => (status === 'all' || a.status === status) && (!q || `${a.name} ${a.email}`.toLowerCase().includes(q))).sort(SORTS[sort]);
  }, [admins, status, query, sort]);

  // Keep the selection inside the current list: the focused company, else the first row.
  useEffect(() => {
    if (rows.length && !rows.some((a) => a.id === selected)) setSelected(rows[0].id);
  }, [rows, selected]);
  const current = rows.find((a) => a.id === selected);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Status" value={status} onChange={setStatus} className="[&>button]:normal-case"
          options={[['pending', `Pending · ${counts.pending || 0}`], ['approved', `Approved · ${counts.approved || 0}`], ['rejected', `Rejected · ${counts.rejected || 0}`], ['all', `All · ${counts.all}`]]} />
        <span className="flex-1" />
        <Input aria-label="Search companies" placeholder="Search name or email" className="!w-56" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select aria-label="Sort" className="!w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="users">Most users</option><option value="name">Name A–Z</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <p className="border-b border-line px-4 py-2.5 text-xs text-muted">{rows.length} {rows.length === 1 ? 'company' : 'companies'}</p>
          <ul className="flex-1 overflow-y-auto p-2">
            {rows.map((admin, i) => {
              const active = admin.id === selected;
              return (
                <li key={admin.id} className="motion-safe:animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                  <button type="button" onClick={() => setSelected(admin.id)} aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${active ? 'bg-accent-soft shadow-sm ring-1 ring-accent/30' : 'hover:bg-subtle'}`}>
                    <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted'}`}>
                      {initials(admin.name)}<span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${DOT[STATUS_TONE[admin.status]] || 'bg-muted'}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{admin.name}</span>
                      <span className="block truncate text-xs text-muted">{admin.email}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-muted">
                      <span className="block font-mono text-xs font-semibold text-ink">{admin.total_users || 0}</span>users
                    </span>
                  </button>
                </li>
              );
            })}
            {!rows.length && <li className="px-3 py-10 text-center text-sm text-muted">No companies match.{status !== 'all' && <> Try <button type="button" className="font-semibold text-accent" onClick={() => setStatus('all')}>All</button>.</>}</li>}
          </ul>
          {status === 'pending' && rows.length > 0 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Oldest request: {timeAgo([...rows].sort(SORTS.oldest)[0].created_at)}</p>}
        </div>

        {current
          ? <CompanyDetail key={current.id} sa={sa} summary={current} />
          : <EmptyState title="Pick a company">Choose a company on the left to see its details, limits and organizations.</EmptyState>}
      </div>
    </div>
  );
}
