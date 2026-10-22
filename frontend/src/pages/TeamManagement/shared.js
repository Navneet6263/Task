import React from 'react';

export const TEAM_TYPES = ['Development', 'Design', 'Marketing', 'Sales', 'Support', 'Operations', 'Management'];
export const TEAM_ROLES = ['Member', 'Reporting Manager', 'Lead Developer', 'Frontend Developer', 'Backend Developer', 'UI Designer', 'QA Engineer', 'Analyst'];
export const errorOf = (error, fallback) => error?.response?.data?.error || fallback;

export const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

// Stable, theme-safe avatar tint per person so a team list is easy to scan.
const TINTS = ['bg-accent-soft text-accent', 'bg-info-soft text-info', 'bg-warn-soft text-warn', 'bg-danger-soft text-danger', 'bg-subtle text-ink'];
export function Avatar({ name, id, size = 'h-9 w-9 text-xs' }) {
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold ${size} ${TINTS[Number(id || 0) % TINTS.length]}`}>{initials(name)}</span>;
}

export const canManageTeams = (role) => ['admin', 'manager', 'company_admin'].includes(role);
