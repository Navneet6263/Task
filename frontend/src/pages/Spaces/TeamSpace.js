import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { bugs, teams } from '../../services/api';
import { writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import { Button, Chip, EmptyState, Loading, Select } from '../../ui';
import useBugTracking from '../../components/bugs/useBugTracking';
import { ROLE_NAMES } from '../../components/bugs/bugStages';
import { useSpaces, visitSpace } from '../../components/shell/spaces';
import { PlusIcon, StarIcon } from '../../components/shell/icons';
import { adminIdentity } from '../AdminPanel/adminShared';
import TeamSharing from '../TeamManagement/TeamSharing';
import SpaceSummary from './SpaceSummary';
import SpaceCalendar from './SpaceCalendar';
import UserAvatar from '../../components/account/UserAvatar';
import TeamPhoto from '../../components/shell/TeamPhoto';
import PersonHoverCard from '../../components/people/PersonHoverCard';

const Dashboard = lazy(() => import('../Dashboard/index'));
const BugBoard = lazy(() => import('./BugBoard'));

const TABS = [['summary', 'Summary'], ['board', 'Board'], ['list', 'List'], ['timeline', 'Timeline'], ['calendar', 'Calendar'], ['people', 'People']];

const byUser = (data) => ({ by: Object.fromEntries((data?.roles || []).map((r) => [r.user_id, r.work_role])), canEdit: Boolean(data?.can_edit) });

function People({ team, members, meId }) {
  // Bug tracking: who picks and fixes bugs (Developer) and who checks the fixes (QA) in this team.
  const bugFlowOn = useBugTracking();
  const [roles, setRoles] = useState(null);
  useEffect(() => {
    if (!bugFlowOn) return undefined;
    let alive = true;
    bugs.roles(team.id).then((r) => { if (alive) setRoles(byUser(r.data)); }).catch(() => {});
    return () => { alive = false; };
  }, [bugFlowOn, team.id]);
  const setRole = async (person, role) => {
    try {
      setRoles(byUser((await bugs.setRole(team.id, person.id, role)).data));
      notify(role ? `${person.name} is now ${ROLE_NAMES[role]} in ${team.name}.` : `${person.name} has no bug role now.`, 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not save. Please try again.'); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {members.length} {members.length === 1 ? 'person' : 'people'} work in {team.name}.
          {roles && ' For bugs: Developers pick and fix them, QA checks each fix.'}
        </p>
        <Link to="/team" onClick={() => writePreference('team-management-selected', team.id)} className="text-sm font-semibold text-accent hover:underline">Manage people in Team Management →</Link>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <PersonHoverCard person={m} canMeet={String(m.id) !== String(meId)}>
              <span tabIndex={0} className="block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/40" aria-label={`About ${m.name}`}>
                <UserAvatar name={m.name} src={m.avatar} size="h-10 w-10 text-sm" />
              </span>
            </PersonHoverCard>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate font-semibold">{m.name}{m.is_reporting_manager && <Chip tone="ok">Leader</Chip>}</span>
              <span className="block truncate text-xs text-muted">{m.team_role || 'Member'}{m.shared_from_name ? ` · via ${m.shared_from_name}` : ''}</span>
              {roles && (roles.canEdit ? (
                <Select aria-label={`Bug role of ${m.name}`} className="mt-1.5 !w-auto py-1 text-xs" value={roles.by[m.id] || ''} onChange={(e) => setRole(m, e.target.value)}>
                  <option value="">No bug role</option>
                  {Object.entries(ROLE_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              ) : roles.by[m.id] ? <span className="mt-1 block"><Chip tone="info">{ROLE_NAMES[roles.by[m.id]]}</Chip></span> : null)}
            </span>
            <span className="text-right text-xs"><span className="block font-mono font-semibold">{Number(m.current_tasks || 0)}</span><span className="text-muted">open</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A team's space, Jira-style: one header, and every way to look at its work behind tabs.
export default function TeamSpace() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { spaces, isStarred, toggleStar, reload: reloadSpaces } = useSpaces();
  const [members, setMembers] = useState([]);
  const [createSignal, setCreateSignal] = useState(0);
  // The Bugs tab exists only where the bug tracking module is on.
  const bugFlowOn = useBugTracking();
  const tabs = bugFlowOn ? [...TABS.slice(0, 3), ['bugs', 'Bugs'], ...TABS.slice(3)] : TABS;
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'summary';
  const team = (spaces || []).find((t) => String(t.id) === String(teamId));
  const { isCompanyAdmin, isOrgAdmin, user } = adminIdentity();
  const canEditTeam = isCompanyAdmin || isOrgAdmin || user.role === 'manager';

  useEffect(() => { if (team) visitSpace(team.id); }, [team]);
  useEffect(() => { teams.getMembers(teamId).then((r) => setMembers(Array.isArray(r.data) ? r.data : [])).catch(() => setMembers([])); }, [teamId]);
  // "Open full form" from the Create window lands here with ?create=1.
  useEffect(() => {
    if (params.get('create') !== '1') return;
    const next = new URLSearchParams(params); next.delete('create'); next.set('tab', 'list');
    setParams(next, { replace: true }); setCreateSignal(Date.now());
  }, [params, setParams]);

  const go = (next) => { const p = new URLSearchParams(params); p.set('tab', next); setParams(p); };
  const copyLink = () => navigator.clipboard?.writeText(window.location.href).then(() => notify('Space link copied.', 'success')).catch(() => {});
  const create = () => { if (!['board', 'list', 'timeline'].includes(tab)) go('list'); setCreateSignal(Date.now()); };

  if (spaces === null) return <Loading>Opening the space…</Loading>;
  if (!team) return <EmptyState title="Space not found" action={<Button onClick={() => navigate('/spaces')}>See all spaces</Button>}>It may have been removed, or you are not in this team.</EmptyState>;
  const workTab = ['board', 'list', 'timeline'].includes(tab);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <header className="flex flex-col gap-3 border-b border-line pb-0">
        <nav aria-label="Breadcrumb" className="text-xs text-muted"><Link to="/spaces" className="hover:text-accent hover:underline">Spaces</Link> <span aria-hidden="true">/</span> {team.name}</nav>
        <div className="flex flex-wrap items-center gap-3">
          <TeamPhoto team={team} size="h-10 w-10 text-sm" canEdit={canEditTeam} compact onChanged={reloadSpaces} />
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-bold tracking-tight">{team.name}</h1>
            <p className="text-xs text-muted">{team.type || 'General'} space · {members.length} people</p>
          </div>
          <button type="button" onClick={() => toggleStar(team.id)} aria-pressed={isStarred(team.id)} title={isStarred(team.id) ? 'Remove from starred' : 'Star this space'}
            className={`grid h-8 w-8 place-items-center rounded-md hover:bg-subtle ${isStarred(team.id) ? 'text-warn' : 'text-muted'}`}><StarIcon size={16} filled={isStarred(team.id)} /></button>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden -space-x-2 sm:flex" aria-label={`${members.length} people`}>
              {members.slice(0, 5).map((m) => <span key={m.id} title={m.name} className="rounded-full border-2 border-surface"><UserAvatar name={m.name} src={m.avatar} size="h-7 w-7 text-[10px]" /></span>)}
              {members.length > 5 && <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-subtle text-[11px] font-bold text-muted">+{members.length - 5}</span>}
            </div>
            <Button size="sm" onClick={copyLink}>Share</Button>
            <Button size="sm" variant="primary" onClick={create}><PlusIcon size={14} />Create</Button>
          </div>
        </div>
        <div role="tablist" aria-label="Space views" className="-mb-px flex gap-1 overflow-x-auto">
          {[...tabs, ...(isCompanyAdmin || isOrgAdmin ? [['sharing', 'Sharing']] : [])].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => go(key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
          ))}
        </div>
      </header>

      {tab === 'summary' && <SpaceSummary teamId={team.id} onGo={go} />}
      {workTab && <Suspense fallback={<Loading>Loading tasks…</Loading>}><Dashboard space={{ teamId: team.id, view: tab, createSignal }} /></Suspense>}
      {tab === 'bugs' && <Suspense fallback={<Loading>Loading bugs…</Loading>}><BugBoard team={team} /></Suspense>}
      {tab === 'calendar' && <SpaceCalendar teamId={team.id} />}
      {tab === 'people' && <People team={team} members={members} meId={user.id} />}
      {tab === 'sharing' && <TeamSharing team={team} allTeams={spaces} canEdit onChanged={() => {}} />}
    </div>
  );
}
