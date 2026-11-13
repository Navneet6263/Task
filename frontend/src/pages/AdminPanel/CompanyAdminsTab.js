import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Banner, Button, Card, CardHeader, Chip, Modal, SearchSelect } from '../../ui';
import { Person, dateLabel, errorOf } from './adminShared';

// Company admins: the owner of the company account and the people who run the company with them.
// A company admin can create organizations, add admins and see everyone across the company.
export default function CompanyAdminsTab() {
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [admins, users] = await Promise.all([api.get('/company-admin/company-admins'), api.get('/company-admin/users')]);
      setData(admins.data); setPeople(Array.isArray(users.data) ? users.data : []);
    } catch (err) { setError(errorOf(err, 'Could not load company admins.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !data) return <Banner tone="danger" action={<Button size="sm" onClick={load}>Retry</Button>}>{error}</Banner>;
  if (!data) return <p role="status" className="py-6 text-sm text-muted">Loading…</p>;

  const coIds = new Set(data.co_admins.map((c) => Number(c.id)));
  const ownerEmail = String(data.owner?.email || '').toLowerCase();
  const candidates = people.filter((p) => p.role === 'admin' && !coIds.has(Number(p.id)) && String(p.email).toLowerCase() !== ownerEmail);
  const chosen = candidates.find((p) => String(p.id) === pick);

  const add = async () => {
    if (!chosen || busy) return;
    setBusy(true); setError('');
    try {
      await api.post('/company-admin/company-admins', { user_id: chosen.id });
      notify(`${chosen.name} is now a company admin.`, 'success');
      setAdding(false); setPick(''); load();
    } catch (err) { setError(errorOf(err, 'Could not add the company admin.')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/company-admin/company-admins/${removing.id}`);
      notify(`${removing.name} is no longer a company admin. They stay an admin of their organization.`, 'success');
      setRemoving(null); load();
    } catch (err) { notify(errorOf(err, 'Could not remove the company admin.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">Company admins run the whole company: they create organizations, add admins and see everyone. They sign in with their own email and password, the same as always.</p>
        <Button variant="primary" onClick={() => { setAdding(true); setError(''); }}>+ Add company admin</Button>
      </div>
      <Card>
        <CardHeader title="Company admins" aside={`${1 + data.co_admins.length} ${data.co_admins.length ? 'people' : 'person'}`} />
        <ul className="divide-y divide-line">
          {data.owner && (
            <li className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1"><Person name={data.owner.name} email={data.owner.email} id={data.owner.id} /></span>
              <Chip tone="ok">Owner</Chip>
              <span className="text-xs text-muted">The company account. Only a Super Admin can change it.</span>
            </li>
          )}
          {data.co_admins.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1"><Person name={c.name} email={c.email} id={c.id} /></span>
              <span className="text-xs text-muted">Admin of {c.org_name || '—'} · since {dateLabel(c.created_at)}{Number(c.id) === Number(data.me) ? ' · You' : ''}</span>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(c)} aria-label={`Remove ${c.name} as company admin`}>Remove</Button>
            </li>
          ))}
        </ul>
      </Card>

      {adding && (
        <Modal size="md" title="Add a company admin" subtitle="They get the same company admin view as you." onClose={() => setAdding(false)}
          footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" disabled={!chosen || busy} onClick={add}>{busy ? 'Adding…' : 'Make company admin'}</Button></>}>
          <div className="flex flex-col gap-3 text-sm">
            {candidates.length ? (
              <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Admin</span>
                <SearchSelect aria-label="Admin" value={pick} onChange={setPick} placeholder={`Search ${candidates.length} ${candidates.length === 1 ? 'admin' : 'admins'}…`}
                  emptyText="No admin with that name." options={candidates.map((p) => ({ value: String(p.id), label: p.name, hint: `${p.org_name || ''} · ${p.email}` }))} />
              </label>
            ) : <Banner tone="info">There is no other admin to pick. Make someone an admin first (Admins tab), then come back here.</Banner>}
            <p className="text-muted">Only admins can become company admins. To give this to someone new, add them as an admin first.</p>
            <p className="text-muted">They sign in with their own email and password. Nothing new to share.</p>
            {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
          </div>
        </Modal>
      )}
      {removing && (
        <Modal size="sm" title={`Remove ${removing.name} as company admin?`} onClose={() => setRemoving(null)}
          footer={<><Button onClick={() => setRemoving(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Remove'}</Button></>}>
          <p className="text-sm text-muted">They lose the company admin view straight away and stay an admin of {removing.org_name || 'their organization'}. Their account and work are not touched.</p>
        </Modal>
      )}
    </div>
  );
}
