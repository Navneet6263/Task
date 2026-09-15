import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useDialog from '../useDialog';
import UpdateEditor from './UpdateEditor';
import ReportProblem from './ReportProblem';
import PrivateReports from './PrivateReports';
import { changed, dateTime, errorText, updatesApi } from './updatesApi';
import { groupUpdatesByDate } from './updateDates';

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
  const content = <section ref={ref} role={fullPage ? undefined : 'dialog'} aria-modal={fullPage ? undefined : 'true'} aria-labelledby="updates-heading" tabIndex={-1} className={`updates-dialog ${fullPage ? 'updates-full-page' : ''}`}>
      <header className="updates-modal-head"><div><span className="updates-kicker">GREENTASK · WHAT'S NEW</span>
        <h2 id="updates-heading">{mode?.type === 'edit' ? mode.update ? 'Edit update' : 'Publish an update' : mode?.type === 'report' ? 'Report a problem' : 'Product updates'}</h2>
        <p>Discover improvements. Learn the steps. Report a problem privately.</p></div>{!fullPage && <button type="button" onClick={close} disabled={busy} aria-label="Close updates">✕</button>}</header>
      <div className="updates-toolbar">{mode ? <button type="button" onClick={back} disabled={busy}>← Back to updates</button> : <>
        <div className="updates-tabs" role="group" aria-label="Updates sections"><button aria-pressed={tab === 'updates'} onClick={() => setTab('updates')}>Latest updates</button><button aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}>My private reports</button></div>
        {tab === 'updates' && canPublish && <button className="updates-primary" disabled={loading} onClick={() => { setNotice(''); setMode({ type: 'edit' }); }}>+ Publish update</button>}
      </>}</div>
      <div className="updates-body">
        {notice && <p role="status" className="updates-notice">{notice}</p>}
        {mode?.type === 'edit' && canPublish ? <UpdateEditor key={mode.update?.id || 'new'} initial={mode.update} onBusy={setBusy} onSaved={() => {
          setMode(null); setNotice('Update published. Employees can now read it.'); setPage(1); setRevision(revision + 1);
        }} /> : mode?.type === 'report' ? <ReportProblem key={mode.update.id} update={mode.update} onBusy={setBusy} onSent={message => { setMode(null); setNotice(message); }} />
          : tab === 'reports' ? <PrivateReports /> : <>
            {loading && <p role="status">Loading updates...</p>}
            {error && <p className="updates-error" role="alert">{error} <button onClick={() => setRevision(revision + 1)}>Retry</button></p>}
            {!loading && !error && !rows.length && <div className="updates-empty"><h3>No updates published yet</h3><p>{canPublish ? 'Publish your first feature guide using the button above.' : 'Your admins will share new features and instructions here.'}</p></div>}
            {!loading && !error && total > 0 && <p className="updates-feed-note">{total} {total === 1 ? 'update' : 'updates'} · Newest first · Dates and times shown in your local timezone</p>}
            {groupUpdatesByDate(rows).map(group => <section className="updates-day" key={group.label} aria-label={group.label}>
              <h3 className="updates-day-heading">{group.label}<small>{group.updates.length} on this page</small></h3>
              {group.updates.map(update => <article className="updates-card" key={update.id}>
              <div className="updates-section-head"><span className="updates-kicker">{update.is_read ? 'FEATURE UPDATE' : 'NEW / UNREAD'}</span><time dateTime={update.published_at}>{dateTime(update.published_at)}</time></div>
              <h3>{update.title}</h3><p className="updates-prose">{update.summary}</p>
              {update.version > 1 && <small>Edited {dateTime(update.updated_at)} · Version {update.version}</small>}
              <div className="updates-card-actions"><button type="button" aria-expanded={expanded === update.id} onClick={() => read(update)}>{expanded === update.id ? 'Hide guide' : 'Read guide & how to use'}</button>
                {canPublish && update.can_edit && <button onClick={() => { setNotice(''); setMode({ type: 'edit', update }); }}>Edit update</button>}</div>
              {expanded === update.id && <div className="updates-guide"><h4>Why it helps</h4><p className="updates-prose">{update.why_text}</p><h4>How to use it</h4><p className="updates-prose">{update.how_text}</p>
                {update.performance_text && <><h4>Performance improvements</h4><p className="updates-prose">{update.performance_text}</p></>}</div>}
              <button className="updates-report-link" onClick={() => { setNotice(''); setMode({ type: 'report', update }); }}>Something not working? Report a problem →</button>
            </article>)}</section>)}
            {total > 20 && <div className="updates-pagination"><button disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / 20)}</span><button disabled={loading || page * 20 >= total} onClick={() => setPage(page + 1)}>Next</button></div>}
          </>}
      </div>
    </section>;
  return fullPage ? content : createPortal(<div className="updates-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>{content}</div>, document.body);
}
