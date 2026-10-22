import React, { useEffect, useMemo, useState } from 'react';
import { communications } from '../../services/api';
import { notify } from '../../services/feedback';
import { Banner, Button, Chip, Input, Segmented } from '../../ui';
import RecipientInput, { allValid } from './RecipientInput';
import { fillPlaceholders, placeholdersIn } from './templates';

// Values we can fill in without asking.
const knownValues = (task, user) => ({
  '[Client Name]': task?.client_name || '', '[Your Name]': user.name || '', '[Task Title]': task?.title || '',
  '[Team Member]': task?.assigned_to_name || '', '[Task/Feature]': task?.title || '', '[Task or feature]': task?.title || '',
});

export default function EmailComposer({ template, taskContext, onSent, onSaveTemplate }) {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState('write');
  const [fills, setFills] = useState({});
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!template) return;
    const known = knownValues(taskContext, user);
    setSubject(fillPlaceholders(template.subject || '', known));
    setBody(fillPlaceholders(template.body || '', known));
    setFills({}); setConfirming(false);
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(() => placeholdersIn(subject, body), [subject, body]);
  const applyFills = () => { setSubject(fillPlaceholders(subject, fills)); setBody(fillPlaceholders(body, fills)); setFills({}); };
  const clear = () => { setTo([]); setCc([]); setSubject(''); setBody(''); setFills({}); setConfirming(false); };

  const send = async (force = false) => {
    if (!to.length) { notify('Add at least one recipient.'); return; }
    if (!allValid([...to, ...cc])) { notify('Fix the email addresses shown in red.'); return; }
    if (!subject.trim() || !body.trim()) { notify('Add a subject and a message.'); return; }
    if (open.length && !force) { setConfirming(true); return; }
    setSending(true); setConfirming(false);
    try {
      await communications.send({ to: to.join(', '), cc: cc.join(', '), subject, text: body, task_id: taskContext?.id, template_name: template && template.id !== 'blank' ? template.name : undefined });
      notify(`Email sent to ${to.length === 1 ? to[0] : `${to.length} people`}.`, 'success');
      clear(); onSent();
    } catch (err) { notify(err.response?.data?.error || 'The email could not be sent.'); }
    finally { setSending(false); }
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">New email</h2>
          <p className="truncate text-xs text-muted">{template && template.id !== 'blank' ? `Template: ${template.name}` : 'Pick a template on the left or write from scratch.'}</p>
        </div>
        <Segmented label="Editor mode" value={mode} onChange={setMode} options={[['write', 'Write'], ['preview', 'Preview']]} />
      </div>
      {taskContext && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-info-soft/50 px-4 py-2 text-xs">
          <span className="font-semibold text-info">From task</span><span className="truncate font-medium">{taskContext.title}</span>
          <Chip>{(taskContext.issue_type || 'task').toUpperCase()}</Chip>
          {taskContext.client_name && <span className="text-muted">Client: <b className="text-ink">{taskContext.client_name}</b>. Add their email in To.</span>}
        </div>
      )}
      <RecipientInput id="mail-to" label="To" value={to} onChange={setTo} placeholder="client@company.com, press Enter after each" />
      {showCc ? <RecipientInput id="mail-cc" label="CC" value={cc} onChange={setCc} placeholder="Optional" />
        : <button type="button" className="border-b border-line px-4 py-1 text-left text-xs font-medium text-accent hover:underline" onClick={() => setShowCc(true)}>+ Add CC</button>}
      <div className="flex items-center gap-3 border-b border-line px-4 py-1.5">
        <label htmlFor="mail-subject" className="w-16 shrink-0 text-xs font-medium text-muted">Subject</label>
        <Input id="mail-subject" maxLength={200} className="border-0 bg-transparent px-0 font-medium focus:!shadow-none" placeholder="What is this email about?" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      {open.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-line bg-warn-soft/40 px-4 py-3">
          <p className="text-xs font-semibold text-warn">Fill in {open.length} blank{open.length === 1 ? '' : 's'} before sending</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((key) => <Input key={key} aria-label={key} placeholder={key.slice(1, -1)} className="py-1.5" value={fills[key] || ''} onChange={(e) => setFills({ ...fills, [key]: e.target.value })} />)}
          </div>
          <div><Button size="sm" disabled={!Object.values(fills).some(Boolean)} onClick={applyFills}>Fill in</Button></div>
        </div>
      )}
      {mode === 'write'
        ? <textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" className="min-h-[320px] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-muted focus:!shadow-none" />
        : <div className="min-h-[320px] flex-1 overflow-y-auto px-6 py-4"><p className="mb-3 text-sm font-semibold">{subject || '(no subject)'}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{body || 'Nothing to preview yet.'}</p></div>}
      {confirming && (
        <div className="px-4 pt-3"><Banner tone="warn" action={<span className="flex gap-2"><Button size="sm" onClick={() => setConfirming(false)}>Go back</Button><Button size="sm" variant="primary" onClick={() => send(true)}>Send anyway</Button></span>}>
          This email still contains {open.join(', ')}. The client will see the brackets.
        </Banner></div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
        <span className="text-xs text-muted">{body.length} characters · every sent email is saved in Sent history</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={clear}>Clear</Button>
          <Button disabled={!subject.trim() || !body.trim()} onClick={() => onSaveTemplate({ subject, body })}>Save as template</Button>
          <Button variant="primary" disabled={sending} onClick={() => send(false)}>{sending ? 'Sending…' : 'Send email'}</Button>
        </div>
      </div>
    </section>
  );
}
