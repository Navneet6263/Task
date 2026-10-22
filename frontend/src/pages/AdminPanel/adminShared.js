import React from 'react';
import { getTokenRole, parseStoredUser } from '../../components/LayoutParts';

// Who is looking at the panel: a company admin (many organizations) or an organization admin.
export function adminIdentity() {
  const hasCompanyToken = Boolean(localStorage.getItem('company_token'));
  const tokenRole = getTokenRole(localStorage.getItem('company_token') || localStorage.getItem('token'));
  const user = (hasCompanyToken
    ? parseStoredUser(localStorage.getItem('company_user')) || parseStoredUser(localStorage.getItem('user'))
    : parseStoredUser(localStorage.getItem('user')) || parseStoredUser(localStorage.getItem('company_user'))) || {};
  const isCompanyAdmin = tokenRole === 'company_admin' || hasCompanyToken || user.role === 'company_admin';
  return { user, tokenRole, isCompanyAdmin, isOrgAdmin: !isCompanyAdmin && (tokenRole === 'admin' || user.role === 'admin') };
}

export const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', person: 'Member' };
export const ROLE_TONE = { admin: 'danger', manager: 'info', person: 'neutral' };
export const errorOf = (error, fallback) => error?.response?.data?.error || fallback;

export const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

export function Person({ name, email, id }) {
  const tints = ['bg-accent-soft text-accent', 'bg-info-soft text-info', 'bg-warn-soft text-warn', 'bg-subtle text-ink'];
  return (
    <span className="flex items-center gap-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${tints[Number(id || 0) % tints.length]}`}>{initials(name)}</span>
      <span className="min-w-0"><span className="block truncate font-semibold">{name}</span><span className="block truncate text-xs text-muted">{email}</span></span>
    </span>
  );
}

export const dateLabel = (value) => {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};

export function lastSeen(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return 'Never';
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 5) return 'Online now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}
