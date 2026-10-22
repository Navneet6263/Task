import React from 'react';
import { Card, CardHeader, StatTile, Table, Td, Th } from '../../../ui';
import { fmtDate, fmtHours } from '../format';

export function ReportStats({ summary }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile label="Total hours" value={fmtHours(summary.total_hours)} />
      <StatTile label="Entries" value={summary.entry_count} />
      <StatTile label="People" value={summary.by_person.length} />
    </section>
  );
}

export function HoursByPerson({ people }) {
  const max = people[0]?.hours || 1;
  return (
    <Card>
      <CardHeader title="Hours by person" aside="Drafts are not counted" />
      <Table>
        <tbody>
          {people.map((person) => (
            <tr key={person.user_id}>
              <Td className="w-1/3">{person.name}</Td>
              <Td>
                <div className="mt-1.5 h-2 overflow-hidden rounded bg-subtle">
                  <div className="h-full rounded bg-accent" style={{ width: `${(person.hours / max) * 100}%` }} />
                </div>
              </Td>
              <Td align="right" mono className="w-20 font-semibold">{fmtHours(person.hours)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export function ClientBreakdown({ client }) {
  return (
    <Card>
      <CardHeader title={client.name} aside={<><b className="font-mono text-ink">{fmtHours(client.hours)}</b> hours</>} />
      <div className="overflow-x-auto">
        <Table>
          <thead><tr><Th>Date worked</Th><Th>Job type</Th><Th>Work type</Th><Th>Period ended</Th><Th>Who worked</Th><Th align="right">Hours</Th></tr></thead>
          <tbody>
            {client.entries.map((entry) => (
              <tr key={entry.entry_id}>
                <Td mono className="whitespace-nowrap">{fmtDate(entry.date_worked)}</Td>
                <Td>{entry.job_type}</Td>
                <Td>{entry.work_type}</Td>
                <Td mono className="whitespace-nowrap">{fmtDate(entry.period_ended)}</Td>
                <Td>{entry.people.map((person) => <div key={person.user_id}>{person.name} <span className="font-mono text-muted">{fmtHours(person.hours)} h</span></div>)}</Td>
                <Td align="right" mono className="font-semibold">{fmtHours(entry.hours)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
