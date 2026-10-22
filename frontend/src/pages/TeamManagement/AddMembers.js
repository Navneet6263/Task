import React, { useEffect, useState } from 'react';
import { teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, CardHeader, Input, Select } from '../../ui';
import { Avatar, TEAM_ROLES, errorOf } from './shared';

// Search people in the organization who are not in this team yet and add them in one click.
export default function AddMembers({ team, onAdded }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('Member');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      teams.candidates(team.id, query.trim(), controller.signal)
        .then((r) => setPeople(r.data))
        .catch((err) => { if (err.name !== 'CanceledError') setPeople([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [team.id, query, reload]);

  const add = async (person) => {
    setBusyId(person.id);
    try {
      await teams.addMember(team.id, { user_id: person.id, role });
      notify(`${person.name} added to ${team.name}.`, 'success');
      setReload((v) => v + 1);
      onAdded();
    } catch (err) { notify(errorOf(err, 'Could not add this person.')); }
    finally { setBusyId(null); }
  };

  return (
    <Card>
      <CardHeader title="Add people" aside="From your organization" />
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Search people" placeholder="Search by name or email" className="min-w-[160px] flex-1" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select aria-label="Role for new members" className="!w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
            {TEAM_ROLES.filter((r) => r !== 'Reporting Manager').map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {loading && !people.length && <li role="status" className="px-2 py-4 text-sm text-muted">Searching…</li>}
          {!loading && !people.length && <li className="px-2 py-4 text-center text-sm text-muted">{query ? 'No one matches. They may already be in the team, or not have an account yet.' : 'Everyone in your organization is already in this team.'}</li>}
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-subtle">
              <Avatar name={person.name} id={person.id} size="h-8 w-8 text-[11px]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{person.name}</span><span className="block truncate text-xs text-muted">{person.email}</span></span>
              <Button size="sm" disabled={busyId === person.id} onClick={() => add(person)}>{busyId === person.id ? 'Adding…' : '+ Add'}</Button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">New colleague without an account? Share the team join code above; they enter it when they sign up.</p>
      </div>
    </Card>
  );
}
