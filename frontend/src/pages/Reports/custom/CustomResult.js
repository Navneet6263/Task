import React from 'react';
import { EmptyRow, Table, TableWrap, Td, Th } from '../../../ui';
import { DIMENSIONS, METRICS } from './customReport';

export const formatValue = (type, value) => {
  if (value === null || value === undefined) return '—';
  if (type === 'percent') return `${Math.round(value * 100)}%`;
  if (type === 'decimal') return String(Number(Number(value).toFixed(2)));
  return Number(value).toLocaleString('en-IN');
};

// Result table: metrics as columns, or the first metric spread across split columns.
export default function CustomResult({ pivot, config }) {
  const dim = DIMENSIONS[config.rowDim];
  const first = METRICS[config.metrics[0]];
  const max = Math.max(1e-9, ...pivot.groups.map((g) => g.values[config.metrics[0]] || 0));
  const split = pivot.splits.length > 0;
  const cols = split ? pivot.splits.length + 2 : config.metrics.length + 1;

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>{dim?.label}</Th>
            {split
              ? <>{pivot.splits.map((s) => <Th key={s} align="right">{s}</Th>)}<Th align="right">Total {first.label.toLowerCase()}</Th></>
              : config.metrics.map((id, index) => <Th key={id} align="right" className={index === 0 ? 'min-w-[200px]' : ''}>{METRICS[id].label}</Th>)}
          </tr>
        </thead>
        <tbody>
          {pivot.groups.map((group) => (
            <tr key={group.label} className="hover:bg-subtle">
              <Td className="font-semibold">{group.label}</Td>
              {split
                ? <>
                    {pivot.splits.map((s) => <Td key={s} align="right" mono className={group.split[s] ? '' : 'text-muted/60'}>{group.split[s] ? formatValue(first.type, group.split[s]) : '—'}</Td>)}
                    <Td align="right" mono className="font-semibold">{formatValue(first.type, group.values[config.metrics[0]])}</Td>
                  </>
                : config.metrics.map((id, index) => (
                  <Td key={id} align="right" mono>
                    {index === 0 ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full bg-accent" style={{ width: `${((group.values[id] || 0) / max) * 100}%` }} /></span>
                        <b className="w-14 text-right">{formatValue(METRICS[id].type, group.values[id])}</b>
                      </span>
                    ) : formatValue(METRICS[id].type, group.values[id])}
                  </Td>
                ))}
            </tr>
          ))}
          {!pivot.groups.length && <EmptyRow colSpan={cols}>No data for this period. Try a longer period or another source.</EmptyRow>}
          {pivot.groups.length > 0 && (
            <tr className="bg-accent-soft/50 font-semibold">
              <Td>Total</Td>
              {split
                ? <>{pivot.splits.map((s) => <Td key={s} align="right" mono>{formatValue(first.type, pivot.splitTotals[s])}</Td>)}<Td align="right" mono>{formatValue(first.type, pivot.totals[config.metrics[0]])}</Td></>
                : config.metrics.map((id) => <Td key={id} align="right" mono>{formatValue(METRICS[id].type, pivot.totals[id])}</Td>)}
            </tr>
          )}
        </tbody>
      </Table>
    </TableWrap>
  );
}
