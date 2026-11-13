import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskExtras } from '../../services/api';
import useDialog from '../useDialog';
import { useTaskMeta } from '../taskExtras/taskExtrasStore';
import { PlusIcon, SearchIcon } from './icons';
import { SpaceAvatar, useSpaces } from './spaces';

const STATUS_DOT = { DONE: 'bg-accent', IN_PROGRESS: 'bg-info', PENDING: 'bg-warn', TODO: 'bg-muted' };

// Ctrl+K: find a task by key or title, jump to a space or a page, or start something new.
export default function CommandPalette({ navGroups, onClose, onCreate }) {
  const navigate = useNavigate();
  const { keyOf } = useTaskMeta();
  const { ordered } = useSpaces();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const dialogRef = useDialog(true, onClose);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setFound([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      taskExtras.search(q).then(({ data }) => { if (alive) setFound(data || []); }).catch(() => { if (alive) setFound([]); });
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (text) => !q || String(text).toLowerCase().includes(q);
    const pages = navGroups.flatMap((g) => g.items).filter((i) => match(i.label) || match(i.note || ''));
    return [
      ...(!q || 'create a task new'.includes(q) ? [{ group: 'Actions', id: 'create', label: 'Create a task', hint: 'C', icon: <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-accent-fg"><PlusIcon size={13} /></span>, run: () => onCreate() }] : []),
      ...found.map((t) => ({ group: 'Tasks', id: `t${t.id}`, label: t.title, hint: keyOf(t.id), done: t.status === 'DONE',
        icon: <span className={`ml-2 mr-2 h-2 w-2 rounded-full ${STATUS_DOT[t.status] || 'bg-muted'}`} />, run: () => navigate(`/dashboard?task=${t.id}`) })),
      ...ordered.filter((t) => match(t.name)).slice(0, q ? 6 : 4).map((t) => ({ group: 'Spaces', id: `s${t.id}`, label: t.name, hint: `${t.member_count || 0} members`,
        icon: <SpaceAvatar team={t} />, run: () => navigate(`/spaces/${t.id}`) })),
      ...pages.slice(0, q ? 6 : 5).map((p) => ({ group: 'Go to', id: `p${p.path}`, label: p.label, hint: p.note, icon: <span className="grid h-6 w-6 place-items-center text-muted">{p.icon}</span>, run: () => navigate(p.path) })),
    ];
  }, [query, found, ordered, navGroups, keyOf, navigate, onCreate]);

  useEffect(() => { setActive(0); }, [query, found.length]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  const pick = (item) => { if (!item) return; onClose(); item.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 p-3 pt-[12vh] backdrop-blur-[2px] motion-safe:animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Search" tabIndex={-1} className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span className="text-muted"><SearchIcon size={18} /></span>
          <input autoFocus aria-label="Search tasks, spaces and pages" placeholder="Search tasks (ACC-142), spaces, pages…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
          <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto p-2">
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {header && <li role="presentation" className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{header}</li>}
                <li role="option" aria-selected={index === active} data-active={index === active}
                  onMouseEnter={() => setActive(index)} onMouseDown={(e) => { e.preventDefault(); pick(item); }}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${index === active ? 'bg-accent-soft' : ''}`}>
                  {item.icon}
                  <span className={`min-w-0 flex-1 truncate text-sm font-medium ${item.done ? 'text-muted line-through' : ''}`}>{item.label}</span>
                  {item.hint && <span className={`shrink-0 truncate text-xs text-muted ${item.group === 'Tasks' ? 'font-mono font-semibold' : 'max-w-[200px]'}`}>{item.hint}</span>}
                </li>
              </React.Fragment>
            );
          })}
          {query.trim() && !items.length && <li className="px-3 py-8 text-center text-sm text-muted">Nothing found for “{query.trim()}”.</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-subtle px-4 py-2 text-[11px] text-muted">
          <span><kbd className="font-mono">↑ ↓</kbd> move</span><span><kbd className="font-mono">Enter</kbd> open</span><span><kbd className="font-mono">Ctrl K</kbd> search anywhere</span>
        </div>
      </div>
    </div>
  );
}
