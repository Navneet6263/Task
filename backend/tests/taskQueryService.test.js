const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskQuery } = require('../src/services/taskQueryService');

test('parses multi-value task filters and caps page size', () => {
  const result = parseTaskQuery({
    page: '2',
    limit: '5000',
    statuses: JSON.stringify(['TODO', 'DONE']),
    priorities: JSON.stringify(['HIGH']),
    assignees: JSON.stringify(['12']),
    clients: JSON.stringify(['ACME, India']),
    search: ' login ',
  });

  assert.equal(result.limit, 100);
  assert.equal(result.offset, 100);
  assert.deepEqual(result.statuses, ['TODO', 'DONE']);
  assert.deepEqual(result.priorities, ['HIGH']);
  assert.deepEqual(result.assignees, [12]);
  assert.deepEqual(result.clients, ['ACME, India']);
  assert.equal(result.search, 'login');
});

test('rejects invalid enum filters and date ranges', () => {
  assert.throws(
    () => parseTaskQuery({ statuses: JSON.stringify(['ARCHIVED']) }),
    /unsupported value/
  );
  assert.throws(
    () => parseTaskQuery({ created_from: '2026-08-20', created_to: '2026-08-01' }),
    /on or before/
  );
});
