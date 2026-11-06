import React, { useState } from 'react';
import { setAccessRole, teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, EmptyRow, Input, Select, Table, TableWrap, Td, Th } from '../../ui';
import { Avatar, TEAM_ROLES, errorOf } from './shared';

// In the team only because another team shares in; managed from Team sharing, not here.
const shared = (member) => Boolean(member.auto_added && member.shared_from_team_id);

const ACCESS = [['person', 'Member'], ['manager', 'Manager'], ['admin', 'Admin']];
const ACCESS_LABEL = Object.fromEntries(ACCESS);

// What someone can do in the whole organization. Admins change it right here.
function AccessCell({ member, team, admin, onChanged }) {
  const [saving, setSaving] = useState(false);
  if (!admin || Number(member.id) === Number(admin.selfId)) return <span className="text-sm">{ACCESS_LABEL[member.role] || member.role}</span>;
  const change = async (next) => {
    if (next === 'person' && member.is_reporting_manager && !window.confirm(`${member.name} leads ${team.name}. As a member they stop leading every team. Continue?`)) return;
    setSaving(true);
    try { await setAccessRole(admin.isCompanyAdmin, member.id, next); notify(`${member.name} is now ${ACCESS_LABEL[next].toLowerCase()}.`, 'success'); onChanged(); }
    catch (err) { notify(errorOf(err, 'Could not change access.')); }
    finally { setSaving(false); }
  };
  return (
    <Select aria-label={`Access of ${member.name}`} className="!w-auto py-1 text-xs" disabled={saving} value={member.role} onChange={(e) => change(e.target.value)}>
      {ACCESS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
  );
}

function RoleCell({ team, member, canManage, onChanged }) {
  const [value, setValue] = useState(member.team_role || 'Member');
  const [saving, setSaving] = useState(false);
  if (!canManage) return <span className="text-sm">{member.team_role || 'Member'}</span>;
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

export default function MembersTable({ team, members, canManage, admin, onChanged }) {
  const [removing, setRemoving] = useState(null);
  const [leading, setLeading] = useState(null);
  const makeLeader = async (member) => {
    const raise = member.role === 'person' ? ` They become a manager so they can run it.` : '';
    if (!window.confirm(`Make ${member.name} the leader of ${team.name}?${raise}`)) return;
    setLeading(member.id);
    try { await teams.setLeader(team.id, member.id); notify(`${member.name} now leads ${team.name}.`, 'success'); onChanged(); }
    catch (err) { notify(errorOf(err, 'Could not change the team leader.')); }
    finally { setLeading(null); }
  };
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
          <Th>Member</Th><Th>Team role</Th><Th>Access</Th><Th className="w-[20%]">Workload</Th><Th align="right">Overdue</Th><Th align="right">Done (30d)</Th>{canManage && <Th><span className="sr-only">Actions</span></Th>}
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
                      <span className="flex items-center gap-1.5 font-semibold">{member.name}{member.is_reporting_manager && <Chip tone="ok">Team leader</Chip>}{shared(member) && <Chip tone="info">Via {member.shared_from_name || 'shared team'}</Chip>}</span>
                      <span className="block truncate text-xs text-muted">{member.email}</span>
                    </span>
                  </span>
                </Td>
                <Td className="align-middle"><RoleCell key={member.team_role} team={team} member={member} canManage={canManage} onChanged={onChanged} /></Td>
                <Td className="align-middle"><AccessCell key={member.role} member={member} team={team} admin={admin} onChanged={onChanged} /></Td>
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
                    {shared(member) ? <span className="text-xs text-muted" title="Comes from team sharing. Change it under Team sharing.">Shared</span> : <span className="flex justify-end gap-1.5">
                      {admin && !member.is_reporting_manager && <Button size="sm" className="opacity-60 group-hover:opacity-100" disabled={leading === member.id} onClick={() => makeLeader(member)}>{leading === member.id ? 'Saving…' : 'Make leader'}</Button>}
                      {(admin || !member.is_reporting_manager) && <Button size="sm" variant="danger" className="opacity-60 group-hover:opacity-100" disabled={removing === member.id} onClick={() => remove(member)}>Remove</Button>}
                    </span>}
                  </Td>
                )}
              </tr>
            );
          })}
          {!members.length && <EmptyRow colSpan={canManage ? 7 : 6}>No members yet. Add people from the panel on the right.</EmptyRow>}
        </tbody>
      </Table>
    </TableWrap>
  );
}
