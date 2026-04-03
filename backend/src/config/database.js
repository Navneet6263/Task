const sql = require('mssql');

let poolPromise = null;

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
};

const config = {
  server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER || undefined,
  password: process.env.DB_PASSWORD || undefined,
  domain: process.env.DB_DOMAIN || undefined,
  pool: {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: 0,
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000),
  },
  options: {
    encrypt: parseBool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: parseBool(process.env.DB_TRUST_SERVER_CERT, true),
    enableArithAbort: true,
  },
};

const isNullLike = (value) => value === undefined || value === null;

const buildRequest = (pool, params) => {
  const request = pool.request();

  params.forEach((value, index) => {
    const name = `p${index + 1}`;

    if (isNullLike(value)) {
      request.input(name, sql.NVarChar, null);
      return;
    }

    if (typeof value === 'boolean') {
      request.input(name, sql.Bit, value);
      return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (Number.isInteger(value)) {
        if (value > 2147483647 || value < -2147483648) {
          request.input(name, sql.BigInt, value);
          return;
        }

        request.input(name, sql.Int, value);
        return;
      }

      request.input(name, sql.Float, value);
      return;
    }

    if (typeof value === 'bigint') {
      request.input(name, sql.BigInt, value.toString());
      return;
    }

    if (value instanceof Date) {
      request.input(name, sql.DateTime2, value);
      return;
    }

    request.input(name, sql.NVarChar, value);
  });

  return request;
};

const replaceBooleanLiterals = (query) => query
  .replace(/\bTRUE\b/gi, '1')
  .replace(/\bFALSE\b/gi, '0');

const replaceDateFunctions = (query) => query
  .replace(/\bNOW\(\)/gi, 'GETDATE()')
  .replace(/\bCURDATE\(\)/gi, 'CAST(GETDATE() AS DATE)')
  .replace(/\bDATE\(([^)]+)\)/gi, 'CAST($1 AS DATE)')
  .replace(/\bTIMESTAMPDIFF\s*\(\s*HOUR\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi, 'DATEDIFF(HOUR, $1, $2)')
  .replace(/\bHOUR\s*\(([^)]+)\)/gi, 'DATEPART(HOUR, $1)')
  .replace(/\bDATE_SUB\s*\(\s*GETDATE\(\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, 'DATEADD(DAY, -$1, GETDATE())')
  .replace(/\bDATE_SUB\s*\(\s*GETDATE\(\)\s*,\s*INTERVAL\s+(\d+)\s+HOUR\s*\)/gi, 'DATEADD(HOUR, -$1, GETDATE())')
  .replace(/\bDATE_SUB\s*\(\s*GETDATE\(\)\s*,\s*INTERVAL\s+(\d+)\s+MINUTE\s*\)/gi, 'DATEADD(MINUTE, -$1, GETDATE())');

const replacePlaceholders = (query) => {
  let index = 0;
  return query.replace(/\?/g, () => {
    index += 1;
    return `@p${index}`;
  });
};

const addInsertOutput = (query, isIgnoreInsert) => {
  if (isIgnoreInsert) return query;
  if (!/^\s*INSERT\s+INTO\s+/i.test(query)) return query;
  if (!/\bVALUES\b/i.test(query)) return query;
  if (/\bOUTPUT\b/i.test(query)) return query;

  if (/^\s*INSERT\s+INTO\s+[^\s(]+\s*\(/i.test(query)) {
    return query.replace(
      /^\s*INSERT\s+INTO\s+([^\s(]+)\s*(\([\s\S]*?\))\s*(VALUES\b)/i,
      'INSERT INTO $1 $2 OUTPUT INSERTED.id AS insertId $3'
    );
  }

  return query.replace(
    /^\s*INSERT\s+INTO\s+([^\s(]+)\s*(VALUES\b)/i,
    'INSERT INTO $1 OUTPUT INSERTED.id AS insertId $2'
  );
};

const transformLimitClause = (query) => {
  const limitMatch = query.match(/\sLIMIT\s+(@p\d+|\d+)(?:\s+OFFSET\s+(@p\d+|\d+))?\s*;?\s*$/i);
  if (!limitMatch) return query;

  const limitExpr = limitMatch[1];
  const offsetExpr = limitMatch[2];
  const beforeLimit = query.slice(0, limitMatch.index);
  const hasOrderBy = /\bORDER\s+BY\b/i.test(beforeLimit);

  if (offsetExpr) {
    const ordered = hasOrderBy ? beforeLimit : `${beforeLimit} ORDER BY (SELECT NULL)`;
    return `${ordered} OFFSET ${offsetExpr} ROWS FETCH NEXT ${limitExpr} ROWS ONLY`;
  }

  if (hasOrderBy) {
    return `${beforeLimit} OFFSET 0 ROWS FETCH NEXT ${limitExpr} ROWS ONLY`;
  }

  return beforeLimit.replace(/^\s*SELECT\s+/i, (match) => `${match}TOP (${limitExpr}) `);
};

const wrapIgnoreInsert = (query, isIgnoreInsert) => {
  if (!isIgnoreInsert) return query;
  const insertQuery = query.replace(/^\s*INSERT\s+IGNORE\s+/i, 'INSERT ');
  return [
    'BEGIN TRY',
    insertQuery,
    'END TRY',
    'BEGIN CATCH',
    '  IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;',
    'END CATCH',
  ].join('\n');
};

const normalizeQuery = (rawQuery) => {
  const trimmed = String(rawQuery || '').trim().replace(/`/g, '');
  const isIgnoreInsert = /^\s*INSERT\s+IGNORE\s+/i.test(trimmed);

  let query = replacePlaceholders(trimmed);
  query = replaceBooleanLiterals(query);
  query = replaceDateFunctions(query);
  query = addInsertOutput(query, isIgnoreInsert);
  query = transformLimitClause(query);
  query = wrapIgnoreInsert(query, isIgnoreInsert);

  return { query, isIgnoreInsert };
};

const isSelectLike = (query) => /^\s*(SELECT|WITH)\b/i.test(query);

const toMysqlStyleResult = (rawQuery, result) => {
  const affectedRows = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, value) => sum + value, 0)
    : 0;

  if (isSelectLike(rawQuery)) {
    return [result.recordset || []];
  }

  const firstRow = Array.isArray(result.recordset) && result.recordset.length > 0
    ? result.recordset[0]
    : null;

  return [{
    affectedRows,
    insertId: firstRow?.insertId ? Number(firstRow.insertId) : undefined,
    rows: result.recordset || [],
  }];
};

const getPool = async () => {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(config);
    poolPromise = pool.connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
};

const run = async (rawQuery, params = []) => {
  const pool = await getPool();
  const request = buildRequest(pool, Array.isArray(params) ? params : []);
  const { query } = normalizeQuery(rawQuery);
  const result = await request.query(query);
  return toMysqlStyleResult(rawQuery, result);
};

module.exports = {
  execute: run,
  query: run,
  sql,
};
