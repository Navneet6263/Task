import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { teams as teamsApi } from '../../services/api';
import { updatesApi } from '../../components/Updates/updatesApi';
import { CountBadge, PageHeader } from '../../ui';
import ProfileSection from './ProfileSection';
import SecuritySection from './SecuritySection';
import AppearanceSection from './AppearanceSection';
import TeamsSection from './TeamsSection';
import TaskFormSection from './TaskFormSection';
import FormDesignerSection from './formDesigner';
import ClientsSection from './clients/ClientsSection';
import WhatsNewSection from './WhatsNewSection';

const Icon = ({ d }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const ICONS = {
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  security: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  appearance: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  teams: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  'task-form': 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  clients: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01',
  'form-designer': 'M4 5h16M4 12h10M4 19h7M17 15l3 3-3 3M14 18h6',
  'whats-new': 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z',
};

export default function Settings() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canManageForm = ['admin', 'manager', 'company_admin'].includes(user.role);
  const isAdmin = ['admin', 'company_admin'].includes(user.role);
  const [teamList, setTeamList] = useState([]);
  const [unread, setUnread] = useState(0);

  const groups = [
    { label: 'Account', items: [['profile', 'Profile'], ['security', 'Password & security'], ['appearance', 'Appearance']] },
    { label: 'Workspace', items: [['teams', 'Teams & join codes'], ...(canManageForm ? [['clients', 'Clients'], ['form-designer', 'Form designer'], ['task-form', 'Task dropdown lists']] : [])] },
    { label: 'Help', items: [['whats-new', "What's new & guides"]] },
  ];
  const ids = groups.flatMap((g) => g.items.map(([id]) => id));
  const current = ids.includes(hash.slice(1)) ? hash.slice(1) : 'profile';

  useEffect(() => { teamsApi.getAll().then((r) => setTeamList(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const refresh = () => updatesApi.summary().then(({ data }) => setUnread(Number(data.unread || 0))).catch(() => {});
    refresh();
    window.addEventListener('workspace-updates-changed', refresh);
    return () => window.removeEventListener('workspace-updates-changed', refresh);
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" subtitle="Your account, how the app looks, your teams, and help." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:sticky md:top-[calc(var(--shell-header-height,57px)+20px)] md:h-fit md:flex-col md:overflow-visible">
          {groups.map((group) => (
            <div key={group.label} className="flex gap-1 md:mb-4 md:flex-col">
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted md:block">{group.label}</p>
              {group.items.map(([id, label]) => (
                <button key={id} type="button" aria-current={current === id ? 'page' : undefined} onClick={() => navigate(`#${id}`, { replace: true })}
                  className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm ${current === id ? 'bg-accent-soft font-semibold text-ink' : 'font-medium text-muted hover:bg-subtle hover:text-ink'}`}>
                  <Icon d={ICONS[id]} /><span className="flex-1">{label}</span>{id === 'whats-new' && <CountBadge count={unread} tone="accent" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          {current === 'profile' && <ProfileSection user={user} teamCount={teamList.length} />}
          {current === 'security' && <SecuritySection />}
          {current === 'appearance' && <AppearanceSection />}
          {current === 'teams' && <TeamsSection teams={teamList} isAdmin={isAdmin} />}
          {current === 'clients' && canManageForm && <ClientsSection />}
          {current === 'form-designer' && canManageForm && <FormDesignerSection />}
          {current === 'task-form' && canManageForm && <TaskFormSection />}
          {current === 'whats-new' && <WhatsNewSection />}
        </div>
      </div>
    </div>
  );
}
