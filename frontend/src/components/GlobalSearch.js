import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null), container = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const key = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); } if (event.key === 'Escape') setOpen(false); };
    const click = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, []);
  useEffect(() => {
    setResults([]); setError('');
    if (query.trim().length < 2) { setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => api.get('/workspace/search', { params: { q: query }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResults(response.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || 'Search failed. Try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); }), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div ref={container} className="shell-search relative">
    <input ref={input} value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }} placeholder="Search tasks or clients · Ctrl K" aria-label="Search tasks or clients" />
    {open && query.trim().length >= 2 && <div className="absolute left-0 top-full mt-2 max-h-80 w-full min-w-[260px] overflow-auto rounded-xl border bg-white p-2 shadow-xl z-[150]">
      {loading && <p role="status" className="p-3 text-sm">Searching...</p>}
      {error && <p role="alert" className="p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && !results.length && <p className="p-3 text-sm text-slate-500">No matching tasks in your accessible teams.</p>}
      {results.map(task => <button key={task.id} type="button" className="block w-full rounded-lg p-3 text-left hover:bg-blue-50 focus:bg-blue-50" onClick={() => { navigate(`/dashboard?task=${task.id}`); setOpen(false); }}><strong className="block text-sm">{task.title}</strong><span className="text-xs text-slate-500">TASK-{task.id} · {task.team_name} · {task.status.replaceAll('_', ' ')}</span></button>)}
    </div>}
  </div>;
}
