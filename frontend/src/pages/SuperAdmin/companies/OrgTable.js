import React, { useState } from 'react';
import { EmptyState, Switch, Table, TableWrap, Td, Th } from '../../../ui';

const MODULES = [['timesheet', 'Timesheet'], ['hrms_login', 'Employee code login'], ['all_tasks', 'Show all tasks'], ['communications', 'Communications'], ['email_to_task', 'Email to task']];
const MODULE_HELP = {
  timesheet: 'Timesheet: time entries, locks and timesheet reports.',
  hrms_login: 'Employee code login: staff sign in with their HRMS employee code; the admin imports them from the HRMS sheet.',
  all_tasks: 'Show all tasks: the company admin can let everyone see and get every task, whatever their team.',
  communications: 'Communications: send emails to clients from GreenTask\'s own mail server. Off by default.',
  email_to_task: 'Email to task: emails to the organization\'s inbox become tasks. Set the inbox in the "Email to task" tab. Off by default.',
};

// Organizations of one company, with paid add-on modules that can be switched per organization.
export default function OrgTable({ orgs, onToggle }) {
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(null);
  if (!orgs.length) return <EmptyState title="No organizations yet">They are created when the company is approved and when the admin adds more.</EmptyState>;

  const copy = (org) => {
    navigator.clipboard?.writeText(org.company_code).then(() => { setCopied(org.id); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };
  const toggle = async (org, key, enabled) => {
    setBusy(`${org.id}-${key}`);
    try { await onToggle(org, key, enabled); } finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Modules are add-ons for one organization only — other companies do not change. Turning one off hides it for everyone in that organization; their data is kept.</p>
      <ul className="flex flex-col gap-0.5 text-xs text-muted">{MODULES.map(([key]) => <li key={key}>• {MODULE_HELP[key]}</li>)}</ul>
      <TableWrap>
        <Table>
          <thead><tr><Th>Organization</Th><Th>Company code</Th><Th align="right">Managers</Th><Th align="right">Staff</Th>{MODULES.map(([key, label]) => <Th key={key} align="center">{label}</Th>)}</tr></thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-t border-line transition-colors hover:bg-subtle/60">
                <Td><span className="font-medium">{org.name}</span></Td>
                <Td>
                  {org.company_code ? (
                    <button type="button" onClick={() => copy(org)} title="Copy code" className="rounded-md bg-subtle px-2 py-0.5 font-mono text-xs hover:text-accent">
                      {copied === org.id ? 'Copied ✓' : org.company_code}
                    </button>
                  ) : '—'}
                </Td>
                <Td align="right" mono>{org.manager_count || 0}</Td>
                <Td align="right" mono>{org.staff_count || 0}</Td>
                {MODULES.map(([key, label]) => {
                  const on = Boolean(org.modules?.[key]);
                  return <Td key={key} align="center"><span className="inline-flex"><Switch checked={on} disabled={busy === `${org.id}-${key}`} onChange={() => toggle(org, key, !on)} label={`${label} module for ${org.name}`} /></span></Td>;
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
