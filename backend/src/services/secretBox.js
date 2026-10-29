const crypto = require('crypto');

// Small AES-256-GCM box for secrets we must use later (like a mailbox password), so they are never
// stored as plain text. The key comes from SECRET_BOX_KEY, falling back to JWT_SECRET.
const key = () => crypto.createHash('sha256').update(String(process.env.SECRET_BOX_KEY || process.env.JWT_SECRET || '')).digest();

function seal(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function open(sealed) {
  const [version, iv, tag, data] = String(sealed || '').split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { seal, open };
