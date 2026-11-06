import React, { useCallback, useEffect, useState } from 'react';
import { taskSheets } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Chip, EmptyState, Modal } from '../../../ui';
import SheetSetup from './SheetSetup';

const errorOf = (err, fallback) => err?.response?.data?.error || fallback;
const when = (value) => {
  if (!value) return 'Not read yet';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function LastResult({ result }) {
  const [open, setOpen] = useState(false);
  if (!result) return <span className="text-xs text-muted">Waiting for the first read.</span>;
  if (result.error) return <span className="text-xs text-danger">{result.error}</span>;
  const skipped = result.skipped || [];
  return (
    <span className="flex flex-col gap-1 text-xs">
      <span className="text-muted">
        <strong className="text-ink">{result.created}</strong> new task{result.created === 1 ? '' : 's'}
        {skipped.length > 0 && <> · <button type="button" className="font-semibold text-warn hover:underline" onClick={() => setOpen(!open)}>{skipped.length} row{skipped.length === 1 ? '' : 's'} waiting</button></>}
        {result.edited > 0 && <> · {result.edited} edited row{result.edited === 1 ? '' : 's'} ignored</>}
      </span>
      {open && (
        <ul className="flex flex-col gap-0.5 rounded-md bg-warn-soft px-2 py-1.5">
          {skipped.map((s, i) => <li key={i}>{s.row ? <strong>Row {s.row}: </strong> : null}{s.reason}</li>)}
        </ul>
      )}
    </span>
  );
}

// My Tasks → Sheet to task: linked sheets, their last read, and setup.
export default function SheetsModal({ fields, onClose, onTasksChanged }) {
  const [links, setLinks] = useState(null);
  const [setup, setSetup] = useState(null); // 'new' or a link to edit
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => taskSheets.list().then((r) => setLinks(r.data)).catch((err) => { notify(errorOf(err, 'Could not load your sheets.')); setLinks([]); }), []);
  useEffect(() => { load(); }, [load]);

  const run = async (link, request, message) => {
    setBusy(link.id);
    try { const r = await request(); notify(typeof message === 'function' ? message(r.data) : message, 'success'); await load(); onTasksChanged(); }
    catch (err) { notify(errorOf(err, 'Something went wrong.')); await load(); }
    finally { setBusy(null); }
  };
  const sync = (link) => run(link, () => taskSheets.sync(link.id), (r) => (r.created ? `${r.created} new task${r.created === 1 ? '' : 's'} from "${link.name}".` : `No new rows in "${link.name}".`));
  const pause = (link) => run(link, () => taskSheets.update(link.id, { is_active: !link.is_active }), link.is_active ? 'Paused. The sheet is not read in the evening.' : 'Resumed.');
  const unlink = (link) => {
    if (!window.confirm(`Unlink "${link.name}"? Tasks already made from it stay.`)) return;
    run(link, () => taskSheets.remove(link.id), 'Sheet unlinked.');
  };

  if (setup) {
    return <SheetSetup fields={fields} link={setup === 'new' ? null : setup} onClose={() => setSetup(null)}
      onSaved={(message) => { notify(message, 'success'); setSetup(null); load(); onTasksChanged(); }} />;
  }

  return (
    <Modal size="md" title="Sheet to task" subtitle="Fill a Google Sheet, get tasks. Read every evening at 7 pm." onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => setSetup('new')}>+ Link a sheet</Button></>}>
      {links === null && <p role="status" className="text-sm text-muted">Loading…</p>}
      {links?.length === 0 && (
        <EmptyState title="No sheet linked yet" action={<Button variant="primary" onClick={() => setSetup('new')}>Link your first sheet</Button>}>
          Keep your daily work in a Google Sheet. Every new row becomes a task for you, in the team you choose.
        </EmptyState>
      )}
      <ul className="flex flex-col gap-3">
        {(links || []).map((link) => (
          <li key={link.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent">⊞</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold">{link.name}{!link.is_active && <Chip tone="warn">Paused</Chip>}</p>
                <p className="truncate text-xs text-muted">Into {link.team_name || 'a team'} · {link.tasks_created} task{link.tasks_created === 1 ? '' : 's'} so far · last read {when(link.last_synced_at)}</p>
              </div>
              <a href={link.source_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent hover:underline">Open sheet ↗</a>
            </div>
            <LastResult result={link.last_result} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={busy === link.id} onClick={() => sync(link)}>{busy === link.id ? 'Reading…' : 'Sync now'}</Button>
              <Button size="sm" disabled={busy === link.id} onClick={() => setSetup(link)}>Columns & team</Button>
              <Button size="sm" variant="ghost" disabled={busy === link.id} onClick={() => pause(link)}>{link.is_active ? 'Pause' : 'Resume'}</Button>
              <span className="flex-1" />
              <Button size="sm" variant="danger" disabled={busy === link.id} onClick={() => unlink(link)}>Unlink</Button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
