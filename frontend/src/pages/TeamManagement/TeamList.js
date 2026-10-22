import React, { useState } from 'react';
import { Input } from '../../ui';

// Left column: every team the user can see, searchable.
export default function TeamList({ teams, selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const shown = teams.filter((team) => `${team.name} ${team.type || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <aside className="flex flex-col gap-2 lg:sticky lg:top-[calc(var(--shell-header-height,57px)+20px)] lg:h-fit">
      <Input aria-label="Search teams" placeholder={`Search ${teams.length} teams`} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
        {shown.map((team) => {
          const active = String(team.id) === String(selectedId);
          return (
            <li key={team.id}>
              <button type="button" aria-current={active ? 'true' : undefined} onClick={() => onSelect(team.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${active ? 'border-accent/50 bg-accent-soft' : 'border-transparent hover:bg-subtle'}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold ${active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted'}`}>{team.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{team.name}</span>
                  <span className="block truncate text-xs text-muted">{team.type || 'General'} · {team.member_count || 0} members</span>
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-6 text-center text-sm text-muted">{teams.length ? 'No team matches that search.' : 'No teams yet.'}</li>}
      </ul>
    </aside>
  );
}
