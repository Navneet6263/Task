import React, { useState } from 'react';
import { teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, EmptyRow, Input, Table, TableWrap, Td, Th } from '../../ui';
import { Avatar, TEAM_ROLES, errorOf } from './shared';

function RoleCell({ team, member, canManage, onChanged }) {
  const [value, setValue] = useState(member.team_role || 'Member');
  const [saving, setSaving] = useState(false);
  if (!canManage || member.is_reporting_manager) return <span className="text-sm">{member.team_role || 'Member'}</span>;
  const save = async () => {
    const next = value.trim() || 'Member';
    if (next === (member.team_role || 'Member')) return;
    setSaving(true);
    try { await teams.updateMemberRole(team.id, member.id, next); notify(`${member.name} is now ${next}.`, 'success'); onChanged(); }
    catch (err) { notify(errorOf(err, 'Could not change the role.')); setValue(member.team_role || 'Member'); }
    finally { setSaving(false); }
  };
  return (
    <>
      <Input aria-label={`Team role of ${member.name}`} list="team-roles" maxLength={60} disabled={saving} className="!w-44 py-1 text-xs" value={value}
        onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <datalist id="team-roles">{TEAM_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
    </>
  );
}

export default function MembersTable({ team, members, canManage, onChanged }) {
  const [removing, setRemoving] = useState(null);
  const maxLoad = Math.max(5, ...members.map((m) => Number(m.current_tasks || 0)));
  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.name} from ${team.name}? Their tasks stay in the team.`)) return;
    setRemoving(member.id);
    try { await teams.removeMember(team.id, member.id); notify(`${member.name} removed.`, 'success'); onChanged(); }
    catch (err) { notify(errorOf(err, 'Could not remove this member.')); }
    finally { setRemoving(null); }
  };

  return (
    <TableWrap>
      <Table>
        <thead><tr>
          <Th>Member</Th><Th>Team role</Th><Th className="w-[22%]">Workload</Th><Th align="right">Overdue</Th><Th align="right">Done (30d)</Th>{canManage && <Th><span className="sr-only">Actions</span></Th>}
        </tr></thead>
        <tbody>
          {members.map((member) => {
            const load = Number(member.current_tasks || 0);
            const heavy = load >= Math.max(8, maxLoad * 0.8);
            return (
              <tr key={member.id} className="group hover:bg-subtle">
                <Td className="align-middle">
                  <span className="flex items-center gap-3">
                    <Avatar name={member.name} id={member.id} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold">{member.name}{member.is_reporting_manager && <Chip tone="ok">Manager</Chip>}</span>
                      <span className="block truncate text-xs text-muted">{member.email}</span>
                    </span>
                  </span>
                </Td>
                <Td className="align-middle"><RoleCell key={member.team_role} team={team} member={member} canManage={canManage} onChanged={onChanged} /></Td>
                <Td className="align-middle">
                  <div className="flex items-center gap-2" title={`${load} open tasks`}>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"><div className={`h-full rounded-full ${heavy ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${(load / maxLoad) * 100}%` }} /></div>
                    <span className="w-16 text-right font-mono text-xs">{load} open</span>
                  </div>
                </Td>
                <Td align="right" mono className={`align-middle ${Number(member.overdue_tasks) ? 'font-semibold text-danger' : 'text-muted'}`}>{member.overdue_tasks || 0}</Td>
                <Td align="right" mono className="align-middle">{member.done_30d || 0}</Td>
                {canManage && (
                  <Td align="right" className="align-middle">
                    {!member.is_reporting_manager && <Button size="sm" variant="danger" className="opacity-60 group-hover:opacity-100" disabled={removing === member.id} onClick={() => remove(member)}>Remove</Button>}
                  </Td>
                )}
              </tr>
            );
          })}
          {!members.length && <EmptyRow colSpan={canManage ? 6 : 5}>No members yet. Add people from the panel on the right.</EmptyRow>}
        </tbody>
      </Table>
    </TableWrap>
  );
}
