const crypto = require('crypto');
const db = require('../config/database');
const { isModuleEnabled } = require('./orgModules');

// "Sheet to task": the person who links a sheet picks which column feeds which task field and which
// fields a row must have. New rows become tasks for that person in their chosen team, once a day and
// whenever they press "Sync now".

const FIELDS = [
  { key: 'title', label: 'Task title', always: true, words: ['title', 'task', 'task name', 'subject', 'work', 'kaam', 'activity'] },
  { key: 'description', label: 'Description', words: ['description', 'details', 'detail', 'notes', 'note', 'remarks', 'remark', 'comments'] },
  { key: 'due_date', label: 'Due date', words: ['due date', 'due', 'deadline', 'end date', 'target date', 'due on'] },
  { key: 'start_date', label: 'Start date', words: ['start date', 'start', 'from', 'begin'] },
  { key: 'priority', label: 'Priority', words: ['priority', 'urgency', 'importance'] },
  { key: 'client_name', label: 'Client', words: ['client', 'client name', 'customer', 'company', 'party'] },
  { key: 'category', label: 'Category', words: ['category', 'type', 'work type', 'job type'] },
];
const FIELD_KEYS = FIELDS.map((f) => f.key);
const LIMITS = { title: 255, description: 5000, client_name: 255, category: 120 };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const norm = (value) => clean(value).toLowerCase().replace(/[^a-z0-9 ]/g, '');

// Google Sheets only for now: the share link becomes its CSV export. Fixed host, so the server never
// fetches an address a user typed in.
function sheetCsvUrl(link) {
  let url;
  try { url = new URL(String(link || '').trim()); } catch { throw fail(422, 'Paste the full link of your Google Sheet'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') throw fail(422, 'Only Google Sheets links work for now (docs.google.com)');
  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)\/pub/);
  const gid = url.searchParams.get('gid') || (url.hash.match(/gid=(\d+)/) || [])[1] || '';
  if (published) return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  const id = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (!id) throw fail(422, 'That does not look like a Google Sheets link');
  return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// The first non-empty row holds the column names; the rows under it keep their sheet row numbers.
function tableOf(csvRows) {
  const headerIndex = csvRows.findIndex((r) => r.some((cell) => clean(cell)));
  if (headerIndex === -1) return { headers: [], rows: [] };
  const headers = csvRows[headerIndex].map(clean);
  const rows = csvRows.slice(headerIndex + 1, headerIndex + 1 + MAX_ROWS)
    .map((cells, i) => ({ number: headerIndex + 2 + i, values: Object.fromEntries(headers.map((h, c) => [h, clean(cells[c])])) }))
    .filter((r) => Object.values(r.values).some(Boolean));
  return { headers: headers.filter(Boolean), rows };
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { signal: controller.signal, redirect: 'follow' }); }
  finally { clearTimeout(timer); }
}

async function readSheet(link) {
  const url = sheetCsvUrl(link);
  let response;
  // One retry: Google's export hop sometimes drops a connection.
  try { response = await download(url).catch(() => download(url)); }
  catch { throw fail(502, 'Could not reach Google Sheets. Try again in a minute.'); }
  const type = String(response.headers.get('content-type') || '');
  if (!response.ok || type.includes('text/html')) throw fail(422, 'The sheet is private. In Google Sheets choose Share → "Anyone with the link" → Viewer, then try again.');
  const text = await response.text();
  if (text.length > MAX_BYTES) throw fail(422, 'The sheet is too big (over 5 MB). Keep task rows in their own tab.');
  return tableOf(parseCsv(text));
}

// A best guess of which column feeds which field, by the column's name.
function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  FIELDS.forEach((field) => {
    const hit = headers.find((h) => !used.has(h) && field.words.includes(norm(h)))
      || headers.find((h) => !used.has(h) && field.words.some((w) => norm(h).includes(w)));
    if (hit) { mapping[field.key] = hit; used.add(hit); }
  });
  return mapping;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
