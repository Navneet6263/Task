import React, { useCallback, useEffect, useState } from 'react';
import { bugs } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, Textarea } from '../../ui';
import { STAGE_NAMES, STAGE_TONES } from './bugStages';

const BUTTONS = {
  ready: ['Move to Ready to pick', 'primary'],
  pick: ['Pick', 'primary'],
  fixed: ['Mark fixed', 'primary'],
  pass: ['Pass', 'primary'],
  fail: ['Fail', 'danger'],
  release: ['Give back', 'secondary'],
};
const NOTES = {
  fixed: { label: 'What did you fix?', placeholder: 'e.g. Safari blocked the payment window; it now opens in the same tab. Build 1.5.3', send: 'Send to QA' },
  fail: { label: 'What is still wrong?', placeholder: 'e.g. Still keeps loading on Safari 16.', send: 'Send back to the developer' },
};
const DONE = {
  ready: 'Moved to Ready to pick.', pick: 'Picked. This bug is yours now.', release: 'Given back to the queue.',
  fixed: 'Sent to QA to check.', pass: 'Passed and closed.', fail: 'Sent back to the developer.',
};

// Where the bug is in its flow, and the buttons this person gets. The server decides the buttons
// and checks them again, so a stale window can never skip a step.
export default function BugStageBar({ task, onChanged }) {
  const [info, setInfo] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => bugs.get(task.id).then((r) => setInfo(r.data)).catch(() => setInfo(false)), [task.id]);
  useEffect(() => { load(); }, [load, task.version]);

  if (info === null) return <p className="text-sm text-muted">Loading the bug stage…</p>;
  if (info === false) return null;

  const run = async (action) => {
    if (NOTES[action] && noteFor !== action) { setNoteFor(action); setNote(''); return; }
    if (NOTES[action] && !note.trim()) { notify(action === 'fixed' ? 'Write a line about what you fixed.' : 'Write what is still wrong.'); return; }
    setBusy(true);
    try {
      await bugs.act(task.id, action, note.trim());
      setNoteFor(null); setNote('');
      notify(DONE[action], 'success');
      onChanged?.();
    } catch (err) {
      notify(err.response?.data?.error || 'Could not update the bug. Please try again.');
      load();
    } finally { setBusy(false); }
  };

  const now = info.stages.findIndex((s) => s.key === info.stage);
  const hint = {
    new: 'Waiting for QA or the team leader to check it.',
    ready: 'Waiting for a developer to pick it.',
    fixing: `${task.assigned_to_name || 'The developer'} is fixing it.`,
    qa: `${info.qa_name || 'QA'} checks the fix next.`,
    done: 'Checked and closed by QA.',
  }[info.stage];
  const form = noteFor && NOTES[noteFor];

  return (
    <section aria-label="Bug stage" className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-1">
        <Chip tone={STAGE_TONES[info.stage]}>{STAGE_NAMES[info.stage]}</Chip>
        {info.reopen_count > 0 && <Chip tone="danger">Reopened {info.reopen_count}x</Chip>}
      </div>
      <ol className="flex gap-1" aria-label="Bug stages">
        {info.stages.map((s, i) => (
          <li key={s.key} title={s.name} className={`h-1.5 flex-1 rounded-full ${i <= now ? 'bg-accent' : 'bg-line'}`}>
            <span className="sr-only">{s.name}{i === now ? ' (now)' : ''}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">{hint}</p>
      {info.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {info.actions.map((action) => (
            <Button key={action} size="sm" variant={BUTTONS[action][1]} disabled={busy} aria-pressed={noteFor === action ? true : undefined} onClick={() => run(action)}>
              {BUTTONS[action][0]}
            </Button>
          ))}
        </div>
      )}
      {form && (
        <div className="flex flex-col gap-2">
          <label htmlFor="bug-note" className="text-sm font-semibold">{form.label}</label>
          <Textarea id="bug-note" autoFocus rows={3} maxLength={2000} placeholder={form.placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant={noteFor === 'fail' ? 'danger' : 'primary'} disabled={busy || !note.trim()} onClick={() => run(noteFor)}>{form.send}</Button>
            <Button size="sm" disabled={busy} onClick={() => setNoteFor(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {!info.team_has_roles && info.is_lead && (
        <p className="text-xs text-muted">Tip: mark who is Developer and who is QA in this space's People tab. Until then, anyone in the team can do every step.</p>
      )}
    </section>
  );
}
