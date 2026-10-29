// Reads an employee export from an HRMS (GreenHR and similar) into rows the import understands.
// Columns are found by their heading, so their order and extra columns do not matter.
const key = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// For each field, headings to look for, best first.
export const COLUMNS = {
  code: ['employeecode', 'empcode', 'employeeid', 'empid', 'employeeno', 'empno', 'staffcode', 'staffid', 'code'],
  name: ['fullname', 'employeename', 'empname', 'name'],
  email: ['officialemail', 'officeemail', 'workemail', 'companyemail', 'email', 'emailid', 'emailaddress', 'personalemail'],
  mobile: ['mobile', 'mobileno', 'mobilenumber', 'phone', 'phoneno', 'contactno', 'contactnumber'],
  department: ['department', 'dept', 'departmentname'],
  designation: ['designation', 'jobtitle', 'title', 'role'],
  location: ['officelocation', 'worklocation', 'location', 'branch'],
  manager_code: ['reportingmanagerempcode', 'reportingmanagercode', 'reportingmanageremployeecode', 'managerempcode', 'managercode', 'reportingtocode'],
  manager_name: ['reportingmanager', 'reportingmanagername', 'manager', 'managername', 'reportingto'],
};
export const LABELS = {
  code: 'Employee code', name: 'Name', email: 'Email', mobile: 'Mobile', department: 'Department', designation: 'Designation',
  location: 'Office', manager_code: 'Reporting manager code', manager_name: 'Reporting manager',
};
const LEADERS = /\b(director|ceo|founder|co-founder|owner|managing partner|partner)\b/i;

// Text of a cell from ExcelJS (rich text, links and formulas included) or a CSV.
export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
    if (value.text !== undefined) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
    return '';
  }
  return String(value).trim();
}

function findColumns(headings) {
  const keys = headings.map(key);
  const found = {};
  Object.entries(COLUMNS).forEach(([field, names]) => {
    for (const name of names) {
      const index = keys.indexOf(name);
      if (index >= 0 && !Object.values(found).includes(index)) { found[field] = index; break; }
    }
  });
  return found;
}

// matrix: rows of cell values (first rows may be titles). Returns { rows, columns, problems, error }.
export function mapRows(matrix) {
  const headerIndex = matrix.slice(0, 15).findIndex((row) => {
    const cols = findColumns(row.map(cellText));
    return cols.code !== undefined && cols.name !== undefined;
  });
  if (headerIndex < 0) return { rows: [], columns: {}, problems: [], error: 'We could not find the "Employee code" and "Name" columns. Use the employee export from your HRMS.' };
  const headings = matrix[headerIndex].map(cellText);
  const cols = findColumns(headings);
  const read = (row, field) => (cols[field] === undefined ? '' : cellText(row[cols[field]]));

  const problems = [];
  const rows = [];
  matrix.slice(headerIndex + 1).forEach((raw, i) => {
    if (!raw || raw.every((cell) => !cellText(cell))) return;
    const line = headerIndex + i + 2;
    const row = Object.fromEntries(Object.keys(COLUMNS).map((field) => [field, read(raw, field)]));
    row.code = row.code.toUpperCase().replace(/\s+/g, '');
    if (!row.code || !row.name) { problems.push({ line, text: `Row ${line}: ${!row.code ? 'no employee code' : 'no name'} — skipped` }); return; }
    if (rows.some((r) => r.code === row.code)) { problems.push({ line, text: `Row ${line}: ${row.code} appears again — skipped` }); return; }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) row.email = '';
    rows.push({ ...row, line });
  });

  // Reporting manager by name when the sheet has no manager code column.
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.code]));
  rows.forEach((r) => {
    r.manager_code = r.manager_code.toUpperCase().replace(/\s+/g, '');
    if (!r.manager_code && r.manager_name) r.manager_code = byName.get(r.manager_name.toLowerCase()) || '';
    if (r.manager_code === r.code) r.manager_code = '';
  });
  // Suggested roles: leaders are admins, anyone people report to is a manager, everyone else an employee.
  const managers = new Set(rows.map((r) => r.manager_code).filter(Boolean));
  rows.forEach((r) => {
    r.role = LEADERS.test(`${r.designation} ${r.department}`) ? 'admin' : managers.has(r.code) ? 'manager' : 'person';
  });

  const columns = Object.fromEntries(Object.entries(cols).map(([field, index]) => [field, headings[index]]));
  return { rows, columns, problems, error: rows.length ? '' : 'The sheet has no employees under the headings.' };
}

