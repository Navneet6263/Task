import React, { useCallback, useEffect, useState } from 'react';
import { teams as teamsApi } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';

// Every team is a "space": its own colour and initials, starred and recently opened ones first.
const HUES = ['#2563eb', '#16a34a', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#d97706', '#dc2626'];
export const spaceColor = (id) => HUES[Math.abs(Number(id) || 0) % HUES.length];
export const spaceInitials = (name) => {
  const parts = String(name || '').replace(/'s team$/i, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
};

// The team's photo when it has one, else its colour and initials.
export function SpaceAvatar({ team, size = 'h-6 w-6 text-[10px]', className = '' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [team?.photo]);
  if (team?.photo && !broken) {
    return <img src={team.photo} alt="" onError={() => setBroken(true)} className={`shrink-0 rounded-md bg-surface object-cover shadow-sm ${size} ${className}`} />;
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-md font-bold text-white shadow-sm ${size} ${className}`} style={{ backgroundColor: spaceColor(team?.id) }} aria-hidden="true">
      {spaceInitials(team?.name)}
    </span>
  );
}

const CHANGED = 'greentask:spaces-changed';
const announce = () => window.dispatchEvent(new Event(CHANGED));

// Remember a space as recently opened (newest first, at most 5).
export const visitSpace = (id) => {
  const recent = [Number(id), ...readPreference('spaces-recent', []).filter((x) => Number(x) !== Number(id))].slice(0, 5);
  writePreference('spaces-recent', recent);
  announce();
};

export function useSpaces() {
  const [list, setList] = useState(null);
  const [starred, setStarred] = useState(() => readPreference('spaces-starred', []));
  const [recent, setRecent] = useState(() => readPreference('spaces-recent', []));
  const load = useCallback(() => teamsApi.getAll().then((r) => setList(Array.isArray(r.data) ? r.data : [])).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sync = () => { setStarred(readPreference('spaces-starred', [])); setRecent(readPreference('spaces-recent', [])); };
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  const toggleStar = (id) => {
    const now = readPreference('spaces-starred', []);
    writePreference('spaces-starred', now.map(Number).includes(Number(id)) ? now.filter((x) => Number(x) !== Number(id)) : [...now, Number(id)]);
    announce();
  };
  const isStarred = (id) => starred.map(Number).includes(Number(id));
  // Starred first, then recently opened, then the rest by name.
  const ordered = (list || []).slice().sort((a, b) => {
    const rank = (t) => (isStarred(t.id) ? 0 : recent.map(Number).includes(Number(t.id)) ? 1 : 2);
    return rank(a) - rank(b) || (rank(a) === 1 ? recent.indexOf(Number(a.id)) - recent.indexOf(Number(b.id)) : String(a.name).localeCompare(String(b.name)));
  });
  return { spaces: list, ordered, isStarred, toggleStar, reload: load };
}
