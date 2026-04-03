const normalizeEmployeeId = (value) => {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]/g, '');

  return cleaned || null;
};

const buildGeneratedCandidate = (prefix, seed = '') => {
  const cleanPrefix = String(prefix || 'USR')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'USR';

  const cleanSeed = String(seed || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  if (cleanSeed) {
    return `${cleanPrefix}-${cleanSeed}`;
  }

  const uniquePart = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  return `${cleanPrefix}-${uniquePart}`;
};

const ensureUniqueEmployeeId = async (db, preferredValue, prefix = 'USR', seed = '') => {
  const normalized = normalizeEmployeeId(preferredValue);
  if (normalized) return normalized;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildGeneratedCandidate(prefix, attempt === 0 ? seed : '');
    const [rows] = await db.execute(
      'SELECT TOP 1 id FROM users WHERE employee_id = ?',
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }

  return buildGeneratedCandidate(prefix);
};

module.exports = {
  normalizeEmployeeId,
  ensureUniqueEmployeeId,
};
