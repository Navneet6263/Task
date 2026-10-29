import React, { useMemo, useState } from 'react';
import { hrms } from '../../../services/api';
import { Banner, Button, Card, Chip, Input, Select, Table, TableWrap, Td, Th } from '../../../ui';
import { LABELS, matchEmails, readEmailFile, readSheetFile } from './parseHrSheet';
import { downloadPasswords } from './passwordSheet';

const ROLE_TEXT = { admin: 'Admin', manager: 'Manager', person: 'Employee' };
const TEAM_MODES = [
  ['one', 'One team for everyone', 'Everyone works together in one team, so everyone can get any task. Best when people help across departments.'],
  ['department', 'A team per department', 'VAT, Accounts, DSP… each a team. Managers also join the teams of the people who report to them.'],
  ['none', "Don't change teams", 'Only create or update accounts. You arrange teams yourself.'],
];

// Upload the HRMS export → check the preview and roles → import → download the first passwords.
export default function ImportWizard({ status, employees, teams, onImported, importRows = hrms.importRows, title = 'Import from your HRMS' }) {
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [reading, setReading] = useState(false);
  const [teamMode, setTeamMode] = useState('one');
  const [teamId, setTeamId] = useState('');
  const [deactivate, setDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [emailInfo, setEmailInfo] = useState(null);

  const known = useMemo(() => new Set(employees.map((e) => String(e.login_code || '').toUpperCase()).filter(Boolean)), [employees]);
  const rows = useMemo(() => sheet?.rows || [], [sheet]);
  const fresh = rows.filter((r) => !known.has(r.code)).length;
  const leaving = useMemo(() => {
    const codes = new Set(rows.map((r) => r.code));
    return employees.filter((e) => e.login_code && !codes.has(String(e.login_code).toUpperCase()) && e.role !== 'admin');
  }, [rows, employees]);
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.role]: (acc[r.role] || 0) + 1 }), {});
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.code, r.name])), [rows]);

  const pick = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setFile(chosen); setSheet(null); setError(''); setResult(null); setEmailInfo(null); setReading(true);
    try {
      const parsed = await readSheetFile(chosen);
      if (parsed.error) setError(parsed.error); else setSheet(parsed);
    } catch { setError('We could not read this file. Save it again from Excel as .xlsx and try once more.'); }
    finally { setReading(false); }
  };

  const setRole = (code, role) => setSheet((prev) => ({ ...prev, rows: prev.rows.map((r) => (r.code === code ? { ...r, role } : r)) }));
  const setEmail = (code, email) => setSheet((prev) => ({ ...prev, rows: prev.rows.map((r) => (r.code === code ? { ...r, email: email.trim().toLowerCase() } : r)) }));
  const withEmail = rows.filter((r) => r.email).length;
  const sameEmail = useMemo(() => {
    const seen = new Map();
    rows.forEach((r) => { if (r.email) seen.set(r.email, (seen.get(r.email) || 0) + 1); });
    return new Set([...seen].filter(([, n]) => n > 1).map(([email]) => email));
  }, [rows]);

  // Optional second sheet with emails (by code or name), e.g. a contact or birthday list.
  const pickEmails = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen || !sheet) return;
    setError('');
    try {
      const parsed = await readEmailFile(chosen);
      if (parsed.error) { setError(parsed.error); return; }
      const matched = matchEmails(sheet.rows, parsed.rows);
      setSheet((prev) => ({ ...prev, rows: matched.rows }));
      setEmailInfo({ file: chosen.name, total: parsed.rows.length, matched: matched.matched, unmatched: matched.unmatched });
    } catch { setError('We could not read the email sheet. Save it again from Excel as .xlsx and try once more.'); }
  };

  const runImport = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await importRows({
        rows: rows.map(({ line, manager_name: _ignored, email_from_sheet: _from, ...row }) => row),
        teams: teamMode,
        ...(teamMode === 'one' && teamId ? { team_id: Number(teamId) } : {}),
        deactivate_missing: deactivate,
      });
      setResult(data);
      setSheet(null); setFile(null);
      onImported?.();
    } catch (err) { setError(err.response?.data?.error || 'The import did not finish. Nothing you can see changed? Try again.'); }
    finally { setBusy(false); }
  };

  if (result) {
    return (
      <Card className="flex flex-col gap-4 p-5 motion-safe:animate-fade-up">
        <div>
          <h3 className="text-lg font-semibold">Import finished</h3>
          <p className="mt-1 text-sm text-muted">
            {result.created} new {result.created === 1 ? 'account' : 'accounts'} · {result.updated} updated
            {result.deactivated ? ` · ${result.deactivated} turned off` : ''}
            {result.teams_created?.length ? ` · new teams: ${result.teams_created.join(', ')}` : ''}
          </p>
        </div>
        {result.passwords?.some((p) => p.email) && (
          <Banner tone="ok">
            <strong>{result.passwords.filter((p) => p.email).length} people have an email.</strong> They can sign in with <em>Email → Forgot password</em> and set their own password — no need to send them anything.
          </Banner>
        )}
        {result.passwords?.length > 0 && (
          <Banner tone="warn" action={<Button variant="primary" onClick={() => downloadPasswords(result.passwords, { companyCode: status.company_code })}>Download first passwords (Excel)</Button>}>
            <strong>Download this now — it is shown only once.</strong> It has a one-time password for each new person{result.passwords.some((p) => !p.email) ? `; share it with the ${result.passwords.filter((p) => !p.email).length} without email` : ' (a backup in case Forgot password is not used)'}. They choose their own password after signing in.
          </Banner>
        )}
        {result.email_skipped?.length > 0 && (
          <Banner tone="warn">
            {result.email_skipped.length} {result.email_skipped.length === 1 ? 'email was' : 'emails were'} not saved because another account already uses {result.email_skipped.length === 1 ? 'it' : 'them'}: {result.email_skipped.map((s) => `${s.code} (${s.email})`).join(', ')}. They can add another email after signing in.
          </Banner>
        )}
        {result.skipped?.length > 0 && (
          <div className="rounded-md bg-subtle p-3 text-sm">
            <p className="font-semibold">Skipped {result.skipped.length}</p>
            <ul className="mt-1 list-disc pl-5 text-muted">{result.skipped.map((s) => <li key={`${s.line}-${s.code}`}>Row {s.line}{s.code ? ` (${s.code})` : ''}: {s.reason}</li>)}</ul>
          </div>
        )}
        <div><Button onClick={() => setResult(null)}>Import another sheet</Button></div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm text-muted">Upload the employee export (.xlsx). We read the employee code, name, mobile, email, department, designation, office and reporting manager. Run it again any time — people are matched by employee code, so nobody is added twice.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:brightness-110">
          {reading ? 'Reading…' : file ? 'Choose another file' : 'Choose file'}
          <input type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Employee sheet" onChange={pick} disabled={reading || busy} />
        </label>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}

      {sheet && (
        <div className="flex flex-col gap-4 motion-safe:animate-fade-up">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 font-semibold">{file?.name}</span>
            <Chip tone="info">{rows.length} employees</Chip>
            <Chip tone="ok">{fresh} new</Chip>
            <Chip>{rows.length - fresh} already here</Chip>
            {Object.entries(counts).map(([role, n]) => <Chip key={role}>{n} {ROLE_TEXT[role]}{n === 1 ? '' : 's'}</Chip>)}
          </div>
          <p className="text-xs text-muted">
            Columns found: {Object.entries(sheet.columns).map(([field, heading]) => `${LABELS[field]} (“${heading}”)`).join(' · ')}
            {!sheet.columns.email && ' · No email column — people add their email after their first sign-in.'}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line p-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">Emails <span className="font-normal text-muted">— {withEmail} of {rows.length} have one</span></p>
              <p className="text-xs text-muted">
                {emailInfo
                  ? `From ${emailInfo.file}: matched ${emailInfo.matched} of ${emailInfo.total} by name.`
                  : 'Have emails in another sheet (name + email)? Add it and we match them by name. People with an email set their own password with Forgot password.'}
              </p>
              {emailInfo?.unmatched?.length > 0 && (
                <p className="mt-1 text-xs text-warn">Not found: {emailInfo.unmatched.map((u) => `${u.name || u.code} (${u.email})`).join(', ')} — type their email in the table.</p>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center whitespace-nowrap rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-muted">
              {emailInfo ? 'Use another email sheet' : 'Add emails from a sheet'}
              <input type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Email sheet" onChange={pickEmails} />
            </label>
          </div>
          {sameEmail.size > 0 && (
            <Banner tone="warn">The same email is on more than one person: {[...sameEmail].join(', ')}. Only the first keeps it — fix it in the table.</Banner>
          )}
          {sheet.problems.length > 0 && (
            <Banner tone="warn">{sheet.problems.length} {sheet.problems.length === 1 ? 'row' : 'rows'} will be skipped: {sheet.problems.slice(0, 3).map((p) => p.text).join('; ')}{sheet.problems.length > 3 ? '…' : ''}</Banner>
          )}

          <TableWrap>
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <thead className="sticky top-0 z-[1] bg-surface"><tr><Th>Code</Th><Th>Name</Th><Th>Email</Th><Th>Department</Th><Th>Reports to</Th><Th>Role in GreenTask</Th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-t border-line">
                      <Td mono>{r.code}{!known.has(r.code) && <span className="ml-1.5 rounded bg-accent-soft px-1 text-[10px] font-bold text-accent">NEW</span>}</Td>
                      <Td><span className="font-medium">{r.name}</span>{r.designation && <span className="block text-xs text-muted">{r.designation}</span>}</Td>
                      <Td>
                        <Input aria-label={`Email for ${r.name}`} type="email" placeholder="Not added" value={r.email || ''} onChange={(e) => setEmail(r.code, e.target.value)}
                          className={`h-8 min-w-[200px] py-0 text-sm ${sameEmail.has(r.email) ? 'border-warn' : ''}`} />
                      </Td>
                      <Td>{r.department || '—'}</Td>
                      <Td>{r.manager_code ? `${nameOf.get(r.manager_code) || r.manager_name || r.manager_code}` : '—'}</Td>
                      <Td>
                        <Select aria-label={`Role for ${r.name}`} value={r.role} onChange={(e) => setRole(r.code, e.target.value)} className="h-8 py-0 text-sm">
                          {Object.entries(ROLE_TEXT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </Select>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </TableWrap>
          <p className="-mt-2 text-xs text-muted">Suggested: anyone people report to is a Manager; Director is an Admin. Change any role before importing.</p>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Teams</legend>
            <div className="grid gap-2 md:grid-cols-3">
              {TEAM_MODES.map(([value, label, help]) => (
                <label key={value} className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition ${teamMode === value ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-muted'}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="team-mode" value={value} checked={teamMode === value} onChange={() => setTeamMode(value)} className="accent-[rgb(var(--c-accent))]" />{label}</span>
                  <span className="text-xs text-muted">{help}</span>
                </label>
              ))}
            </div>
            {teamMode === 'one' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Put everyone in</span>
                <Select aria-label="Team for everyone" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-auto">
                  <option value="">A new team called “All staff”</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
            )}
          </fieldset>

          {leaving.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" />
              <span><strong>Turn off {leaving.length} {leaving.length === 1 ? 'account' : 'accounts'} not in this sheet</strong> (people who left): {leaving.slice(0, 5).map((e) => `${e.login_code} ${e.name}`).join(', ')}{leaving.length > 5 ? '…' : ''}. Their tasks stay; they can no longer sign in.</span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => { setSheet(null); setFile(null); }}>Cancel</Button>
            <Button variant="primary" disabled={busy || !rows.length} onClick={runImport}>{busy ? 'Importing…' : `Import ${rows.length} employees`}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
