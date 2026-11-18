import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { bugs, tasks } from '../../services/api';
import { notify } from '../../services/feedback';
import { Banner, Button, Chip, ErrorText, Input, Loading, Segmented, StatTile } from '../../ui';
import UserAvatar from '../../components/account/UserAvatar';
import { TaskExtrasProvider, useTaskMeta } from '../../components/taskExtras/taskExtrasStore';
import TaskDetailModal from '../Dashboard/TaskDetailModal';

const SEVERITY = { CRITICAL: ['Critical', 'danger'], HIGH: ['High', 'warn'], MEDIUM: ['Medium', 'neutral'], LOW: ['Low', 'neutral'] };
const HINTS = {
  new: 'QA or the team leader checks these first.',
  ready: 'Developers take the top one.',
  fixing: 'Each developer has at most 3 here.',
  qa: 'Waiting for QA to check the fix.',
};
const severityOf = (bug) => String(bug.severity || '').toUpperCase();
const errorOf = (err, fallback) => err?.response?.data?.error || fallback;

function BugCard({ bug, stage, keyOf, onOpen, pick }) {
  const [label, tone] = SEVERITY[severityOf(bug)] || [];
  return (
    <article className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2.5 hover:border-muted">
      <button type="button" onClick={onOpen} className="flex flex-col gap-1 text-left" title="Open this bug">
        <span className="font-mono text-[11px] text-muted">{keyOf(bug.id)}{bug.affected_module ? ` · ${bug.affected_module}` : ''}</span>
        <span className="text-sm font-semibold leading-snug">{bug.title}</span>
      </button>
      <div className="flex flex-wrap items-center gap-y-1">
        {label && <Chip tone={tone}>{label}</Chip>}
        {bug.reopen_count > 0 && <Chip tone="danger">Reopened {bug.reopen_count}x</Chip>}
        {stage === 'qa' && bug.qa_user_name && <Chip tone="info">QA: {bug.qa_user_name.split(' ')[0]}</Chip>}
        <span className="ml-auto" title={bug.assigned_to_name || 'Nobody yet'}>
          {bug.assigned_to_name ? <UserAvatar name={bug.assigned_to_name} src={bug.assigned_to_avatar} size="h-6 w-6 text-[10px]" /> : <span className="text-[11px] text-muted">Nobody yet</span>}
        </span>
      </div>
      {pick && (
        <Button size="sm" variant="primary" disabled={pick.disabled} title={pick.title} onClick={pick.run}>Pick</Button>
      )}
    </article>
  );
}

