import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useDialog from '../useDialog';
import { Banner, Button, EmptyState, ErrorText, Loading, Tabs } from '../../ui';
import UpdateEditor from './UpdateEditor';
import ReportProblem from './ReportProblem';
import PrivateReports from './PrivateReports';
import UpdateCard from './UpdateCard';
import { changed, errorText, updatesApi } from './updatesApi';
import { groupUpdatesByDate } from './updateDates';

// Product updates feed: dated release notes with guides, publishing for admins and private problem reports.
// Renders as a page section (`fullPage`) or as a modal.
export default function UpdatesDialog({ onClose, fullPage = false }) {
  const [tab, setTab] = useState('updates'), [mode, setMode] = useState(null), [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [expanded, setExpanded] = useState(null);
  const [rows, setRows] = useState([]), [total, setTotal] = useState(0), [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const close = () => { if (!busy) onClose?.(); };
  const ref = useDialog(!fullPage, close);
  useEffect(() => {
    const body = ref.current?.querySelector('.updates-body');
    if (body) body.scrollTop = 0;
    ref.current?.focus();
    if (fullPage) ref.current?.scrollIntoView?.({ block: 'start' });
  }, [mode, tab, page, ref, fullPage]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setRows([]); setExpanded(null);
    updatesApi.list(page, controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      setRows(data.data); setTotal(data.total); setCanPublish(data.can_publish);
    }).catch(err => { if (!controller.signal.aborted) { setError(errorText(err)); setCanPublish(false); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);
  const read = async update => {
    setExpanded(expanded === update.id ? null : update.id);
    if (update.is_read) return;
    try {
      await updatesApi.read(update.id, update.version);
      setRows(current => current.map(row => row.id === update.id && row.version === update.version ? { ...row, is_read: 1 } : row)); changed();
    } catch { setNotice('Could not mark this update as read. Open it again to retry.'); }
  };
  const back = () => { if (!busy) setMode(null); };
  const edit = update => { setNotice(''); setMode({ type: 'edit', update }); };
  const title = mode?.type === 'edit' ? (mode.update ? 'Edit update' : 'Publish an update') : mode?.type === 'report' ? 'Report a problem' : 'Product updates';
  const unread = rows.filter(row => !row.is_read).length;
  const pages = Math.ceil(total / 20);

  const feed = <>
    {loading && <Loading>Loading updates...</Loading>}
    {error && <div className="rounded-md bg-danger-soft px-3.5 py-2.5"><ErrorText onRetry={() => setRevision(revision + 1)}>{error}</ErrorText></div>}
    {!loading && !error && !rows.length && (
      <EmptyState title="No updates published yet">
        {canPublish ? 'Publish your first feature guide with the button above.' : 'Your admins will share new features and how-to guides here.'}
      </EmptyState>
    )}
    {!loading && !error && total > 0 && (
      <p className="text-xs text-muted">{total} {total === 1 ? 'update' : 'updates'}{unread > 0 && ` · ${unread} unread on this page`} · Newest first · Times in your local timezone</p>
    )}
    {groupUpdatesByDate(rows).map(group => (
      <section className="updates-day flex flex-col gap-3" key={group.label} aria-label={group.label}>
        <h3 className="updates-day-heading flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {group.label}<span className="font-normal normal-case tracking-normal">· {group.updates.length} on this page</span>
          <span className="h-px flex-1 bg-line" />
        </h3>
        {group.updates.map(update => (
          <UpdateCard key={update.id} update={update} expanded={expanded === update.id} canEdit={canPublish && update.can_edit}
            onToggle={() => read(update)} onEdit={() => edit(update)} onReport={() => { setNotice(''); setMode({ type: 'report', update }); }} />
        ))}
      </section>
    ))}
    {total > 20 && (
      <div className="flex items-center justify-center gap-3 pt-2 text-sm">
        <Button size="sm" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-muted">Page {page} of {pages}</span>
        <Button size="sm" disabled={loading || page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    )}
  </>;

  const content = (
    <section ref={ref} role={fullPage ? undefined : 'dialog'} aria-modal={fullPage ? undefined : 'true'} aria-labelledby="updates-heading" tabIndex={-1}
      className={`updates-dialog flex flex-col text-ink outline-none ${fullPage ? '' : 'max-h-[90vh] w-full max-w-3xl rounded-xl border border-line bg-surface shadow-pop'}`}>
      <header className={`flex items-start justify-between gap-3 ${fullPage ? 'pb-4' : 'border-b border-line px-5 py-4'}`}>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">GreenTask · What's new</p>
          <h2 id="updates-heading" className="mt-0.5 text-[22px] font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">Discover improvements, learn the steps, and report a problem privately.</p>
        </div>
        {!fullPage && (
          <button type="button" onClick={close} disabled={busy} aria-label="Close updates" className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>
        )}
      </header>
      <div className={fullPage ? '' : 'px-5 pt-3'}>
        {mode ? (
          <button type="button" onClick={back} disabled={busy} className="mb-4 text-sm font-medium text-muted hover:text-ink">← Back to updates</button>
        ) : (
          <Tabs label="Updates sections" value={tab} onChange={setTab} tabs={[['updates', 'Latest updates'], ['reports', 'My private reports']]}
            aside={tab === 'updates' && canPublish && <Button variant="primary" size="sm" disabled={loading} onClick={() => edit(undefined)}>+ Publish update</Button>} />
        )}
      </div>
      <div className={`updates-body flex flex-col gap-5 ${fullPage ? '' : 'overflow-y-auto px-5 pb-5'}`}>
        {notice && <Banner tone="ok"><span role="status">{notice}</span></Banner>}
        {mode?.type === 'edit' && canPublish ? (
          <UpdateEditor key={mode.update?.id || 'new'} initial={mode.update} onBusy={setBusy} onSaved={() => {
            setMode(null); setNotice('Update published. Employees can now read it.'); setPage(1); setRevision(revision + 1);
          }} />
        ) : mode?.type === 'report' ? (
          <ReportProblem key={mode.update.id} update={mode.update} onBusy={setBusy} onSent={message => { setMode(null); setNotice(message); }} />
        ) : tab === 'reports' ? <PrivateReports /> : feed}
      </div>
    </section>
  );
  if (fullPage) return content;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3 sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>{content}</div>,
    document.body,
  );
}
