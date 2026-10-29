import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrms } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Card, Chip, EmptyState, Input, Loading, Modal, Table, TableWrap, Td, Th } from '../../../ui';
import Section from '../Section';
import ImportWizard from './ImportWizard';
import { downloadLoginSheet, downloadPasswords } from './passwordSheet';

const ROLE_TEXT = { admin: 'Admin', manager: 'Manager', person: 'Employee' };

// Settings → Employees: sign-in with the HRMS employee code. Admins import the HRMS sheet, see who
// has signed in and added an email, and give a new one-time password to anyone who lost theirs.
export default function EmployeesSection({ status, teams }) {
  const [employees, setEmployees] = useState(null);
  const [query, setQuery] = useState('');
  const [reset, setReset] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  const loginSheet = async () => {
    if (!window.confirm('Download everyone\'s login details? People who have not signed in yet get a NEW one-time password, so any older sheet stops working for them.')) return;
    setSheetBusy(true);
    try {
      const { data } = await hrms.loginSheet();
      await downloadLoginSheet(data, { companyCode: status.company_code });
      load();
    } catch (err) { notify(err.response?.data?.error || 'Could not make the login sheet.'); }
    finally { setSheetBusy(false); }
  };

  const load = useCallback(() => {
    hrms.employees().then((r) => setEmployees(r.data || [])).catch(() => { setEmployees([]); notify('Could not load employees.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (employees || []).filter((e) => !q || [e.login_code, e.name, e.department, e.designation, e.email].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [employees, query]);
  const imported = (employees || []).filter((e) => e.login_code);
  const pending = imported.filter((e) => e.first_sign_in_pending).length;
  const noEmail = imported.filter((e) => !e.has_email).length;

  const resetPassword = async (person) => {
    if (!window.confirm(`Give ${person.name} a new one-time password? Their current password stops working.`)) return;
    setResetting(person.id);
    try {
      const { data } = await hrms.resetPassword(person.id);
      setReset(data);
      load();
    } catch (err) { notify(err.response?.data?.error || 'Could not reset the password.'); }
    finally { setResetting(null); }
  };

  return (
    <Section title="Employees (HRMS)" description="Your people sign in with the same employee code as in your HR system. Import the HRMS sheet; everyone gets a one-time password and chooses their own after signing in.">
      <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted">How they sign in</p><p className="mt-0.5 font-semibold">Employee code + password</p><p className="text-xs text-muted">or their email, once they add it</p></div>
        <div><p className="text-xs text-muted">Company code (only if asked)</p><p className="mt-0.5 font-mono font-semibold">{status.company_code || '—'}</p></div>
        <div><p className="text-xs text-muted">Imported</p><p className="mt-0.5 font-semibold">{imported.length} people</p><p className="text-xs text-muted">{pending} yet to sign in · {noEmail} without email</p></div>
      </Card>

      <ImportWizard status={status} employees={employees || []} teams={teams} onImported={load} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="text-[15px] font-semibold">People</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Search employees" placeholder="Search code, name, department…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64 max-w-full" />
            {imported.length > 0 && <Button variant="primary" disabled={sheetBusy} onClick={loginSheet}>{sheetBusy ? 'Preparing…' : 'Download login sheet'}</Button>}
          </div>
        </div>
        {employees === null ? <div className="p-4"><Loading /></div> : !list.length ? (
          <div className="p-4"><EmptyState title={employees.length ? 'No one matches' : 'No employees yet'}>{employees.length ? 'Try another search.' : 'Import your HRMS sheet above to add everyone at once.'}</EmptyState></div>
        ) : (
          <TableWrap>
            <Table>
              <thead><tr><Th>Code</Th><Th>Name</Th><Th>Role</Th><Th>Department</Th><Th>Reports to</Th><Th>Email</Th><Th>Sign-in</Th><Th align="right"> </Th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-line transition-colors hover:bg-subtle/60">
                    <Td mono>{e.login_code || '—'}</Td>
                    <Td><span className="font-medium">{e.name}</span>{e.designation && <span className="block text-xs text-muted">{e.designation}</span>}</Td>
                    <Td>{ROLE_TEXT[e.role] || e.role}</Td>
                    <Td>{e.department || '—'}</Td>
                    <Td>{e.reports_to_name || '—'}</Td>
                    <Td>{e.has_email ? <span className="text-sm">{e.email}</span> : <Chip tone="warn">Not added</Chip>}</Td>
                    <Td>{e.first_sign_in_pending ? <Chip tone="info">Not yet</Chip> : <Chip tone="ok">Done</Chip>}</Td>
                    <Td align="right">
                      <Button size="sm" variant="ghost" disabled={resetting === e.id} onClick={() => resetPassword(e)}>{resetting === e.id ? 'Resetting…' : 'Reset password'}</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {reset && (
        <Modal title={`New password for ${reset.name}`} onClose={() => setReset(null)}
          footer={<><Button variant="primary" onClick={() => downloadPasswords([reset], { companyCode: status.company_code })}>Download (Excel)</Button><Button onClick={() => setReset(null)}>Done</Button></>}>
          <p className="text-sm text-muted">Give this to {reset.name} privately. It works once; they choose their own password right after signing in. It is not shown again.</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-subtle p-4 text-sm">
            <div><dt className="text-xs text-muted">Employee code</dt><dd className="font-mono font-semibold">{reset.code || '— (use email)'}</dd></div>
            <div><dt className="text-xs text-muted">One-time password</dt><dd className="font-mono text-lg font-bold tracking-wider">{reset.password}</dd></div>
          </dl>
        </Modal>
      )}
    </Section>
  );
}
