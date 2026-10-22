import React, { useMemo, useState } from 'react';
import { downloadWorkbook } from '../../services/excelExport';
import { notify } from '../../services/feedback';
import { Button, Chip, EmptyState, Input, Select, Switch } from '../../ui';
import { ACTION_TONE, actionLabel, initials, ROUTINE_ACTIONS } from './consoleUtils';

const dayLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const today = new Date(); const yesterday = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const time = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };
const SUMMARY = [['APPROVE_COMPANY', 'Approvals'], ['REJECT_COMPANY', 'Rejections'], ['UPDATE_LIMITS', 'Limit changes'], ['ENABLE_MODULE', 'Modules turned on']];

// Audit trail of platform admin actions, newest first, grouped by day.
export default function Activity({ sa }) {
  const [query, setQuery] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [routine, setRoutine] = useState(false);
  const [exporting, setExporting] = useState(false);

  const actors = useMemo(() => [...new Map(sa.logs.map((l) => [l.actor_email, l.actor_name || l.actor_email])).entries()], [sa.logs]);
  const actions = useMemo(() => [...new Set(sa.logs.map((l) => l.action))].sort(), [sa.logs]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sa.logs.filter((l) => (routine || action === l.action || !ROUTINE_ACTIONS.includes(l.action))
      && (!actor || l.actor_email === actor) && (!action || l.action === action)
      && (!q || `${l.actor_name} ${l.actor_email} ${l.description} ${actionLabel(l.action)}`.toLowerCase().includes(q)));
  }, [sa.logs, query, actor, action, routine]);
  const groups = useMemo(() => rows.reduce((acc, row) => { const key = dayLabel(row.created_at); (acc[key] = acc[key] || []).push(row); return acc; }, {}), [rows]);
  const monthAgo = Date.now() - 30 * 86400000;
  const recent = sa.logs.filter((l) => new Date(l.created_at).getTime() >= monthAgo);

  const exportRows = async () => {
    setExporting(true);
    try {
      await downloadWorkbook({
        fileName: `platform-activity-${new Date().toISOString().slice(0, 10)}`,
        title: 'Platform admin activity',
        lines: [`Generated: ${new Date().toLocaleString('en-GB')}`, `${rows.length} events with the current filters`],
        sheets: [{ name: 'Activity', rows, columns: [
          { key: 'created_at', label: 'When', type: 'datetime', width: 19, value: (r) => (r.created_at ? String(r.created_at).slice(0, 19) : null) },
          { key: 'actor_name', label: 'Who', width: 22, value: (r) => r.actor_name || r.actor_email },
          { key: 'actor_email', label: 'Email', width: 28 },
          { key: 'action', label: 'Action', width: 20, value: (r) => actionLabel(r.action), tone: (r) => ACTION_TONE[r.action] || 'neutral' },
          { key: 'description', label: 'Details', width: 70, wrap: true },
        ] }],
      });
    } catch { notify('Could not create the Excel file.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SUMMARY.map(([key, label], i) => (
          <button key={key} type="button" onClick={() => setAction(action === key ? '' : key)} style={{ animationDelay: `${i * 50}ms` }}
            className={`rounded-xl border bg-surface p-3.5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-safe:animate-fade-up ${action === key ? 'border-accent ring-2 ring-accent/15' : 'border-line'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{recent.filter((l) => l.action === key).length}</p>
            <p className="text-xs text-muted">last 30 days</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
        <Input aria-label="Search activity" placeholder="Search who, what or details" className="!w-64" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select aria-label="Who" className="!w-auto" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Everyone</option>{actors.map(([email, name]) => <option key={email} value={email}>{email === sa.me.email ? `Me (${name})` : name}</option>)}
        </Select>
        <Select aria-label="Action" className="!w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>{actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted"><Switch checked={routine} onChange={setRoutine} label="Show sign-ins and page views" />Sign-ins &amp; views</label>
        <span className="flex-1" />
        <Button onClick={exportRows} disabled={exporting || !rows.length}>{exporting ? 'Preparing…' : 'Export Excel'}</Button>
      </div>

      {!rows.length ? <EmptyState title="No activity matches">Clear a filter or turn on sign-ins and page views.</EmptyState> : (
        <div className="flex flex-col gap-5">
          {Object.entries(groups).map(([day, items]) => (
            <section key={day} className="motion-safe:animate-fade-up">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">{day}<span className="font-normal normal-case tracking-normal">· {items.length}</span><span className="h-px flex-1 bg-line" /></h3>
              <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                {items.map((log) => (
                  <li key={log.id} className="flex items-start gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-subtle/60">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-bold text-muted">{initials(log.actor_name || log.actor_email)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm"><strong className="font-semibold">{log.actor_name || log.actor_email}</strong><Chip tone={ACTION_TONE[log.action] || 'neutral'}>{actionLabel(log.action)}</Chip></p>
                      <p className="mt-0.5 break-words text-sm text-muted">{log.description || '—'}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted">{time(log.created_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-center text-xs text-muted">Showing up to the latest 300 events.</p>
        </div>
      )}
    </div>
  );
}
