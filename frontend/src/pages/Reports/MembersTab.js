import React from 'react';
import { EmptyRow, Meter, Table, TableWrap, Td, Th } from '../../ui';

export const MEMBER_COLUMNS = [
  { key: 'name', label: 'Member', width: 26 },
  { key: 'total', label: 'Total', type: 'number', width: 10 },
  { key: 'active', label: 'Active', type: 'number', width: 10 },
  { key: 'completed', label: 'Completed', type: 'number', width: 12 },
  { key: 'completion', label: 'Completion', type: 'percent', width: 12, value: (m) => (Number(m.total) ? Number(m.completed) / Number(m.total) : 0) },
  { key: 'high_priority', label: 'High priority open', type: 'number', width: 18 },
  { key: 'overdue', label: 'Overdue', type: 'number', width: 11, tone: (m) => (Number(m.overdue) ? 'danger' : null) },
  { key: 'blocked', label: 'Blocked', type: 'number', width: 11, tone: (m) => (Number(m.blocked) ? 'warn' : null) },
  { key: 'on_time', label: 'On-time completions', type: 'number', width: 19 },
  { key: 'measured_completions', label: 'Measured completions', type: 'number', width: 21 },
];

export default function MembersTab({ report }) {
  const members = report?.members || [];
  const maxTotal = Math.max(1, ...members.map((m) => Number(m.total)));
  return (
    <div className="flex flex-col gap-3">
      <TableWrap>
        <Table>
          <thead><tr>
            <Th>Member</Th><Th className="w-[28%]">Workload</Th><Th align="right">Active</Th><Th align="right">Completed</Th>
            <Th align="right">Completion</Th><Th align="right">High open</Th><Th align="right">Overdue</Th><Th align="right">Blocked</Th><Th align="right">On time</Th>
          </tr></thead>
          <tbody>
            {members.map((m) => {
              const total = Number(m.total), completion = total ? Math.round((Number(m.completed) / total) * 100) : 0;
              const onTime = Number(m.measured_completions) ? Math.round((Number(m.on_time) / Number(m.measured_completions)) * 100) : null;
              return (
                <tr key={m.id}>
                  <Td className="font-semibold">{m.name}</Td>
                  <Td>
                    <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-subtle" title={`${m.completed} completed, ${m.active} active of ${total}`}>
                      <div className="bg-accent" style={{ width: `${(Number(m.completed) / maxTotal) * 100}%` }} />
                      <div className="bg-info/60" style={{ width: `${(Number(m.active) / maxTotal) * 100}%` }} />
                    </div>
                  </Td>
                  <Td align="right" mono>{m.active}</Td>
                  <Td align="right" mono>{m.completed}</Td>
                  <Td align="right"><div className="ml-auto flex w-24 items-center gap-2"><Meter value={completion} label={`${m.name} completion`} /><span className="font-mono text-xs">{completion}%</span></div></Td>
                  <Td align="right" mono>{m.high_priority}</Td>
                  <Td align="right" mono className={Number(m.overdue) ? 'font-semibold text-danger' : ''}>{m.overdue}</Td>
                  <Td align="right" mono className={Number(m.blocked) ? 'font-semibold text-warn' : ''}>{m.blocked}</Td>
                  <Td align="right" mono>{onTime === null ? '—' : `${onTime}%`}</Td>
                </tr>
              );
            })}
            {!members.length && <EmptyRow colSpan={9}>No members in this team yet.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
      <p className="text-xs text-muted">
        <span className="mr-3 inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />Completed</span>
        <span className="mr-3 inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-info/60" />Active</span>
        {report?.scope} Counts do not account for task complexity, leave or part-time schedules.
      </p>
    </div>
  );
}
