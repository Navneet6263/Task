import React, { useEffect, useRef, useState } from 'react';
import { Button, Chip, EmptyRow, Input, Select, Table, TableWrap, Td, Th } from '../../ui';
import { GROUPS, TASK_COLUMNS, groupRows } from './reportColumns';
import { excelDate, TONES } from '../../services/excelExport';

const PREVIEW_LIMIT = 200;
const STATUS = [['TODO', 'To do'], ['IN_PROGRESS', 'In progress'], ['PENDING', 'Pending'], ['DONE', 'Done']];
const PRIORITY = [['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']];
const TYPES = [['task', 'Task'], ['bug', 'Bug'], ['feature', 'Feature'], ['story', 'Story'], ['enhancement', 'Enhancement']];
const CHIP_TONE = { ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', neutral: 'neutral' };

function Toggles({ label, options, value, onChange }) {
  const flip = (key) => onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-16 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value.includes(key)} onClick={() => flip(key)}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${value.includes(key) ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-ink'}`}>{text}</button>
      ))}
    </div>
  );
}

function ColumnPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const toggle = (key) => onChange(selected.includes(key) ? selected.filter((k) => k !== key) : TASK_COLUMNS.map((c) => c.key).filter((k) => k === key || selected.includes(k)));
  return (
    <div className="relative" ref={ref}>
      <Button size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>Columns <span className="font-mono text-[10px] text-muted">{selected.length}/{TASK_COLUMNS.length}</span></Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[320px] rounded-lg border border-line bg-surface p-3 shadow-pop">
          <p className="mb-2 text-xs text-muted">Columns in the preview and in the Excel Tasks sheet.</p>
          <div className="grid grid-cols-2 gap-1">
            {TASK_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-subtle">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={selected.includes(column.key)} disabled={column.key === 'title'} onChange={() => toggle(column.key)} />
                {column.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const display = (column, row) => {
  const raw = column.value ? column.value(row) : row[column.key];
  if (raw === null || raw === undefined || raw === '') return <span className="text-muted">—</span>;
  if (column.type === 'date' || column.type === 'datetime') {
    const d = excelDate(raw);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC', ...(column.type === 'datetime' ? { hour: '2-digit', minute: '2-digit' } : {}) });
  }
  const tone = column.tone?.(row);
  return tone && TONES[tone] ? <Chip tone={CHIP_TONE[tone]}>{raw}</Chip> : String(raw);
};

export default function TasksTab({ rows, filters, setFilters, groupBy, setGroupBy, columns, setColumns }) {
  const set = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const visible = TASK_COLUMNS.filter((column) => columns.includes(column.key));
  const preview = groupRows(rows.slice(0, PREVIEW_LIMIT), groupBy);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
        <Toggles label="Status" options={STATUS} value={filters.statuses} onChange={set('statuses')} />
        <Toggles label="Priority" options={PRIORITY} value={filters.priorities} onChange={set('priorities')} />
        <Toggles label="Type" options={TYPES} value={filters.types} onChange={set('types')} />
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <Input aria-label="Search tasks in report" placeholder="Search title, client or assignee" className="!w-auto min-w-[220px] flex-1" value={filters.search} onChange={(e) => set('search')(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-accent" checked={filters.overdueOnly} onChange={(e) => set('overdueOnly')(e.target.checked)} />Overdue only</label>
          <Select aria-label="Group rows by" className="!w-auto py-1.5" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUPS.map((group) => <option key={group.id} value={group.id}>{group.id ? `Group by ${group.label.toLowerCase()}` : group.label}</option>)}
          </Select>
          <ColumnPicker selected={columns} onChange={setColumns} />
        </div>
      </div>
      <p className="text-xs text-muted">
        <b className="text-ink">{rows.length}</b> tasks match.{rows.length > PREVIEW_LIMIT && ` Showing the first ${PREVIEW_LIMIT} here; the Excel file contains all of them.`}
      </p>
      <TableWrap>
        <Table>
          <thead><tr>{visible.map((column) => <Th key={column.key} align={column.type === 'number' ? 'right' : 'left'}>{column.label}</Th>)}</tr></thead>
          <tbody>
            {preview.map((row, index) => (row.__group
              ? <tr key={`g${index}`} className="bg-subtle"><td colSpan={visible.length} className="border-b border-line px-3 py-1.5 text-xs font-semibold">{row.__group}</td></tr>
              : <tr key={row.id} className="hover:bg-subtle">
                  {visible.map((column) => (
                    <Td key={column.key} align={column.type === 'number' ? 'right' : 'left'} mono={column.type === 'number'}
                      className={`${column.wrap ? 'min-w-[220px] max-w-[420px]' : 'whitespace-nowrap'}`}>{display(column, row)}</Td>
                  ))}
                </tr>))}
            {!rows.length && <EmptyRow colSpan={visible.length}>No tasks match these filters.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
