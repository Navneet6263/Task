import { downloadWorkbook } from '../../../services/excelExport';

const ROLE_TEXT = { admin: 'Admin', manager: 'Manager', person: 'Employee' };

// Everyone with their sign-in details: code, email and a one-time password for people who have not
// signed in yet. People who already chose their own password are marked instead.
export function downloadLoginSheet(people, { companyCode, orgName } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return downloadWorkbook({
    fileName: `greentask-login-sheet-${orgName ? `${orgName}-` : ''}${today}`.replace(/[^a-z0-9-]+/gi, '-'),
    title: `GreenTask — login sheet${orgName ? ` · ${orgName}` : ''}`,
    lines: [
      'Sign in with "Employee code" + password, or with "Email" + password.',
      'People with an email can also use Email → Forgot password to set their own password.',
      companyCode ? `If asked for a company code, use ${companyCode}.` : '',
      'One-time passwords in this sheet replace any older sheet. Share each line privately, then delete the file.',
    ].filter(Boolean),
    sheets: [{
      name: 'Login sheet',
      columns: [
        { key: 'code', label: 'Employee code' },
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role', value: (row) => ROLE_TEXT[row.role] || row.role },
        { key: 'department', label: 'Department' },
        { key: 'email', label: 'Email (sign-in)', value: (row) => row.email || 'Not added' },
        { key: 'password', label: 'Password', value: (row) => row.password || 'Set by employee (use Forgot password if lost)' },
        { key: 'signed_in', label: 'Signed in yet?', value: (row) => (row.signed_in ? 'Yes' : 'Not yet'), tone: (row) => (row.signed_in ? 'ok' : 'warn') },
      ],
      rows: people,
      note: 'Keep this private. Anyone with a line from this sheet can sign in as that person until they set their own password.',
    }],
  });
}

// The one-time passwords for new (or reset) accounts, as an Excel sheet the admin shares privately.
export function downloadPasswords(people, { companyCode, orgName } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return downloadWorkbook({
    fileName: `greentask-first-passwords-${today}`,
    title: 'GreenTask — first sign-in passwords',
    lines: [
      'Sign in at GreenTask → "Employee code" → your code and the password below.',
      companyCode ? `If asked for a company code, use ${companyCode}${orgName ? ` (${orgName})` : ''}.` : '',
      'Each password works once: you choose your own right after signing in. Delete this file after sharing.',
    ].filter(Boolean),
    sheets: [{
      name: 'Passwords',
      columns: [
        { key: 'code', label: 'Employee code' },
        { key: 'name', label: 'Name' },
        { key: 'password', label: 'One-time password' },
        { key: 'email', label: 'Email', value: (row) => row.email || 'Not added — they add it after signing in' },
      ],
      rows: people,
      note: 'Keep this private. Anyone with a line from this sheet can sign in as that person until they set their own password.',
    }],
  });
}