function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A second sheet that only has names (or codes) and emails, e.g. a birthday or contact list.
export function mapEmailRows(matrix) {
  const pick = (keys, names, loose) => {
    for (const n of names) { const i = keys.indexOf(n); if (i >= 0) return i; }
    return loose ? keys.findIndex(loose) : -1;
  };
  for (let h = 0; h < Math.min(15, matrix.length); h += 1) {
    const keys = (matrix[h] || []).map((cell) => key(cellText(cell)));
    const email = pick(keys, COLUMNS.email, (k) => k.includes('mail'));
    const name = pick(keys, COLUMNS.name, (k) => k.includes('name') && !k.includes('manager'));
    if (email < 0 || name < 0) continue;
    const code = pick(keys, COLUMNS.code);
    const rows = matrix.slice(h + 1).map((raw) => ({
      code: code >= 0 ? cellText(raw?.[code]).toUpperCase().replace(/\s+/g, '') : '',
      name: cellText(raw?.[name]),
      email: cellText(raw?.[email]).toLowerCase(),
    })).filter((r) => (r.name || r.code) && EMAIL_RE.test(r.email));
    return { rows, error: rows.length ? '' : 'No emails found under the headings.' };
  }
  return { rows: [], error: 'We could not find a name column and an email column in this sheet.' };
}

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const nameTokens = (s) => nameKey(s).split(' ').filter((t) => t.length > 1);
const within = (a, b) => a.length > 0 && a.every((t) => b.includes(t));
// Same word, a short form ("anu" ↔ "anuradha") or one letter off ("bhatar" ↔ "bhatad").
const closeWord = (a, b) => a === b
  || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)))
  || (a.length > 3 && a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1);
const closeName = (a, b) => a.length > 1 && b.length > 1 && closeWord(a[0], b[0]) && closeWord(a[a.length - 1], b[b.length - 1]);

// Puts emails on employees: by code, then exact name, then a name that contains the other
// ("Asha Rao" ↔ "Asha Kumari Rao") when that points to exactly one person. Emails already in the
// HRMS sheet are kept. Returns the rows and what could not be matched.
export function matchEmails(rows, emailRows) {
  const out = rows.map((r) => ({ ...r }));
  const taken = new Set(out.map((r, i) => (r.email ? i : -1)).filter((i) => i >= 0));
  const done = new Set();
  const give = (target, source) => {
    const index = out.indexOf(target);
    if (taken.has(index)) return;
    out[index] = { ...target, email: source.email, email_from_sheet: true };
    taken.add(index);
  };
  const passes = [
    (src) => src.code && out.filter((r) => r.code === src.code),
    (src) => out.filter((r) => nameKey(r.name) === nameKey(src.name)),
    (src) => out.filter((r, i) => !taken.has(i) && (within(nameTokens(src.name), nameTokens(r.name)) || within(nameTokens(r.name), nameTokens(src.name)))),
    (src) => out.filter((r, i) => !taken.has(i) && closeName(nameTokens(src.name), nameTokens(r.name))),
  ];
  passes.forEach((find) => emailRows.forEach((src, s) => {
    if (done.has(s)) return;
    const hits = find(src) || [];
    if (hits.length === 1) { give(hits[0], src); done.add(s); }
  }));
  const unmatched = emailRows.filter((_, s) => !done.has(s));
  const counts = out.reduce((m, r) => (r.email ? m.set(r.email, (m.get(r.email) || 0) + 1) : m), new Map());
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([email]) => email);
  return { rows: out, matched: done.size, unmatched, duplicates };
}

async function readMatrix(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.csv')) return { matrix: parseCsv(await file.text()) };
  if (!name.endsWith('.xlsx')) return { error: 'Choose an .xlsx or .csv file. If your HRMS gives .xls, open it in Excel and save as .xlsx.' };
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: 'The file has no sheets.' };
  const matrix = [];
  sheet.eachRow({ includeEmpty: true }, (row, number) => { matrix[number - 1] = (row.values || []).slice(1); });
  return { matrix: Array.from(matrix, (row) => row || []) };
}

// Reads the uploaded file (.xlsx or .csv) from the first sheet.
export async function readSheetFile(file) {
  const { matrix, error } = await readMatrix(file);
  return error ? { rows: [], columns: {}, problems: [], error } : mapRows(matrix);
}

export async function readEmailFile(file) {
  const { matrix, error } = await readMatrix(file);
  return error ? { rows: [], error } : mapEmailRows(matrix);
}