// A team's bugs by stage (bug tracking module). Cards open the same task window as everywhere else;
// Pick works right on the card, every other step is in the task window with its note.
export default function BugBoard({ team }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [whose, setWhose] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sheetTab, setSheetTab] = useState('details');
  const { keyOf } = useTaskMeta();

  const load = useCallback(() => bugs.board(team.id)
    .then((r) => { setData(r.data); setError(''); })
    .catch((err) => setError(errorOf(err, 'Could not load the bugs. Please try again.'))), [team.id]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!data) return null;
    const q = search.trim().toLowerCase();
    const me = Number(data.me.id);
    const keep = (b) => (severity === 'all' || (severityOf(b) || 'MEDIUM') === severity)
      && (whose === 'all' || Number(b.assigned_to) === me || Number(b.qa_user_id) === me)
      && (!q || b.title.toLowerCase().includes(q) || keyOf(b.id).toLowerCase().includes(q));
    return Object.fromEntries(Object.entries(data.columns).map(([key, list]) => [key, list.filter(keep)]));
  }, [data, search, severity, whose, keyOf]);

  const open = async (id) => {
    try { setSelected((await tasks.getDetail(id)).data); setSheetTab('details'); }
    catch (err) { notify(errorOf(err, 'Could not open this bug.')); }
  };
  const pickBug = async (bug) => {
    setBusyId(bug.id);
    try { await bugs.act(bug.id, 'pick'); notify(`${keyOf(bug.id)} is yours now.`, 'success'); }
    catch (err) { notify(errorOf(err, 'Could not pick this bug. Please try again.')); }
    finally { setBusyId(null); load(); }
  };
  // The task window closes with null: show what changed while it was open.
  const setSelectedTask = (next) => { setSelected(next); if (next === null) load(); };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bug?')) return;
    try {
      const res = await tasks.delete(id);
      if (res.data?.message === 'Delete request sent to the task creator') notify('Delete request sent to the task creator.');
      setSelectedTask(null);
    } catch (err) { notify(errorOf(err, 'Action failed. Please retry.')); }
  };
  const handleApproveDelete = async (id) => {
    if (!window.confirm('Approve deletion of this bug?')) return;
    try { await tasks.approveDelete(id); setSelectedTask(null); } catch (err) { notify(errorOf(err, 'Action failed. Please retry.')); }
  };
  const handleRejectDelete = async (id) => {
    try { await tasks.rejectDelete(id); setSelected((prev) => prev && { ...prev, delete_requested_by: null, delete_requested_by_name: null }); load(); }
    catch (err) { notify(errorOf(err, 'Action failed. Please retry.')); }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Loading>Loading bugs…</Loading>;
  const { me } = data;
  const full = me.fixing >= me.wip_limit;
  const pickFor = (bug) => (me.can_pick ? {
    disabled: busyId === bug.id || full,
    title: full ? `You already have ${me.wip_limit} bugs in Fixing. Finish or give back one first.` : 'Assign it to me and start fixing',
    run: () => pickBug(bug),
  } : null);
  const shown = Object.values(visible).flat();

  return (
    <TaskExtrasProvider tasks={shown}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Open bugs" value={data.summary.open} />
          <StatTile label="Ready to pick" value={data.counts.ready} />
          <StatTile label="Critical open" value={data.summary.critical} />
          <StatTile label="Reopened" value={data.summary.reopened} />
        </div>
        {!me.team_has_roles && me.is_lead && (
          <Banner tone="info">Mark who is Developer and who is QA in the People tab. Until then, anyone in the team can do every step.</Banner>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Input aria-label="Search bugs" placeholder="Search a title or key" className="!w-60" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Segmented label="Severity" value={severity} onChange={setSeverity}
            options={[['all', 'All'], ['CRITICAL', 'Critical'], ['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
          <Segmented label="Whose bugs" value={whose} onChange={setWhose} options={[['all', 'Everyone'], ['mine', 'Mine']]} />
          <span className="text-sm text-muted md:ml-auto">
            {me.can_pick ? `You have ${me.fixing} of ${me.wip_limit} bugs in Fixing.` : me.role === 'qa' ? 'You check the fixes in this team.' : ''}
          </span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1100px] grid-cols-5 gap-3">
            {data.stages.map(({ key, name }) => (
              <section key={key} aria-label={name} className="flex flex-col gap-2 rounded-lg bg-subtle p-2">
                <header className="flex items-center justify-between px-1.5 pt-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{name}</h3>
                  <span className="font-mono text-xs text-muted">{data.counts[key]}</span>
                </header>
                <p className="px-1.5 text-[11px] text-muted">{key === 'done' ? `Closed in the last ${data.done_days} days.` : HINTS[key]}</p>
                {visible[key].map((bug) => (
                  <BugCard key={bug.id} bug={bug} stage={key} keyOf={keyOf} onOpen={() => open(bug.id)} pick={key === 'ready' ? pickFor(bug) : null} />
                ))}
                {!visible[key].length && <p className="px-1.5 py-6 text-center text-xs text-muted">Nothing here.</p>}
              </section>
            ))}
          </div>
        </div>
        {selected && (
          <TaskDetailModal selectedTask={selected} sheetTab={sheetTab} setSheetTab={setSheetTab} setSelectedTask={setSelectedTask}
            handleDelete={handleDelete} handleApproveDelete={handleApproveDelete} handleRejectDelete={handleRejectDelete} onSaved={load} />
        )}
      </div>
    </TaskExtrasProvider>
  );
}
