// OpenAPI 3.0 description of the public API, for Swagger, Postman and code generators.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const errors = {
  401: json(ref('Error'), 'Missing, wrong, revoked or expired key'),
  403: json(ref('Error'), 'The key lacks a permission, the IP is not allowed, or the API is off'),
  422: json(ref('Error'), 'Something in the request is not valid; the message says what'),
  429: json(ref('Error'), 'More than 60 calls in a minute for this key'),
};
const page = (name) => ({ type: 'object', properties: { data: { type: 'array', items: ref(name) }, page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' } } });

function openApiSpec(serverUrl) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'GreenTask API',
      version: '1.0.0',
      description: 'Create and read tasks from your own software. Make a key in Admin → Developer and send it as `Authorization: Bearer <key>`. '
        + 'Keys starting `gt_test_` run every check but save nothing. Send `external_id` with `source` to make creating a task safe to repeat.',
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'An API key from Admin → Developer, e.g. gt_live_…' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string', example: 'unknown_team' }, message: { type: 'string' } } } } },
        Person: { oneOf: [
          { type: 'string', description: 'An email or an employee code', example: 'asha@company.com' },
          { type: 'object', properties: { email: { type: 'string' }, employee_code: { type: 'string', example: 'ACT05' }, id: { type: 'integer' } } },
        ] },
        Task: { type: 'object', properties: {
          key: { type: 'string', example: 'ACC-142' }, id: { type: 'integer' }, title: { type: 'string' }, description: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'] }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          due_date: { type: 'string', format: 'date', nullable: true }, start_date: { type: 'string', format: 'date', nullable: true },
          client_name: { type: 'string', nullable: true }, team_id: { type: 'integer' }, team_name: { type: 'string' },
          assigned_to: { type: 'integer', nullable: true }, assigned_to_name: { type: 'string', nullable: true }, assigned_to_email: { type: 'string', nullable: true },
          assigned_to_employee_code: { type: 'string', nullable: true }, external_source: { type: 'string', nullable: true }, external_id: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' }, completed_at: { type: 'string', format: 'date-time', nullable: true },
        } },
        TaskInput: { type: 'object', properties: {
          title: { type: 'string', maxLength: 255, description: 'Required when creating' }, description: { type: 'string', maxLength: 5000 },
          team: { oneOf: [{ type: 'integer' }, { type: 'string' }], description: 'Team id or exact name; optional when the company has one team' },
          assignee: ref('Person'), status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'] }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          due_date: { type: 'string', format: 'date', example: '2026-11-30' }, start_date: { type: 'string', format: 'date' }, client_name: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          source: { type: 'string', example: 'crm', description: 'Your system\'s name, default "api"' },
          external_id: { type: 'string', example: 'TICKET-981', description: 'Your record id; repeating it updates the same task' },
        } },
        User: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string', nullable: true }, employee_code: { type: 'string', nullable: true }, role: { type: 'string' } } },
        Team: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, type: { type: 'string', nullable: true }, members: { type: 'integer' } } },
      },
    },
    paths: {
      '/me': { get: { summary: 'Check the key', responses: { 200: json({ type: 'object' }), 401: errors[401] } } },
      '/users': { get: { summary: 'People in the company (users:read)', parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }], responses: { 200: json({ type: 'object', properties: { data: { type: 'array', items: ref('User') } } }), ...errors } } },
      '/teams': { get: { summary: 'Teams (users:read)', responses: { 200: json({ type: 'object', properties: { data: { type: 'array', items: ref('Team') } } }), ...errors } } },
      '/tasks': {
        get: {
          summary: 'List tasks, newest change first (tasks:read)',
          parameters: ['status', 'team', 'assignee', 'source', 'external_id', 'updated_since', 'page', 'limit'].map((name) => ({ name, in: 'query', schema: { type: ['page', 'limit'].includes(name) ? 'integer' : 'string' } })),
          responses: { 200: json(page('Task')), ...errors },
        },
        post: {
          summary: 'Create a task, or update the one with the same source + external_id (tasks:write)',
          requestBody: { required: true, content: { 'application/json': { schema: ref('TaskInput') } } },
          responses: { 201: json({ type: 'object', properties: { created: { type: 'boolean' }, data: ref('Task') } }, 'Created'), 200: json({ type: 'object', properties: { created: { type: 'boolean' }, data: ref('Task') } }, 'Updated the existing task'), 409: json(ref('Error'), 'Two calls raced with the same external_id; repeat it'), ...errors },
        },
      },
      '/tasks/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Task id or key, e.g. 142 or ACC-142' }],
        get: { summary: 'One task (tasks:read)', responses: { 200: json({ type: 'object', properties: { data: ref('Task') } }), 404: json(ref('Error'), 'Not found in this company'), ...errors } },
        patch: { summary: 'Change a task (tasks:write)', requestBody: { required: true, content: { 'application/json': { schema: ref('TaskInput') } } }, responses: { 200: json({ type: 'object', properties: { data: ref('Task') } }), 404: json(ref('Error'), 'Not found'), ...errors } },
      },
      '/tasks/{id}/comments': {
        post: {
          summary: 'Add a comment (tasks:write)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['comment'], properties: { comment: { type: 'string', maxLength: 5000 } } } } } },
          responses: { 201: json({ type: 'object' }, 'Added'), ...errors },
        },
      },
    },
  };
}

module.exports = { openApiSpec };
