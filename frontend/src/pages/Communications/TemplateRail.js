import React, { useState } from 'react';
import { Input } from '../../ui';
import { BUILT_IN } from './templates';

function Item({ template, active, badge, onSelect }) {
  return (
    <button type="button" aria-pressed={active} onClick={() => onSelect(template)}
      className={`flex w-full flex-col rounded-md border px-3 py-2 text-left transition ${active ? 'border-accent/50 bg-accent-soft' : 'border-transparent hover:bg-subtle'}`}>
      <span className="flex items-center gap-2 text-sm font-semibold">{template.name}{badge && <span className="rounded bg-info-soft px-1 text-[10px] font-semibold uppercase text-info">{badge}</span>}</span>
      <span className="truncate text-xs text-muted">{template.desc || template.subject || 'No subject'}</span>
    </button>
  );
}

// Left rail: the task draft (if any), built-in templates and the organization's own templates.
export default function TemplateRail({ active, onSelect, orgTemplates, taskDraft }) {
  const [query, setQuery] = useState('');
  const match = (t) => `${t.name} ${t.subject}`.toLowerCase().includes(query.trim().toLowerCase());
  const org = orgTemplates.map((t) => ({ ...t, id: `org-${t.id}`, desc: t.subject })).filter(match);
  return (
    <aside className="flex w-full flex-col border-b border-line bg-surface md:w-[270px] md:shrink-0 md:border-b-0 md:border-r">
      <div className="border-b border-line p-3">
        <Input aria-label="Search templates" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex max-h-[260px] flex-col gap-4 overflow-y-auto p-2 md:max-h-none md:flex-1">
        {taskDraft && <div><p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">From your task</p><Item template={taskDraft} active={active?.id === taskDraft.id} badge="Task" onSelect={onSelect} /></div>}
        <div>
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Your company</p>
          {org.map((t) => <Item key={t.id} template={t} active={active?.id === t.id} onSelect={onSelect} />)}
          {!org.length && <p className="px-2 py-1 text-xs text-muted">{orgTemplates.length ? 'No match.' : 'No shared templates yet. Write an email and choose "Save as template".'}</p>}
        </div>
        <div>
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Starters</p>
          {BUILT_IN.filter(match).map((t) => <Item key={t.id} template={t} active={active?.id === t.id} onSelect={onSelect} />)}
        </div>
      </div>
    </aside>
  );
}
