const crypto = require('crypto');
const db = require('../config/database');

// Profile photos. The picture lives in its own table; users.avatar keeps only a short link to it, so
// task lists never carry image data. The link holds a random token, so <img> can load it without a
// sign-in header and nobody can walk through other people's photos by number.

const MAX_BYTES = 300 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });

async function ensureAvatarSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.user_avatars', 'U') IS NULL
      CREATE TABLE dbo.user_avatars (
        user_id INT NOT NULL PRIMARY KEY REFERENCES dbo.users(id),
        token CHAR(32) NOT NULL,
        mime VARCHAR(20) NOT NULL,
        image VARBINARY(MAX) NOT NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_user_avatars_token' AND object_id = OBJECT_ID('dbo.user_avatars'))
      CREATE UNIQUE INDEX ux_user_avatars_token ON dbo.user_avatars(token);
  `);
  // Team photos work the same way: teams.photo keeps only the link.
  await db.query(`
    IF OBJECT_ID('dbo.team_photos', 'U') IS NULL
      CREATE TABLE dbo.team_photos (
        team_id INT NOT NULL PRIMARY KEY REFERENCES dbo.teams(id),
        token CHAR(32) NOT NULL,
        mime VARCHAR(20) NOT NULL,
        image VARBINARY(MAX) NOT NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_team_photos_token' AND object_id = OBJECT_ID('dbo.team_photos'))
      CREATE UNIQUE INDEX ux_team_photos_token ON dbo.team_photos(token);
  `);
  await db.query(`IF COL_LENGTH('dbo.teams', 'photo') IS NULL ALTER TABLE dbo.teams ADD photo NVARCHAR(255) NULL;`);
}

// Only real PNG, JPEG or WebP pictures, checked by their first bytes, never SVG (it can carry script).
function readImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw fail(422, 'Upload a PNG, JPEG or WebP picture');
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) throw fail(422, 'The picture must be under 300 KB');
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const real = { 'image/png': isPng, 'image/jpeg': isJpeg, 'image/webp': isWebp }[m[1]];
  if (!real) throw fail(422, 'That file is not a real picture');
  return { mime: m[1], bytes };
}

// Save a new photo; a new token each time, so browsers show the new one at once.
async function saveAvatar(userId, dataUrl, baseUrl) {
  const { mime, bytes } = readImage(dataUrl);
  const token = crypto.randomBytes(16).toString('hex');
  await db.execute(
    `MERGE user_avatars AS a USING (SELECT ? AS user_id) AS s ON a.user_id = s.user_id
     WHEN MATCHED THEN UPDATE SET token = ?, mime = ?, image = ?, updated_at = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (user_id, token, mime, image) VALUES (s.user_id, ?, ?, ?);`,
    [userId, token, mime, bytes, token, mime, bytes]
  );
  const url = `${baseUrl}/api/users/avatar/${token}`;
  await db.execute('UPDATE users SET avatar = ? WHERE id = ?', [url, userId]);
  return url;
}

async function removeAvatar(userId) {
  await db.execute('DELETE FROM user_avatars WHERE user_id = ?', [userId]);
  await db.execute('UPDATE users SET avatar = NULL WHERE id = ?', [userId]);
}

// GET /api/users/avatar/:token, open to <img> tags.
async function serveAvatar(req, res) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).end();
  try {
    const [[row]] = await db.execute('SELECT a.mime, a.image FROM user_avatars a JOIN users u ON u.id = a.user_id AND u.is_deleted = 0 WHERE a.token = ?', [token]);
    if (!row) return res.status(404).end();
    res.set({ 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
    return res.send(Buffer.from(row.image));
  } catch { return res.status(500).end(); }
}

// A team's photo (its logo), shown instead of the coloured letters.
async function saveTeamPhoto(teamId, dataUrl, baseUrl) {
  const { mime, bytes } = readImage(dataUrl);
  const token = crypto.randomBytes(16).toString('hex');
  await db.execute(
    `MERGE team_photos AS p USING (SELECT ? AS team_id) AS s ON p.team_id = s.team_id
     WHEN MATCHED THEN UPDATE SET token = ?, mime = ?, image = ?, updated_at = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (team_id, token, mime, image) VALUES (s.team_id, ?, ?, ?);`,
    [teamId, token, mime, bytes, token, mime, bytes]
  );
  const url = `${baseUrl}/api/teams/photo/${token}`;
  await db.execute('UPDATE teams SET photo = ? WHERE id = ?', [url, teamId]);
  return url;
}

async function removeTeamPhoto(teamId) {
  await db.execute('DELETE FROM team_photos WHERE team_id = ?', [teamId]);
  await db.execute('UPDATE teams SET photo = NULL WHERE id = ?', [teamId]);
}

// GET /api/teams/photo/:token, open to <img> tags like profile photos.
async function serveTeamPhoto(req, res) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).end();
  try {
    const [[row]] = await db.execute('SELECT p.mime, p.image FROM team_photos p JOIN teams t ON t.id = p.team_id AND t.is_deleted = 0 WHERE p.token = ?', [token]);
    if (!row) return res.status(404).end();
    res.set({ 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
    return res.send(Buffer.from(row.image));
  } catch { return res.status(500).end(); }
}

module.exports = { MAX_BYTES, ensureAvatarSchema, readImage, saveAvatar, removeAvatar, serveAvatar, saveTeamPhoto, removeTeamPhoto, serveTeamPhoto };
