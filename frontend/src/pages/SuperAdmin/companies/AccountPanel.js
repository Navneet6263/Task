import React, { useState } from 'react';
import { Banner, Button, Input, Modal } from '../../../ui';
import { dateLabel, initials } from '../consoleUtils';
import PasswordReveal from './PasswordReveal';

function Action({ title, text, children }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-muted">{text}</p></div>
      {children}
    </div>
  );
}

// Company → Admin account: who runs this company, a fresh password, a hand-over to someone new,
// or removing an account that has no organizations.
export default function AccountPanel({ detail, sa, onReplaced, onRemoved }) {
  const orgs = detail.organizations || [];
  const [dialog, setDialog] = useState(null); // 'reset' | 'handover' | 'remove'
  const [form, setForm] = useState({ name: '', email: '', mobile: '', keep_old_as_admin: false });
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const close = () => {
    const next = revealed?.newId;
    setDialog(null); setRevealed(null); setForm({ name: '', email: '', mobile: '', keep_old_as_admin: false });
    if (next) onReplaced(next);
  };
  const act = async (fn) => { setBusy(true); try { return await fn(); } finally { setBusy(false); } };

  const reset = () => act(async () => {
    const result = await sa.actions.resetAdminPassword(detail);
    if (result?.password) setRevealed(result);
  });
  const handOver = () => act(async () => {
    const result = await sa.actions.handOver(detail, form);
    if (result?.password) setRevealed({ ...result, newId: result.id });
  });
  const remove = () => act(async () => { if (await sa.actions.removeAdmin(detail)) { setDialog(null); onRemoved(); } });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">{initials(detail.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{detail.name}</p>
          <p className="truncate text-sm text-muted">{detail.email}{detail.mobile && ` · ${detail.mobile}`}</p>
        </div>
        <p className="text-right text-xs text-muted">Company admin since<br />{dateLabel(detail.approved_at || detail.created_at)}</p>
      </div>

      {detail.status === 'approved' && <>
        <Action title="Give a new temporary password" text="For a forgotten password. The old one stops working at once.">
          <Button onClick={() => setDialog('reset')}>Reset password</Button>
        </Action>
        <Action title="Hand the company to someone else" text={`A new company admin takes over all ${orgs.length} organization${orgs.length === 1 ? '' : 's'}, with their people, teams and tasks. Nothing is lost.`}>
          <Button variant="primary" onClick={() => setDialog('handover')}>Change company admin</Button>
        </Action>
      </>}
      <Action title="Remove this account" text={orgs.length ? 'Only possible without organizations. To replace the person, use "Change company admin".' : 'Deletes this company admin account. It has no organizations, so no work is lost.'}>
        <Button variant="danger" className="!border-danger/40" disabled={orgs.length > 0} onClick={() => setDialog('remove')}>Remove account</Button>
      </Action>

      {dialog === 'reset' && (
        <Modal title={revealed ? 'New password ready' : `Reset ${detail.name}'s password?`} subtitle={revealed ? undefined : 'They will need the new password to sign in.'} onClose={close}
          footer={revealed ? <><span className="flex-1" /><Button variant="primary" onClick={close}>Done</Button></>
            : <><Button variant="ghost" onClick={close}>Cancel</Button><span className="flex-1" /><Button variant="primary" disabled={busy} onClick={reset}>{busy ? 'Resetting…' : 'Reset password'}</Button></>}>
          {revealed ? <PasswordReveal email={revealed.email} password={revealed.password} /> : <p className="text-sm">A new temporary password is made and shown to you once. Send it to {detail.email} yourself.</p>}
        </Modal>
      )}

      {dialog === 'handover' && (
        <Modal size="md" title={revealed ? 'Company handed over' : 'Change company admin'} subtitle={revealed ? undefined : `${detail.name} hands ${orgs.map((o) => o.name).join(', ') || 'this company'} to a new person.`} onClose={close}
          footer={revealed ? <><span className="flex-1" /><Button variant="primary" onClick={close}>Done</Button></>
            : <><Button variant="ghost" onClick={close}>Cancel</Button><span className="flex-1" /><Button variant="primary" disabled={busy || !form.name.trim() || !form.email.trim()} onClick={handOver}>{busy ? 'Handing over…' : 'Hand over'}</Button></>}>
          {revealed ? (
            <div className="flex flex-col gap-3">
              {revealed.existing_account && <Banner tone="info">This person already worked in the company, so they keep their history. Their password is now the one below.</Banner>}
              <PasswordReveal email={revealed.email} password={revealed.password} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1"><span className="text-sm font-medium">New admin's name</span><Input autoFocus maxLength={255} value={form.name} onChange={set('name')} /></label>
                <label className="flex flex-col gap-1"><span className="text-sm font-medium">Mobile <span className="font-normal text-muted">(optional)</span></span><Input maxLength={20} value={form.mobile} onChange={set('mobile')} /></label>
              </div>
              <label className="flex flex-col gap-1"><span className="text-sm font-medium">New admin's email</span><Input type="email" maxLength={255} value={form.email} onChange={set('email')} />
                <span className="text-xs text-muted">Someone already in this company can be used; their account becomes the company admin.</span></label>
              <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <p className="text-sm font-medium">What happens to {detail.name}?</p>
                {[[false, 'Remove their access', 'They can no longer sign in. Their past work stays.'], [true, 'Keep them as a normal admin', 'They keep working in the company, without company admin rights.']].map(([value, title, text]) => (
                  <label key={title} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-subtle">
                    <input type="radio" name="keep-old" className="mt-1 accent-[rgb(var(--c-accent))]" checked={form.keep_old_as_admin === value} onChange={() => setForm({ ...form, keep_old_as_admin: value })} />
                    <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{text}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}

      {dialog === 'remove' && (
        <Modal title={`Remove ${detail.name}?`} subtitle="This cannot be undone." onClose={close}
          footer={<><Button variant="ghost" onClick={close}>Cancel</Button><span className="flex-1" /><Button variant="primary" className="!border-danger !bg-danger" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Remove account'}</Button></>}>
          <p className="text-sm">{detail.email} will be deleted. They can register again later if needed.</p>
        </Modal>
      )}
    </div>
  );
}
