import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api';
import { Banner, Button, EmptyState, Loading, Segmented, Table, TableWrap, Td, Th, EmptyRow } from '../../../ui';
import ApiKeys from './ApiKeys';
import Webhooks from './Webhooks';
import Guide from './Guide';
import Inbound from './Inbound';
import { errorOf, when } from './devShared';

function Activity() {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api.get('/developer/logs').then((r) => setRows(r.data)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><p className="text-sm text-muted">The last 200 calls. Kept for 30 days.</p><Button size="sm" onClick={load}>Refresh</Button></div>
      <TableWrap>
        <Table>
          <thead><tr><Th>When</Th><Th>Key</Th><Th>Request</Th><Th>Result</Th><Th>From</Th><Th align="right">Time</Th></tr></thead>
          <tbody>
            {rows === null && <EmptyRow colSpan={6}>Loading…</EmptyRow>}
            {rows?.length === 0 && <EmptyRow colSpan={6}>No calls yet.</EmptyRow>}
            {(rows || []).map((l) => (
              <tr key={l.id} className="border-t border-line">
                <Td className="whitespace-nowrap text-xs text-muted">{when(l.created_at)}</Td>
                <Td className="text-sm">{l.key_name}</Td>
                <Td className="font-mono text-xs"><strong>{l.method}</strong> {l.path}</Td>
                <Td><span className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${l.status < 300 ? 'bg-accent-soft text-accent' : l.status < 500 ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger'}`}>{l.status}</span></Td>
                <Td className="font-mono text-xs text-muted">{l.ip}</Td>
                <Td align="right" mono className="text-xs">{l.duration_ms} ms</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}

// Admin → Developer: connect other software to this organization.
export default function DeveloperTab() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState('guide');
  useEffect(() => { api.get('/developer/status').then((r) => setStatus(r.data)).catch((err) => setError(errorOf(err, 'Could not open the developer settings.'))); }, []);

  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!status) return <Loading>Opening developer settings…</Loading>;
  if (!status.enabled) {
    return (
      <EmptyState title="Developer API is off for this company">
        It lets your CRM, HRMS or any software create and read tasks here, with secure API keys and webhooks. Ask the GreenTask team to turn on <strong>Developer API</strong> for {status.organization?.name}.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Developer API</p>
          <h3 className="text-lg font-bold">Connect your other software to {status.organization?.name}</h3>
          <p className="text-sm text-muted">Keys let other software work with tasks here; webhooks tell it when tasks change.</p>
        </div>
        <Segmented label="Developer sections" value={section} onChange={setSection} className="[&>button]:normal-case"
          options={[['guide', 'Setup guide'], ['keys', 'API keys'], ['inbound', 'Incoming'], ['webhooks', 'Webhooks'], ['activity', 'Activity']]} />
      </div>
      {section === 'guide' && <Guide onGo={setSection} />}
      {section === 'keys' && <ApiKeys status={status} />}
      {section === 'inbound' && <Inbound status={status} />}
      {section === 'webhooks' && <Webhooks status={status} />}
      {section === 'activity' && <Activity />}
    </div>
  );
}
