const db = require('../config/database');

// Files sent in chat (supporting documents). At most 1 MB each. Only common document and picture types,
// checked by their first bytes as well as their name, so a renamed program or web page never gets in.
// A file is uploaded first (raw bytes, no base64), then claimed by the message that carries it.

const MAX_BYTES = 1024 * 1024;
const TOO_BIG = 'This file is over 1 MB. Please compress it first, then attach it again.';
const fail = (status, message) => Object.assign(new Error(message), { status });

const starts = (bytes, sig) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const isText = (bytes) => !bytes.subarray(0, 8192).includes(0);
const TYPES = {
  pdf: ['application/pdf', (b) => starts(b, [0x25, 0x50, 0x44, 0x46])],
  png: ['image/png', (b) => starts(b, [0x89, 0x50, 0x4e, 0x47])],
  jpg: ['image/jpeg', (b) => starts(b, [0xff, 0xd8, 0xff])],
  jpeg: ['image/jpeg', (b) => starts(b, [0xff, 0xd8, 0xff])],
  gif: ['image/gif', (b) => starts(b, [0x47, 0x49, 0x46, 0x38])],
  webp: ['image/webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', (b) => starts(b, ZIP)],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', (b) => starts(b, ZIP)],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', (b) => starts(b, ZIP)],
  doc: ['application/msword', (b) => starts(b, OLE)],
  xls: ['application/vnd.ms-excel', (b) => starts(b, OLE)],
  ppt: ['application/vnd.ms-powerpoint', (b) => starts(b, OLE)],
  csv: ['text/csv', isText],
  txt: ['text/plain', isText],
};
const ALLOWED = Object.keys(TYPES);

async function ensureChatFilesSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.chat_attachments', 'U') IS NULL
      CREATE TABLE dbo.chat_attachments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        team_id INT NOT NULL,
        message_id INT NULL,
        uploaded_by INT NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        mime VARCHAR(120) NOT NULL,
        size INT NOT NULL,
        data VARBINARY(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_chat_attachments_message' AND object_id = OBJECT_ID('dbo.chat_attachments'))
      CREATE INDEX ix_chat_attachments_message ON dbo.chat_attachments(message_id);
  `);
}

// Name and bytes → { name, mime, size }, or a clear refusal.
function checkFile(rawName, bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw fail(422, 'The file is empty.');
  if (bytes.length > MAX_BYTES) throw fail(413, TOO_BIG);
  let name = String(rawName || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(-200);
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (!TYPES[ext]) throw fail(422, `This kind of file cannot be sent. Use PDF, Word, Excel, PowerPoint, CSV, text or a picture (${ALLOWED.join(', ')}).`);
  const [mime, real] = TYPES[ext];
  if (!real(bytes)) throw fail(422, 'This file does not match its type. Save it again and attach it once more.');
  if (!name || name.startsWith('.')) name = `file.${ext}`;
  return { name, mime, size: bytes.length };
}

// Upload step: stored without a message yet. Old uploads that were never sent are cleared on the way.
async function saveUpload(teamId, userId, rawName, bytes) {
  const file = checkFile(rawName, bytes);
  await db.execute('DELETE FROM chat_attachments WHERE uploaded_by = ? AND message_id IS NULL AND created_at < DATEADD(DAY, -1, SYSDATETIME())', [userId]).catch(() => {});
  const [result] = await db.execute(
    'INSERT INTO chat_attachments (team_id, uploaded_by, file_name, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)',
    [teamId, userId, file.name, file.mime, file.size, bytes]
  );
  return { id: result.insertId, file_name: file.name, mime: file.mime, size: file.size };
}

// Send step: only the person who uploaded it, in the same team, and only once.
async function claim(attachmentId, teamId, userId, messageId) {
  const [result] = await db.execute(
    'UPDATE chat_attachments SET message_id = ? WHERE id = ? AND team_id = ? AND uploaded_by = ? AND message_id IS NULL',
    [messageId, attachmentId, teamId, userId]
  );
  if (!Number(result.affectedRows)) throw fail(422, 'That file is no longer available. Attach it again.');
}

async function uploadedBy(attachmentId, teamId, userId) {
  const [[row]] = await db.execute(
    'SELECT id FROM chat_attachments WHERE id = ? AND team_id = ? AND uploaded_by = ? AND message_id IS NULL', [attachmentId, teamId, userId]
  );
  return Boolean(row);
}

// message id → { id, file_name, mime, size } for the messages on screen.
async function attachmentsFor(messageIds) {
  const ids = [...new Set((messageIds || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!ids.length) return {};
  const [rows] = await db.execute(
    `SELECT id, message_id, file_name, mime, size FROM chat_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`, ids
  );
  return Object.fromEntries(rows.map((r) => [r.message_id, { id: r.id, file_name: r.file_name, mime: r.mime, size: Number(r.size) }]));
}

async function withAttachments(messages) {
  const map = await attachmentsFor(messages.map((m) => m.id));
  return messages.map((m) => (map[m.id] ? { ...m, attachment: map[m.id] } : m));
}

// The file with the thread of its message, for the download access check.
async function loadForDownload(attachmentId, teamId) {
  const [[row]] = await db.execute(
    `SELECT a.id, a.file_name, a.mime, a.size, a.data, m.thread_id
     FROM chat_attachments a JOIN team_messages m ON m.id = a.message_id
     WHERE a.id = ? AND a.team_id = ?`, [attachmentId, teamId]
  );
  return row || null;
}

module.exports = { MAX_BYTES, TOO_BIG, ALLOWED, ensureChatFilesSchema, checkFile, saveUpload, claim, uploadedBy, attachmentsFor, withAttachments, loadForDownload };