// Dates as people type them in India: 2026-11-05, 05/11/2026, 5-11-26, 5 Nov 2026, 05-Nov-2026.
function parseDate(value) {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  let y; let m; let d;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [, y, m, d] = match.map(Number);
  else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) [, d, m, y] = match.map(Number);
  else if ((match = text.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-,]+(\d{2}|\d{4})$/))) { d = Number(match[1]); m = MONTHS.indexOf(match[2]) + 1; y = Number(match[3]); }
  else return undefined;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!m || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parsePriority(value) {
  const text = norm(value);
  if (!text) return null;
  if (['high', 'urgent', 'critical', 'p1', 'top', 'asap'].includes(text)) return 'HIGH';
  if (['low', 'p3', 'minor'].includes(text)) return 'LOW';
  if (['medium', 'normal', 'p2', 'mid', 'moderate'].includes(text)) return 'MEDIUM';
  return undefined;
}

// One sheet row as a task, or the reasons it cannot be one yet.
function rowToTask(values, mapping, required) {
  const pick = (key) => (mapping[key] ? clean(values[mapping[key]]) : '');
  const task = {};
  const problems = [];
  FIELDS.forEach(({ key, label }) => {
    const raw = pick(key);
    const needed = key === 'title' || required.includes(key);
    if (!raw) { if (needed) problems.push(`${label} is empty`); return; }
    if (key === 'due_date' || key === 'start_date') {
      const date = parseDate(raw);
      if (!date) problems.push(`${label} "${raw}" is not a date`); else task[key] = date;
    } else if (key === 'priority') {
      const priority = parsePriority(raw);
      if (!priority) problems.push(`Priority "${raw}" should be High, Medium or Low`); else task.priority = priority;
    } else task[key] = raw.slice(0, LIMITS[key]);
  });
  if (task.start_date && task.due_date && task.start_date > task.due_date) problems.push('Start date is after the due date');
  return { task, problems };
}

const hashOf = (values, mapping) => crypto.createHash('sha256')
  .update(JSON.stringify(FIELD_KEYS.map((key) => (mapping[key] ? clean(values[mapping[key]]) : ''))))
  .digest('hex');

// Which rows are new. A row is done when its content already made a task (even if it moved), or when
// its row number made a task whose content is gone from the sheet (the row was edited afterwards).
function newRows(rows, mapping, recorded) {
  const doneHashes = new Set(recorded.map((r) => r.row_hash));
  const byNumber = new Map(recorded.map((r) => [Number(r.row_number), r.row_hash]));
  const current = rows.map((row) => ({ ...row, hash: hashOf(row.values, mapping) }));
  const currentHashes = new Set(current.map((r) => r.hash));
  const seen = new Set();
  const fresh = [];
  const edited = [];
  current.forEach((row) => {
    if (doneHashes.has(row.hash) || seen.has(row.hash)) return;
    seen.add(row.hash);
    const before = byNumber.get(row.number);
    if (before && !currentHashes.has(before)) edited.push(row); else fresh.push(row);
  });
  return { fresh, edited };
}

function readSettings(body) {
  const mapping = {};
  const raw = body?.mapping && typeof body.mapping === 'object' ? body.mapping : {};
  FIELD_KEYS.forEach((key) => { const header = clean(raw[key]); if (header) mapping[key] = header.slice(0, 200); });
  if (!mapping.title) throw fail(422, 'Choose the column that has the task title');
  const required = (Array.isArray(body?.required) ? body.required : []).filter((key) => FIELD_KEYS.includes(key) && key !== 'title' && mapping[key]);
  return { mapping, required: [...new Set(required)] };
}

const parseJson = (text, fallback) => { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } };

