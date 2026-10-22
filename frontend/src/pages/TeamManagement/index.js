import React, { useCallback, useEffect, useState } from 'react';
import { teams } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import { Button, EmptyState, ErrorText, Loading, PageHeader, StatTile } from '../../ui';
import TeamList from './TeamList';
import MembersTable from './MembersTable';
import AddMembers from './AddMembers';
import TeamFormModal from './TeamFormModal';
import { canManageTeams, errorOf } from './shared';

export default function TeamManagement() {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canManage = canManageTeams(user.role);
  const [teamList, setTeamList] = useState(null);
  const [selectedId, setSelectedId] = useState(() => readPreference('team-management-selected', null));
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // 'create' or a team to edit

  const loadTeams = useCallback(async (preferId) => {
    try {
      const response = await teams.getAll();
      setTeamList(response.data);
      setSelectedId((current) => {
        const wanted = preferId ?? current;
        return response.data.some((t) => String(t.id) === String(wanted)) ? wanted : response.data[0]?.id ?? null;
      });
      setError('');
    } catch (err) { setError(errorOf(err, 'Could not load teams.')); setTeamList([]); }
  }, []);
  useEffect(() => { loadTeams(); }, [loadTeams]);

  const loadMembers = useCallback(async () => {
    if (!selectedId) { setMembers([]); return; }
    setMembersLoading(true);
    try { setMembers((await teams.getMembers(selectedId)).data); }
    catch (err) { notify(errorOf(err, 'Could not load members.')); setMembers([]); }
    finally { setMembersLoading(false); }
  }, [selectedId]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const select = (id) => { setSelectedId(id); writePreference('team-management-selected', id); };
  const refresh = () => { loadMembers(); loadTeams(); };
  const team = teamList?.find((t) => String(t.id) === String(selectedId));
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(team.team_code); notify('Join code copied.', 'success'); }
    catch { window.prompt('Copy this join code', team.team_code); }
  };
  const totals = members.reduce((acc, m) => ({ open: acc.open + Number(m.current_tasks || 0), overdue: acc.overdue + Number(m.overdue_tasks || 0), done: acc.done + Number(m.done_30d || 0) }), { open: 0, overdue: 0, done: 0 });

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Teams" subtitle="Who works together, what each person is carrying, and how to bring new people in."
        actions={canManage && <Button variant="primary" onClick={() => setForm('create')}>+ New team</Button>} />
      <ErrorText onRetry={() => loadTeams()}>{error}</ErrorText>
      {teamList === null && <Loading>Loading teams…</Loading>}
      {teamList && !teamList.length && (
        <EmptyState title="No teams yet" action={canManage && <Button variant="primary" onClick={() => setForm('create')}>Create your first team</Button>}>
          {canManage ? 'Create a team, then add people from your organization.' : 'Ask your admin to add you to a team.'}
        </EmptyState>
      )}
      {teamList?.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <TeamList teams={teamList} selectedId={selectedId} onSelect={select} />
          {team && (
            <div className="flex min-w-0 flex-col gap-4">
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">{team.type || 'General'} team</p>
                  <h2 className="truncate text-xl font-bold">{team.name}</h2>
                  <p className="text-xs text-muted">Created by {team.creator_name || '—'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {team.team_code && (
                    <button type="button" onClick={copyCode} title="Copy join code" className="flex items-center gap-2 rounded-md border border-dashed border-accent/60 bg-accent-soft px-3 py-1.5 text-sm">
                      <span className="text-xs text-muted">Join code</span><span className="font-mono font-semibold text-accent">{team.team_code}</span><span className="text-[10px] font-semibold uppercase text-accent">Copy</span>
                    </button>
                  )}
                  {canManage && <Button onClick={() => setForm(team)}>Edit team</Button>}
                </div>
              </section>
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Members" value={members.length} />
                <StatTile label="Open tasks" value={totals.open} />
                <StatTile label="Overdue" value={totals.overdue} />
                <StatTile label="Done in 30 days" value={totals.done} />
              </section>
              <div className={`grid grid-cols-1 gap-4 ${canManage ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
                <div className="min-w-0">{membersLoading && !members.length ? <Loading>Loading members…</Loading> : <MembersTable team={team} members={members} canManage={canManage} onChanged={refresh} />}</div>
                {canManage && <AddMembers team={team} onAdded={refresh} />}
              </div>
            </div>
          )}
        </div>
      )}
      {form && <TeamFormModal team={form === 'create' ? null : form} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); select(id); loadTeams(id); }} />}
    </div>
  );
}
