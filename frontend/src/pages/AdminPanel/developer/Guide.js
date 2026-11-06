import React from 'react';
import { CodeBlock, CopyButton, apiBase } from './devShared';
import { VERIFY_SNIPPET } from './Webhooks';

function Step({ n, title, children }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-6"><h4 className="font-semibold">{title}</h4>{children}</div>
    </li>
  );
}

const ENDPOINTS = [
  ['GET', '/me', '—', 'Check the key: your company and the key\'s permissions'],
  ['GET', '/users?search=', 'users:read', 'People: id, name, email, employee code, role'],
  ['GET', '/teams', 'users:read', 'Teams: id and name'],
  ['GET', '/tasks?status=&team=&assignee=&source=&external_id=&updated_since=&page=&limit=', 'tasks:read', 'Tasks, newest change first (up to 100 a page)'],
  ['GET', '/tasks/{id or ACC-142}', 'tasks:read', 'One task'],
  ['POST', '/tasks', 'tasks:write', 'Create a task; with external_id the same id updates the same task'],
  ['PATCH', '/tasks/{id}', 'tasks:write', 'Change title, status, priority, dates, assignee or labels'],
  ['POST', '/tasks/{id}/comments', 'tasks:write', 'Add a comment'],
];

// Admin → Developer → Setup guide: everything another developer needs, with this company's address.
export default function Guide({ onGo }) {
  const base = apiBase();
  const create = `curl -X POST ${base}/tasks \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Call back Acme about the VAT return",
    "description": "Customer asked for a call before Friday",
    "team": "Payroll",
    "assignee": { "email": "asha@company.com" },
    "priority": "HIGH",
    "due_date": "2026-11-30",
    "client_name": "Acme Ltd",
    "labels": ["VAT", "From CRM"],
    "source": "crm",
    "external_id": "TICKET-981"
  }'`;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <ol className="flex flex-col">
        <Step n={1} title="Create a key for the software you are connecting">
          <p className="text-sm text-muted">One key per software (CRM, HRMS…), with only the permissions it needs. If possible, also enter that server's IP so the key works from nowhere else. While building, use a <strong>test key</strong>: it checks everything but saves nothing.</p>
          <button type="button" onClick={() => onGo('keys')} className="self-start text-sm font-semibold text-accent hover:underline">Go to API keys →</button>
        </Step>
        <Step n={2} title="Give the developer the address and the key">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2"><span className="text-xs text-muted">API address</span><code className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{base}</code><CopyButton text={base} /></div>
          <p className="text-sm text-muted">Every request sends the key in a header: <code className="rounded bg-subtle px-1">Authorization: Bearer YOUR_API_KEY</code>. Share the key privately (not in a group chat), and keep it on the server only.</p>
          <CodeBlock title="Check the connection" code={`curl ${base}/me -H "Authorization: Bearer YOUR_API_KEY"`} />
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">Full API description (OpenAPI) for Swagger, Postman or code generators:</span>
            <a href={`${base}/openapi.json`} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">openapi.json ↗</a>
            <CopyButton text={`${base}/openapi.json`} label="Copy link" />
          </div>
        </Step>
        <Step n={3} title="Create tasks from the other software">
          <p className="text-sm text-muted">Pick the person by <strong>email</strong>, <strong>employee code</strong> (HRMS) or id; GreenTask finds them in your company. Send your own record id as <code className="rounded bg-subtle px-1">external_id</code>: sending it again updates the same task, so nothing is ever duplicated.</p>
          <CodeBlock title="Create (or update) a task" code={create} />
          <CodeBlock title="Mark it done" code={`curl -X PATCH ${base}/tasks/ACC-142 \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '{ "status": "DONE" }'`} />
        </Step>
        <Step n={4} title="Software that cannot follow our format? Use Incoming (no code)">
          <p className="text-sm text-muted">Make an incoming connection, point the other system's webhook at its address, and send one record. You then match their fields (like <code className="rounded bg-subtle px-1">ticket.subject</code>) to task fields on screen, try it on the sample, and go live.</p>
          <button type="button" onClick={() => onGo('inbound')} className="self-start text-sm font-semibold text-accent hover:underline">Go to Incoming →</button>
        </Step>
        <Step n={5} title="Hear back when tasks change (optional)">
          <p className="text-sm text-muted">Add a webhook with your server's https address. GreenTask posts the task there when it is created, changed, done or deleted, and tries again if your server is down. Each message has an <code className="rounded bg-subtle px-1">id</code>, so ignore one you have already seen. Check the signature so nobody else can fake a call.</p>
          <CodeBlock title="Verify a webhook" code={VERIFY_SNIPPET} />
          <button type="button" onClick={() => onGo('webhooks')} className="self-start text-sm font-semibold text-accent hover:underline">Go to webhooks →</button>
        </Step>
        <Step n={6} title="Watch it work, and change keys safely">
          <p className="text-sm text-muted">Activity shows every call with its result for 30 days. To change a key without downtime press Rotate: the old one keeps working for 24 hours. Something wrong? Revoke the key at once; the software stops working immediately.</p>
        </Step>
      </ol>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h4 className="mb-2 text-sm font-semibold">Endpoints</h4>
          <ul className="flex flex-col gap-2.5">
            {ENDPOINTS.map(([method, path, scope, text]) => (
              <li key={method + path} className="text-xs">
                <span className="flex items-start gap-1.5"><span className={`rounded px-1 font-mono font-bold ${method === 'GET' ? 'bg-info-soft text-info' : 'bg-accent-soft text-accent'}`}>{method}</span><code className="break-all">{path}</code></span>
                <span className="mt-0.5 block text-muted">{text}{scope !== '—' && <> · <code>{scope}</code></>}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-xs text-muted">
          <h4 className="mb-2 text-sm font-semibold text-ink">Good to know</h4>
          <ul className="flex list-disc flex-col gap-1.5 pl-4">
            <li>Dates: <code>2026-11-30</code>. Status: TODO, IN_PROGRESS, PENDING, DONE. Priority: LOW, MEDIUM, HIGH.</li>
            <li>Errors come back as <code>{'{ "error": { "code", "message" } }'}</code> with a clear message.</li>
            <li>60 calls a minute per key; the answer headers say how many are left.</li>
            <li>A key only ever sees this company, and stops working if its creator leaves or is no longer an admin.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
