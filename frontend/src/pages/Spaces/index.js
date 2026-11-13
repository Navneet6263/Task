import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Input, Loading, PageHeader, buttonClass } from '../../ui';
import { SpaceAvatar, useSpaces } from '../../components/shell/spaces';
import { StarIcon } from '../../components/shell/icons';

// Every space (team) you can see, starred and recent first.
export default function Spaces() {
  const { spaces, ordered, isStarred, toggleStar } = useSpaces();
  const [query, setQuery] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canCreate = ['admin', 'manager', 'company_admin'].includes(user.role);
  const shown = ordered.filter((t) => `${t.name} ${t.type || ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader title="Spaces" subtitle="Each team has its own space: a summary, board, list, timeline and calendar of its work."
        actions={canCreate && <Link to="/team?create=1" className={buttonClass('primary')}>+ Create space</Link>} />
      {spaces === null && <Loading>Loading spaces…</Loading>}
      {spaces?.length === 0 && <EmptyState title="No spaces yet">{canCreate ? 'Create a team; it becomes a space right away.' : 'Ask your admin to add you to a team.'}</EmptyState>}
      {spaces?.length > 0 && (
        <>
          <Input aria-label="Search spaces" placeholder={`Search ${spaces.length} spaces`} className="max-w-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((team) => (
              <li key={team.id} className="group relative rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                <Link to={`/spaces/${team.id}`} className="flex items-center gap-3 p-4">
                  <SpaceAvatar team={team} size="h-11 w-11 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{team.name}</span>
                    <span className="block text-xs text-muted">{team.type || 'General'} · {team.member_count || 0} members</span>
                  </span>
                </Link>
                <button type="button" onClick={() => toggleStar(team.id)} aria-pressed={isStarred(team.id)} aria-label={isStarred(team.id) ? `Unstar ${team.name}` : `Star ${team.name}`}
                  className={`absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md hover:bg-subtle ${isStarred(team.id) ? 'text-warn' : 'text-muted opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                  <StarIcon size={15} filled={isStarred(team.id)} />
                </button>
              </li>
            ))}
            {!shown.length && <li className="col-span-full py-8 text-center text-sm text-muted">No space matches that search.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
