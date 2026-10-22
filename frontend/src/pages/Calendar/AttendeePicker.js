import React, { useMemo, useState } from 'react';
import { Input } from '../../ui';

// Search-and-add list of organization members, shown as removable chips.
export default function AttendeePicker({ members, value, onChange, selfId }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = members.filter((member) => value.includes(member.id));
  const matches = useMemo(() => members
    .filter((member) => member.id !== selfId && !value.includes(member.id) && member.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8), [members, value, query, selfId]);

  return (
    <div className="flex flex-col gap-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((member) => (
            <span key={member.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle py-0.5 pl-1 pr-1.5 text-xs">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{member.name[0]?.toUpperCase()}</span>
              {member.name}
              <button type="button" aria-label={`Remove ${member.name}`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((id) => id !== member.id))}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input aria-label="Add people" placeholder="Add people by name" value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && matches.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-pop">
            {matches.map((member) => (
              <li key={member.id}>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-subtle"
                  onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange([...value, member.id]); setQuery(''); }}>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{member.name[0]?.toUpperCase()}</span>
                  {member.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
