import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { inputClass } from './Field';

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Words can come in any order and match anywhere ("kicks kc" finds "KC Kicks Ltd").
// Names that start with what was typed come first, then names with a word that starts with it.
export function searchOptions(options, query) {
  const q = norm(query);
  if (!q) return options;
  const words = q.split(' ');
  const scored = [];
  options.forEach((o, i) => {
    const label = norm(o.label);
    const hay = `${label} ${norm(o.hint)}`;
    if (!words.every((w) => hay.includes(w))) return;
    const rank = label.startsWith(q) ? 0 : label.includes(` ${words[0]}`) ? 1 : 2;
    scored.push([rank, i, o]);
  });
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((s) => s[2]);
}

function Marked({ text, query }) {
  const word = norm(query).split(' ')[0];
  const at = word ? String(text).toLowerCase().indexOf(word) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark className="rounded-sm bg-accent-soft px-0 font-semibold text-ink">{text.slice(at, at + word.length)}</mark>{text.slice(at + word.length)}</>;
}

// A dropdown you can type into, for long lists (hundreds of clients).
// options: [{ value, label, hint? }]. With `allowFree`, whatever is typed is the value
// (the list only suggests); without it, only a picked option changes the value.
export default function SearchSelect({
  id, value, onChange, options, placeholder = 'Type to search…', disabled = false, allowFree = false,
  emptyText = 'Nothing matches.', limit = 60, className = '', 'aria-label': ariaLabel,
}) {
  const listId = useId();
  const listRef = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value ?? ''));
  const shown = allowFree ? String(value ?? '') : selected?.label ?? '';
  const [draft, setDraft] = useState(null); // text being typed; null shows the current value
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => searchOptions(options, draft ?? ''), [options, draft]);
  const visible = matches.slice(0, limit);

  useEffect(() => { setActive(0); }, [draft]);
  useEffect(() => { if (open) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [active, open]);

  const pick = (o) => { onChange(o.value); setDraft(null); setOpen(false); };
  const close = () => { setDraft(null); setOpen(false); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (visible[active] && (draft !== null || !allowFree)) pick(visible[active]); else close(); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close();
  };
  const showList = open && !disabled && (visible.length > 0 || !allowFree);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id} type="text" role="combobox" aria-label={ariaLabel} aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={showList && visible[active] ? `${listId}-${active}` : undefined} data-value={String(value ?? '')}
        autoComplete="off" disabled={disabled} placeholder={placeholder} value={draft ?? shown}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close} onKeyDown={onKeyDown}
        onChange={(e) => { setDraft(e.target.value); setOpen(true); if (allowFree) onChange(e.target.value); }}
        className={`${inputClass} pr-8`}
      />
      {value && !disabled ? (
        <button type="button" tabIndex={-1} aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(''); setDraft(null); }}
          className="absolute inset-y-0 right-0 grid w-8 place-items-center text-muted hover:text-danger">×</button>
      ) : (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 grid w-8 place-items-center text-[10px] text-muted">▼</span>
      )}
      {showList && (
        <ul ref={listRef} id={listId} role="listbox" className="absolute left-0 right-0 top-full z-[130] mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {visible.map((o, i) => (
            <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={String(o.value) === String(value ?? '')}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === active ? 'bg-subtle' : ''} ${String(o.value) === String(value ?? '') ? 'font-semibold text-accent' : 'text-ink'}`}>
              <span className="min-w-0 flex-1 truncate"><Marked text={o.label} query={draft ?? ''} /></span>
              {o.hint && <span className="max-w-[45%] shrink-0 truncate text-xs font-normal text-muted">{o.hint}</span>}
            </li>
          ))}
          {!visible.length && <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>}
          {matches.length > limit && <li className="border-t border-line px-3 py-1.5 text-xs text-muted">{matches.length - limit} more. Keep typing to narrow it down.</li>}
        </ul>
      )}
    </div>
  );
}
