import React, { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Chip, Loading, Select } from '../../../ui';
import { errorOf, saApi } from '../consoleUtils';
import ImportWizard from '../../Settings/employees/ImportWizard';
import { downloadLoginSheet } from '../../Settings/employees/passwordSheet';

function Step({ n, done, title, children, action }) {
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-lg border p-3.5 ${done ? 'border-accent/40 bg-accent-soft/40' : 'border-line'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted'}`}>{done ? '✓' : n}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><div className="mt-0.5 text-xs text-muted">{children}</div></div>
      {action}
    </div>
  );
}

// Company → Employees: the platform team sets up employee-code sign-in for an organization end to end,
// so the company admin has nothing to do: turn the modules on, import the HRMS sheet, download one
// login sheet with everyone's code, email and password.
export default function EmployeesPanel({ orgs, sa, onChanged }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id || null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const org = orgs.find((o) => o.id === orgId) || orgs[0];

  const load = useCallback(async () => {
    if (!org) return;
    try { setData((await saApi.get(`/organizations/${org.id}/employees`)).data); setError(''); }
    catch (err) { setError(errorOf(err, 'Could not load employees.')); setData({ employees: [], enabled: false }); }
  }, [org]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (!org) return <p className="text-sm text-muted">This company has no organizations yet.</p>;
  const hrmsOn = Boolean(org.modules?.hrms_login);
  const allOn = Boolean(org.modules?.all_tasks);
  const people = (data?.employees || []).filter((e) => e.login_code);
  const noEmail = people.filter((e) => !e.has_email);
  const signedIn = people.filter((e) => !e.first_sign_in_pending).length;

  const turnOn = async (key) => {
    setBusy(key);
    try { if (await sa.actions.toggleModule(org, key, true)) await onChanged?.(); } finally { setBusy(''); }
  };
  const loginSheet = async () => {
    if (!window.confirm('Download the login sheet? Everyone who has not signed in yet gets a NEW one-time password, so any older sheet stops working for them.')) return;
    setBusy('sheet'); setError('');
    try {
      const { data: sheet } = await saApi.post(`/organizations/${org.id}/employees/login-sheet`);
      await downloadLoginSheet(sheet.people, { companyCode: org.company_code, orgName: org.name });
      load();
    } catch (err) { setError(errorOf(err, 'Could not make the login sheet.')); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col gap-4">
      {orgs.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Organization</span>
          <Select aria-label="Organization" value={org.id} onChange={(e) => setOrgId(Number(e.target.value))} className="w-auto">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
      )}
      <p className="text-sm text-muted">Set up sign-in with the HRMS employee code for <strong className="text-ink">{org.name}</strong>. The company admin does not need to do anything — you hand them one sheet with everyone&apos;s login.</p>
      {error && <Banner tone="danger">{error}</Banner>}

      <div className="grid gap-2">
        <Step n={1} done={hrmsOn} title="Employee code login"
          action={!hrmsOn && <Button size="sm" variant="primary" disabled={busy === 'hrms_login'} onClick={() => turnOn('hrms_login')}>{busy === 'hrms_login' ? 'Turning on…' : 'Turn on'}</Button>}>
          {hrmsOn ? 'On — staff can sign in with their employee code or email.' : 'Needed before importing. Staff then sign in with their employee code or email.'}
        </Step>
        <Step n={2} done={allOn} title="Show all tasks to everyone (optional)"
          action={!allOn && <Button size="sm" disabled={busy === 'all_tasks'} onClick={() => turnOn('all_tasks')}>{busy === 'all_tasks' ? 'Turning on…' : 'Turn on'}</Button>}>
          {allOn ? 'On — everyone sees every team’s tasks. The company admin can switch it off in Settings.' : 'Different managers, but everyone works on tasks? Turn this on so no task is hidden by teams.'}
        </Step>
        <Step n={3} done={people.length > 0} title="Import the HRMS sheet">
          {people.length ? `${people.length} employees imported.` : 'Upload the employee export below, then the email sheet if you have one.'}
        </Step>
        <Step n={4} done={false} title="Download the login sheet and send it to the company"
          action={people.length > 0 && <Button size="sm" variant="primary" disabled={busy === 'sheet'} onClick={loginSheet}>{busy === 'sheet' ? 'Preparing…' : 'Download login sheet'}</Button>}>
          One Excel with every employee&apos;s code, email and password. People who already set their own password are marked instead.
        </Step>
      </div>

      {hrmsOn && (data === null ? <Loading>Loading employees…</Loading> : (
        <>
          {people.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <Chip tone="info">{people.length} employees</Chip>
              <Chip tone="ok">{people.length - noEmail.length} with email</Chip>
              <Chip tone={noEmail.length ? 'warn' : 'neutral'}>{noEmail.length} without email</Chip>
              <Chip>{signedIn} signed in</Chip>
            </div>
          )}
          {noEmail.length > 0 && (
            <Banner tone="warn">
              <strong>No email yet:</strong> {noEmail.map((e) => `${e.login_code} ${e.name}`).join(', ')}. They sign in with their employee code and the password from the sheet, then add their email.
            </Banner>
          )}
          <ImportWizard title={people.length ? 'Import again (updates people, adds new joiners)' : 'Import the HRMS sheet'}
            status={{ company_code: org.company_code }} employees={data.employees || []} teams={[]}
            importRows={(rows) => saApi.post(`/organizations/${org.id}/employees/import`, rows)}
            onImported={() => { load(); onChanged?.(); }} />
        </>
      ))}
    </div>
  );
}
