import React, { useState } from 'react';
import { hrms } from '../../services/api';
import { notify } from '../../services/feedback';
import { Card, Switch } from '../../ui';
import Section from './Section';

// Settings → Task visibility: let everyone in the company see and get every task, whatever their team.
export default function TaskVisibilitySection({ status, onChange }) {
  const [on, setOn] = useState(Boolean(status.show_all_tasks));
  const [busy, setBusy] = useState(false);

  const toggle = async (next) => {
    const message = next
      ? 'Show all tasks to everyone? Every person in this company will see every team\'s tasks and can be given any task.'
      : 'Go back to team-only tasks? People will again see only the tasks of teams they belong to.';
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await hrms.saveSettings({ show_all_tasks: next });
      setOn(next);
      onChange?.(next);
      notify(next ? 'Everyone can now see all tasks.' : 'Back to team-only tasks.', 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not change this setting.'); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Task visibility" description="Choose who sees which tasks in this company.">
      <Card className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-semibold">Show all tasks to everyone</p>
          <p className="mt-1 text-sm text-muted">
            {on
              ? 'On — everyone sees every team\'s tasks and anyone can be given any task. New people and new teams are included automatically.'
              : 'Off — people see only the tasks of the teams they are in. Admins always see everything.'}
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Managers and reporting lines stay the same.</li>
            <li>Turning it off removes only the extra access; people keep the teams they were added to and any team where they have tasks.</li>
          </ul>
        </div>
        <Switch checked={on} disabled={busy} onChange={toggle} label="Show all tasks to everyone" />
      </Card>
    </Section>
  );
}
