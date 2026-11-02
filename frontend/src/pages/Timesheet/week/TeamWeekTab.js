import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import { Banner, Button, EmptyRow, ErrorText, Input, Segmented, StatTile, Table, TableWrap, Td, Th } from '../../../ui';
import { errorOf, fmtDate, fmtHours } from '../format';
import { addDays, defaultScope, hasTeam, mondayOf, teamPeople } from '../team';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// One week for a manager: who logged how much each day, and which working days are still empty.
export default function TeamWeekTab({ config, refreshKey, onDrill }) {
  const [scope, setScope] = useState(() => (defaultScope(config) === 'team' ? 'team' : 'all'));
  const [week, setWeek] = useState(() => mondayOf(config.today));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    timesheet.teamWeek({ week, scope: scope === 'team' ? 'team' : undefined })
      .then((response) => { if (active) setData(response.data); })
      .catch((err) => { if (active) setError(errorOf(err, 'Could not load the week.')); });
    return () => { active = false; };
  }, [week, scope, refreshKey, retry]);

  const days = useMemo(() => data?.days || [], [data]);
  const today = config.today;
  // Saturday and Sunday are never counted as missing.
  const isGap = (day, index, hours) => index < 5 && day <= today && !hours;
  const stats = useMemo(() => {
    const people = data?.people || [];
    const hours = people.reduce((sum, person) => sum + person.total, 0);
    const inWeek = days.includes(today);
    const notToday = inWeek ? people.filter((person) => !person.hours[today]) : [];
    const none = people.filter((person) => !person.total).length;
    return { hours, people: people.length, none, notToday };
  }, [data, days, today]);
  const dayTotal = (day) => (data?.people || []).reduce((sum, person) => sum + (person.hours[day] || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasTeam(config)
          ? <Segmented label="Whose week" options={[['team', `My team (${teamPeople(config).length})`], ['all', 'Everyone']]} value={scope} onChange={setScope} />
          : <span />}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setWeek(addDays(week, -7))}>← Previous</Button>
          <Input aria-label="Pick a week" type="date" className="!w-40" max={today} value={week} onChange={(event) => { if (event.target.value) setWeek(mondayOf(event.target.value)); }} />
          <Button size="sm" disabled={addDays(week, 7) > today} onClick={() => setWeek(addDays(week, 7))}>Next →</Button>
          {week !== mondayOf(today) && <Button size="sm" variant="ghost" onClick={() => setWeek(mondayOf(today))}>This week</Button>}
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatTile label="Hours this week" value={fmtHours(stats.hours)} />
          <StatTile label="People" value={stats.people} />
          <StatTile label="No time at all" value={stats.none} />
        </div>
      )}
      {stats.notToday.length > 0 && (
        <Banner tone="warn">
          <strong>{stats.notToday.length} {stats.notToday.length === 1 ? 'person has' : 'people have'} not logged time today:</strong> {stats.notToday.slice(0, 8).map((person) => person.name).join(', ')}{stats.notToday.length > 8 ? ` and ${stats.notToday.length - 8} more` : ''}.
        </Banner>
      )}

      <ErrorText onRetry={() => setRetry((value) => value + 1)}>{error}</ErrorText>
      <TableWrap>
        <Table>
          <thead><tr>
            <Th>Person</Th>
            {days.map((day, index) => <Th key={day} align="right" title={fmtDate(day)} className={day === today ? 'text-accent' : ''}>{DAY_NAMES[index]} {day.slice(8)}</Th>)}
            <Th align="right">Total</Th>
          </tr></thead>
          <tbody>
            {!data && !error && <EmptyRow colSpan={9}><span role="status">Loading the week...</span></EmptyRow>}
            {data?.people.map((person) => (
              <tr key={person.id} className="border-t border-line">
                <Td className="whitespace-nowrap font-medium">{person.name}</Td>
                {days.map((day, index) => {
                  const hours = person.hours[day] || 0;
                  const gap = isGap(day, index, hours);
                  return (
                    <Td key={day} align="right" mono className={gap ? 'bg-warn-soft' : ''}>
                      {hours
                        ? <button type="button" className="font-semibold text-accent hover:underline" title={`See ${person.name}'s entries for ${fmtDate(day)}`} onClick={() => onDrill({ scope: 'all', filters: { agent_id: String(person.id), period: 'custom', from: day, to: day } })}>{fmtHours(hours)}</button>
                        : <span className="text-muted" aria-label={gap ? 'Nothing logged' : undefined}>–</span>}
                    </Td>
                  );
                })}
                <Td align="right" mono className="font-semibold">{fmtHours(person.total)}</Td>
              </tr>
            ))}
            {data && !data.people.length && <EmptyRow colSpan={9}>No one to show.</EmptyRow>}
            {data?.people.length > 0 && (
              <tr className="border-t-2 border-line bg-subtle font-semibold">
                <Td>Total</Td>
                {days.map((day) => <Td key={day} align="right" mono>{fmtHours(dayTotal(day))}</Td>)}
                <Td align="right" mono>{fmtHours(stats.hours)}</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      <p className="text-xs text-muted">Yellow means a working day up to today with no time logged. Includes drafts, so totals can be higher than Reports, which count submitted work only. Click any number to see those entries.</p>
    </div>
  );
}
