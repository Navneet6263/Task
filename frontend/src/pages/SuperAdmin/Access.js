import React, { useState } from 'react';
import { Banner, Button, Chip, EmptyState, Input, Modal } from '../../ui';
import { dateLabel, dateTimeLabel, initials, timeAgo } from './consoleUtils';

function statusOf(user) {
  if (user.has_password) return [<Chip key="s" tone="ok">Active</Chip>, user.last_login_at ? `Last sign-in ${timeAgo(user.last_login_at)}` : 'Has not signed in yet'];
  if (user.invite_valid) return [<Chip key="s" tone="info">Invite sent</Chip>, `Setup link expires ${dateTimeLabel(user.invite_expires_at)}`];
  return [<Chip key="s" tone="danger">Link expired</Chip>, 'Send a new setup link so they can sign in'];
}

// Master admin only: give, refresh or remove console access for helpers.
export default function Access({ sa }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [shareLink, setShareLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const active = sa.subUsers.filter((u) => u.is_active);
  const removed = sa.subUsers.filter((u) => !u.is_active);

  const afterInvite = (result, who) => { if (result && result.invite_sent === false && result.setup_url) setShareLink({ url: result.setup_url, email: who }); };
  const add = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy('add');
    const result = await sa.actions.addSubUser(email.trim(), name.trim());
    if (result) { afterInvite(result, email.trim()); setEmail(''); setName(''); }
    setBusy('');
  };
  const confirmAction = async () => {
    setBusy('confirm');
    const { kind, user } = confirm;
    const result = kind === 'remove' ? await sa.actions.removeSubUser(user) : await sa.actions.resendInvite(user);
    if (result) { setConfirm(null); if (kind !== 'remove') afterInvite(result, user.email); }
    setBusy('');
  };
  const copy = () => navigator.clipboard?.writeText(shareLink.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  const CONFIRM = {
    remove: ['Remove access?', 'They are signed out on their next click and can no longer sign in.', 'Remove access', true],
    reset: ['Reset their password?', 'Their current password stops working right away. They get an email with a new setup link.', 'Reset password', true],
    invite: ['Send a new setup link?', 'Any earlier link stops working. The new one is valid for 48 hours.', 'Send link', false],
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-xl border border-line bg-surface">
        <header className="border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">People with console access</h2><p className="text-xs text-muted">{active.length + 1} including you</p>
        </header>
        <ul>
          <li className="flex items-center gap-3 border-b border-line px-5 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">{initials(sa.me.name || sa.me.email)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{sa.me.name || 'You'}</span><span className="block truncate text-xs text-muted">{sa.me.email}</span></span>
            <Chip tone="ok">Master</Chip>
          </li>
          {active.map((user, i) => {
            const [chip, detail] = statusOf(user);
            return (
              <li key={user.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0 motion-safe:animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-subtle text-xs font-bold text-muted">{initials(user.name || user.email)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{user.name || user.email}</span>{chip}</span>
                  <span className="block truncate text-xs text-muted">{user.email} · added {dateLabel(user.created_at)} · {detail}</span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" onClick={() => setConfirm({ kind: user.has_password ? 'reset' : 'invite', user })}>{user.has_password ? 'Reset password' : 'Send new link'}</Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'remove', user })}>Remove</Button>
                </span>
              </li>
            );
          })}
        </ul>
        {!active.length && <div className="p-5"><EmptyState title="Only you have access">Add a helper on the right to share the approval work.</EmptyState></div>}
        {removed.length > 0 && <p className="border-t border-line px-5 py-2.5 text-xs text-muted">{removed.length} removed {removed.length === 1 ? 'person' : 'people'} can no longer sign in.</p>}
      </section>

      <div className="flex flex-col gap-4">
        <form onSubmit={add} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <div><h2 className="text-[15px] font-semibold">Give access</h2><p className="text-xs text-muted">They can approve companies, change limits and modules, and see activity. Only you can manage access.</p></div>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Email</span><Input type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Name <span className="font-normal text-muted">(optional)</span></span><Input maxLength={120} placeholder="Their full name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <Button type="submit" variant="primary" disabled={Boolean(busy) || !email.trim()}>{busy === 'add' ? 'Sending invite…' : 'Send invite'}</Button>
        </form>
        <div className="rounded-xl border border-line bg-surface p-5 text-sm">
          <p className="font-semibold">How helpers sign in</p>
          <ol className="mt-2 flex flex-col gap-2 text-muted">
            {['They get an email with a setup link (valid 48 hours, works once).', 'They choose their own password — you never see it.', 'Every sign-in needs that password and a 6-digit code sent to their email.', '5 wrong passwords lock the account for 15 minutes.'].map((step, i) => (
              <li key={step} className="flex gap-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{i + 1}</span>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      {confirm && (() => {
        const [title, text, action, danger] = CONFIRM[confirm.kind];
        return (
          <Modal title={title} subtitle={confirm.user.name ? `${confirm.user.name} · ${confirm.user.email}` : confirm.user.email} onClose={() => setConfirm(null)}
            footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><span className="flex-1" />
              <Button variant="primary" className={danger ? '!border-danger !bg-danger' : ''} disabled={Boolean(busy)} onClick={confirmAction}>{busy ? 'Working…' : action}</Button></>}>
            <p className="text-sm text-muted">{text}</p>
          </Modal>
        );
      })()}

      {shareLink && (
        <Modal title="Share the setup link" subtitle={`The invite email to ${shareLink.email} could not be sent.`} onClose={() => setShareLink(null)}
          footer={<><span className="flex-1" /><Button variant="primary" onClick={() => setShareLink(null)}>Done</Button></>}>
          <Banner tone="warn">Send this link privately (not in a group chat). Anyone with it can set the password. It works once and expires in 48 hours.</Banner>
          <div className="flex gap-2">
            <Input readOnly value={shareLink.url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
