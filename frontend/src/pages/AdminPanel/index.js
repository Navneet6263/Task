import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Banner, Button, PageHeader, StatTile, Tabs } from '../../ui';
import UsersTab from './UsersTab';
import OrganizationsTab from './OrganizationsTab';
import AdminsTab from './AdminsTab';
import AccessTab from './AccessTab';
import { adminIdentity, errorOf } from './adminShared';

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user, tokenRole, isCompanyAdmin, isOrgAdmin } = adminIdentity();
  const [tab, setTab] = useState(isCompanyAdmin ? 'orgs' : 'users');
  const [stats, setStats] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [userOrg, setUserOrg] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  // Older company-admin sessions stored their token under "token"; move it once.
  useEffect(() => {
    if (tokenRole !== 'company_admin') return;
    const legacy = localStorage.getItem('token');
    if (!localStorage.getItem('company_token') && legacy) { localStorage.setItem('company_token', legacy); localStorage.removeItem('token'); }
    const fixed = { ...user, role: 'company_admin' };
    localStorage.setItem('company_user', JSON.stringify(fixed));
    localStorage.setItem('user', JSON.stringify(fixed));
  }, [tokenRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setError('');
    try {
      if (isCompanyAdmin) {
        const [overview, orgRes] = await Promise.all([api.get('/company-admin/overview'), api.get('/company-admin/organizations')]);
        const list = Array.isArray(orgRes.data) ? orgRes.data : [];
        const s = overview.data?.stats || {};
        setOrgs(list);
        setStats({ orgs: s.organizations ?? list.length, users: s.users, admins: s.admins, managers: s.managers, staff: s.staff });
      } else if (isOrgAdmin) {
        const [s, o] = await Promise.all([api.get('/admin/stats'), api.get('/admin/organizations')]);
        setStats(s.data || {}); setOrgs(Array.isArray(o.data) ? o.data : []);
      } else setError('Only admins can open this page.');
    } catch (err) { setError(errorOf(err, 'Could not load admin data.')); }
  }, [isCompanyAdmin, isOrgAdmin]);
  useEffect(() => { load(); }, [load, version]);
  const changed = () => setVersion((v) => v + 1);

  if (!isCompanyAdmin && !isOrgAdmin) return <><PageHeader title="Admin" /><Banner tone="warn">Only admins can open this page.</Banner></>;

  const tabs = isCompanyAdmin
    ? [['orgs', 'Organizations'], ['users', 'People'], ['admins', 'Admins'], ['access', 'Multi-org access']]
    : [['users', 'People'], ['org', 'Organization']];
  const org = orgs[0];

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader title={isCompanyAdmin ? 'Company admin' : 'Admin'} subtitle={isCompanyAdmin ? 'Your organizations, their admins, and who can work across more than one.' : `People and access for ${org?.name || 'your organization'}.`}
        actions={<Button onClick={() => navigate('/audit-logs')}>Audit logs</Button>} />
      {error && <Banner tone="danger" action={<Button size="sm" onClick={load}>Retry</Button>}>{error}</Banner>}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isCompanyAdmin ? <>
          <StatTile label="Organizations" value={stats.orgs ?? 0} /><StatTile label="People" value={stats.users ?? 0} />
          <StatTile label="Admins & managers" value={(stats.admins || 0) + (stats.managers || 0)} /><StatTile label="Members" value={stats.staff ?? 0} />
        </> : <>
          <StatTile label="People" value={stats.users ?? 0} /><StatTile label="Teams" value={stats.teams ?? 0} />
          <StatTile label="Tasks" value={stats.tasks ?? 0} /><StatTile label="Logged events" value={stats.logs ?? 0} />
        </>}
      </section>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Admin sections" />
      {tab === 'orgs' && <OrganizationsTab orgs={orgs} canCreate onChanged={changed} onViewUsers={(id) => { setUserOrg(String(id)); setTab('users'); }} />}
      {tab === 'users' && <UsersTab key={userOrg} isCompanyAdmin={isCompanyAdmin} orgs={orgs} initialOrg={userOrg} selfId={user.id} onChanged={changed} />}
      {tab === 'admins' && <AdminsTab orgs={orgs} onChanged={changed} />}
      {tab === 'access' && <AccessTab orgs={orgs} />}
      {tab === 'org' && <OrganizationsTab orgs={orgs} canCreate={false} onChanged={changed} />}
    </div>
  );
}
