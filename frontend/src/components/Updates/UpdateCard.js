import React from 'react';
import { Button, Chip } from '../../ui';
import { dateTime } from './updatesApi';

function GuidePart({ step, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{step}</span>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

// One published update: summary up front, the full guide when opened.
export default function UpdateCard({ update, expanded, canEdit, onToggle, onEdit, onReport }) {
  return (
    <article className={`updates-card rounded-lg border bg-surface p-4 sm:p-5 ${update.is_read ? 'border-line' : 'border-accent/40 shadow-sm'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {update.is_read ? <Chip>Feature update</Chip> : <Chip tone="ok">New · unread</Chip>}
        {update.version > 1 && <span className="text-muted">Edited {dateTime(update.updated_at)} · v{update.version}</span>}
        <time className="ml-auto text-muted" dateTime={update.published_at}>{dateTime(update.published_at)}</time>
      </div>
      <h3 className="mt-2 text-base font-semibold">{update.title}</h3>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{update.summary}</p>
      {expanded && (
        <div className="mt-4 flex flex-col gap-4 rounded-md border border-line bg-subtle p-4">
          <GuidePart step="1" title="Why it helps">{update.why_text}</GuidePart>
          <GuidePart step="2" title="How to use it">{update.how_text}</GuidePart>
          {update.performance_text && <GuidePart step="3" title="Performance improvements">{update.performance_text}</GuidePart>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" variant={expanded ? 'secondary' : 'primary'} aria-expanded={expanded} onClick={onToggle}>
          {expanded ? 'Hide guide' : 'Read guide & how to use'}
        </Button>
        {canEdit && <Button size="sm" onClick={onEdit}>Edit update</Button>}
        <button type="button" onClick={onReport} className="ml-auto text-xs font-medium text-muted hover:text-danger">
          Something not working? Report a problem →
        </button>
      </div>
    </article>
  );
}
