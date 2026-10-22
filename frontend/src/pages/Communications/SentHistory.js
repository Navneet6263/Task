import React, { useEffect, useState } from 'react';
import { communications } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, EmptyRow, ErrorText, Modal, Segmented, Table, TableWrap, Td, Th } from '../../ui';

const when = (value) => (value ? new Date(`${value}`).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Detail({ id, onClose, onReuse }) {
  const [mail, setMail] = useState(null);
  useEffect(() => { communications.historyItem(id).then((r) => setMail(r.data)).catch(() => { notify('Could not open this email.'); onClose(); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mail) return null;
  return (
    <Modal title={mail.subject} subtitle={`${when(mail.created_at)} · sent by ${mail.sent_by_name || 'someone'}`} size="md" onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => onReuse(mail)}>Use again</Button></>}>
      <dl className="mb-3 grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">To</dt><dd className="break-words">{mail.to_list}</dd>
        {mail.cc_list && <><dt className="text-muted">CC</dt><dd className="break-words">{mail.cc_list}</dd></>}
      </dl>
      {mail.status === 'FAILED' && <p className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Not delivered: {mail.error}</p>}
      <p className="whitespace-pre-wrap rounded-md border border-line bg-subtle p-4 text-sm leading-relaxed">{mail.body}</p>
    </Modal>
  );
}

export default function SentHistory({ onReuse }) {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isLead = ['admin', 'manager', 'company_admin'].includes(user.role);
  const [mine, setMine] = useState(!isLead);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setError('');
    communications.history(page, mine).then((r) => setResult(r.data)).catch((err) => setError(err.response?.status === 404 ? 'Sent history is not available until the backend is restarted.' : err.response?.data?.error || 'Could not load sent emails.'));
  }, [page, mine, retry]);
  const pages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{result ? `${result.total} emails` : 'Loading…'} · {result?.scope === 'organization' ? 'everyone in your company' : 'sent by you'}</p>
        {isLead && <Segmented label="Whose emails" value={mine ? 'mine' : 'all'} onChange={(v) => { setMine(v === 'mine'); setPage(1); }} options={[['all', 'Whole company'], ['mine', 'Only mine']]} />}
      </div>
      <ErrorText onRetry={() => setRetry((v) => v + 1)}>{error}</ErrorText>
      <TableWrap>
        <Table>
          <thead><tr><Th>Sent</Th><Th>To</Th><Th>Subject</Th>{!mine && <Th>By</Th>}<Th>Status</Th></tr></thead>
          <tbody>
            {result?.data.map((mail) => (
              <tr key={mail.id} tabIndex={0} className="cursor-pointer hover:bg-subtle focus:bg-subtle focus:outline-none" onClick={() => setOpenId(mail.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(mail.id); }}>
                <Td className="whitespace-nowrap text-muted">{when(mail.created_at)}</Td>
                <Td className="max-w-[220px] truncate">{mail.to_list}</Td>
                <Td><span className="block max-w-[360px] truncate font-medium">{mail.subject}</span><span className="block max-w-[360px] truncate text-xs text-muted">{mail.preview}</span></Td>
                {!mine && <Td className="whitespace-nowrap">{mail.sent_by_name}</Td>}
                <Td>{mail.status === 'SENT' ? <Chip tone="ok">Sent</Chip> : <Chip tone="danger">Failed</Chip>}</Td>
              </tr>
            ))}
            {result && !result.data.length && <EmptyRow colSpan={mine ? 4 : 5}>No emails sent yet. Emails you send from Compose appear here.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="font-mono text-xs text-muted">{page} / {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} onReuse={(mail) => { setOpenId(null); onReuse(mail); }} />}
    </div>
  );
}