// Create tasks from a link's new rows. `seedOnly` marks today's rows as done without making tasks,
// for people who want only rows added from now on.
async function syncLink(linkId, { seedOnly = false } = {}) {
  const [[link]] = await db.execute(
    `SELECT l.*, u.is_deleted AS user_deleted FROM task_sheet_links l JOIN users u ON u.id = l.user_id WHERE l.id = ?`, [linkId]
  );
  if (!link) throw fail(404, 'Sheet link not found');
  if (!await isModuleEnabled(link.org_id, 'sheet_to_task')) throw fail(403, 'Sheet to task is off for this organization');
  if (link.user_deleted) throw fail(409, 'The person who linked this sheet no longer has an account');
  const [[member]] = await db.execute(
    'SELECT tm.id FROM team_members tm JOIN teams t ON t.id = tm.team_id AND t.is_deleted = 0 WHERE tm.team_id = ? AND tm.user_id = ?',
    [link.team_id, link.user_id]
  );
  if (!member) throw fail(409, 'You are no longer in the team this sheet adds tasks to. Pick another team.');

  const mapping = parseJson(link.mapping, {});
  const required = parseJson(link.required_fields, []);
  const result = { at: new Date().toISOString(), created: 0, skipped: [], edited: 0, rows: 0 };
  try {
    const { headers, rows } = await readSheet(link.source_url);
    result.rows = rows.length;
    const missingColumns = Object.entries(mapping).filter(([, header]) => !headers.includes(header)).map(([key]) => FIELDS.find((f) => f.key === key)?.label || key);
    if (missingColumns.includes('Task title')) throw fail(422, `The title column "${mapping.title}" is no longer in the sheet. Update the column matching.`);
    const [recorded] = await db.execute('SELECT row_number, row_hash FROM task_sheet_rows WHERE link_id = ?', [link.id]);
    const { fresh, edited } = newRows(rows, mapping, recorded);
    result.edited = edited.length;
    if (missingColumns.length) result.skipped.push({ row: null, reason: `Columns not found: ${missingColumns.join(', ')}` });
    const today = new Date().toISOString().slice(0, 10);

    for (const row of fresh) {
      if (seedOnly) {
        await db.execute('INSERT INTO task_sheet_rows (link_id, row_number, row_hash) VALUES (?, ?, ?)', [link.id, row.number, row.hash]);
        continue;
      }
      const { task, problems } = rowToTask(row.values, mapping, required);
      // Rows that are not ready stay new, so they become tasks once someone fills them in.
      if (problems.length) { result.skipped.push({ row: row.number, reason: problems.join('; ') }); continue; }
      const [created] = await db.execute(
        `INSERT INTO tasks (title, description, priority, status, assigned_to, assigned_by, team_id, org_id, issue_type,
           assigned_date, start_date, due_date, client_name, category)
         VALUES (?, ?, ?, 'TODO', ?, ?, ?, ?, 'task', ?, ?, ?, ?, ?)`,
        [task.title, task.description || null, task.priority || 'MEDIUM', link.user_id, link.user_id, link.team_id, link.org_id,
          today, task.start_date || null, task.due_date || null, task.client_name || null, task.category || null]
      );
      await db.execute('INSERT INTO task_sheet_rows (link_id, row_number, row_hash, task_id) VALUES (?, ?, ?, ?)', [link.id, row.number, row.hash, created.insertId]);
      try {
        await db.execute(
          `INSERT INTO audit_logs (team_id, task_id, user_id, activity, task_details, description, automated_by)
           VALUES (?, ?, ?, 'Task Created', ?, ?, 'sheet')`,
          [link.team_id, created.insertId, link.user_id, task.title, `Created from row ${row.number} of the sheet "${link.name}"`]
        );
      } catch (_) { /* the task matters more than its log line */ }
      result.created += 1;
    }
  } catch (error) {
    result.error = error.message;
    await db.execute('UPDATE task_sheet_links SET last_synced_at = SYSDATETIME(), last_result = ? WHERE id = ?', [JSON.stringify(result), link.id]);
    throw error;
  }
  result.skipped = result.skipped.slice(0, 50);
  await db.execute('UPDATE task_sheet_links SET last_synced_at = SYSDATETIME(), last_result = ? WHERE id = ?', [JSON.stringify(result), link.id]);
  return result;
}

// End of day: every active link in organizations that have the module on.
async function syncAllSheets() {
  const [links] = await db.execute(
    `SELECT l.id FROM task_sheet_links l
     JOIN org_modules m ON m.org_id = l.org_id AND m.module_key = 'sheet_to_task' AND m.is_enabled = 1
     WHERE l.is_active = 1`
  );
  let created = 0;
  for (const { id } of links) {
    try { created += (await syncLink(id)).created; }
    catch (error) { console.error(`[SHEET→TASK] link ${id}:`, error.message); }
  }
  return { links: links.length, created };
}

module.exports = {
  FIELDS: FIELDS.map(({ key, label, always }) => ({ key, label, always: Boolean(always) })),
  sheetCsvUrl, parseCsv, tableOf, readSheet, suggestMapping, parseDate, parsePriority, rowToTask, newRows, hashOf, readSettings,
  syncLink, syncAllSheets,
};
