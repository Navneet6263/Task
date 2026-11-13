import React, { useCallback, useEffect, useState } from 'react';
import { teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, CardHeader, Chip, Segmented, Select } from '../../ui';
import { errorOf } from './shared';

const DIRECTIONS = [['out', 'They see ours'], ['in', 'We see theirs'], ['both', 'Both ways']];

function TeamRow({ item, label, onRemove, busy }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-subtle text-xs font-bold text-muted">{item.name.slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm font-semibold">{item.name}{item.both_ways && <Chip tone="ok">Both ways</Chip>}</span>
        <span className="block text-xs text-muted">{label} · {item.members} {item.members === 1 ? 'person' : 'people'}</span>
      </span>
      {onRemove && <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>Stop</Button>}
    </li>
  );
}

// Which other teams see and work on this team's tasks, and whose tasks this team sees. Admins route
// work between teams here; everyone else can see what is shared.
export default function TeamSharing({ team, allTeams, canEdit, onChanged }) {
  const [data, setData] = useState(null);
  const [otherId, setOtherId] = useState('');
  const [direction, setDirection] = useState('both');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => teams.sharing(team.id).then((r) => setData(r.data)).catch(() => setData({ shared_with: [], sees: [] })), [team.id]);
  useEffect(() => { setData(null); setOtherId(''); load(); }, [load]);

  const run = async (request, message) => {
    setBusy(true);
    try { const r = await request(); setData(r.data); notify(message, 'success'); onChanged(); }
    catch (err) { notify(errorOf(err, 'Could not change team sharing.')); }
    finally { setBusy(false); }
  };
  const other = allTeams.find((t) => String(t.id) === String(otherId));
  const share = () => {
    if (!other) return;
    const text = { out: `${other.name} can now see and work on ${team.name}'s tasks.`, in: `${team.name} can now see and work on ${other.name}'s tasks.`, both: `${team.name} and ${other.name} now work together.` }[direction];
    // "We see theirs" is the same share made from the other team's side.
    const request = direction === 'in'
      ? () => teams.share(other.id, team.id, false).then(() => teams.sharing(team.id))
      : () => teams.share(team.id, other.id, direction === 'both');
    run(request, text).then(() => setOtherId(''));
  };
  const stop = (item, dir) => {
    if (!window.confirm(dir === 'both' ? `Stop sharing between ${team.name} and ${item.name}?` : dir === 'out' ? `${item.name} will no longer see ${team.name}'s tasks. Continue?` : `${team.name} will no longer see ${item.name}'s tasks. Continue?`)) return;
    run(() => teams.unshare(team.id, item.id, item.both_ways ? 'both' : dir), 'Sharing stopped.');
  };

  if (!data) return null;
  const linked = new Set([...data.shared_with, ...data.sees].map((t) => String(t.id)));
  const choices = allTeams.filter((t) => String(t.id) !== String(team.id) && String(t.org_id) === String(team.org_id) && !linked.has(String(t.id)));
  const twoWay = data.shared_with.filter((t) => t.both_ways);
  const outOnly = data.shared_with.filter((t) => !t.both_ways);
  const inOnly = data.sees.filter((t) => !t.both_ways);
  const empty = !data.shared_with.length && !data.sees.length;
  if (empty && !canEdit) return null;

  return (
    <Card>
      <CardHeader title="Team sharing" aside="Work across teams" />
      <div className="flex flex-col gap-4 p-4">
        {empty && <p className="text-sm text-muted">Only {team.name}'s own members see its tasks. Share it when two teams need to work together.</p>}
        {[[twoWay, 'Work together', 'both'], [outOnly, `See ${team.name}'s tasks`, 'out'], [inOnly, `${team.name} sees their tasks`, 'in']].map(([items, label, dir]) => items.length > 0 && (
          <div key={dir} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
            <ul className="flex flex-col gap-1.5">{items.map((item) => <TeamRow key={item.id} item={item} label={dir === 'in' ? 'Their tasks show up for this team' : 'They see and work on this team\'s tasks'} busy={busy} onRemove={canEdit ? () => stop(item, dir) : null} />)}</ul>
          </div>
        ))}
        {canEdit && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
            <p className="text-sm font-medium">Share with another team</p>
            {choices.length ? (
              <>
                <Select aria-label="Team to share with" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                  <option value="">Pick a team…</option>
                  {choices.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.member_count || 0} members</option>)}
                </Select>
                <Segmented label="Direction" value={direction} onChange={setDirection} options={DIRECTIONS} className="self-start [&>button]:normal-case" />
                <p className="text-xs text-muted">
                  {!other ? 'Shared tasks show up on their board, calendar and reports, and they can work on them.'
                    : { out: `${other.name}'s people will see and work on ${team.name}'s tasks.`, in: `${team.name}'s people will see and work on ${other.name}'s tasks.`, both: `Both teams see and work on each other's tasks.` }[direction]}
                </p>
                <Button variant="primary" size="sm" className="self-start" disabled={!other || busy} onClick={share}>{busy ? 'Saving…' : 'Share'}</Button>
              </>
            ) : <p className="text-xs text-muted">No other team in this workspace to share with yet.</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
