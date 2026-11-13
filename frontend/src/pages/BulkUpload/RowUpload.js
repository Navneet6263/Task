import React, { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Select, StatTile } from '../../ui';
import { MAX_ROWS, findHeader, matchColumns } from './entrySheet';
import Progress from './Progress';

const CHUNK = 20;
const SHOW = 40;
const errorOf = (err) => err?.response?.data?.error || 'The upload stopped. Check your connection and try again.';

function Problems({ title, items }) {
  if (!items.length) return null;
  return (
    <section className="rounded-lg border border-line bg-surface">
      <p className="border-b border-line px-3.5 py-2.5 text-sm font-semibold">{title}</p>
      <ul className="max-h-60 overflow-auto text-sm">
        {items.slice(0, SHOW).map((item) => (
          <li key={item.line} className="flex gap-3 border-b border-line px-3.5 py-2 last:border-b-0">
            <span className="w-14 shrink-0 font-medium text-warn">Row {item.line}</span><span className="min-w-0 text-muted">{item.text}</span>
          </li>
        ))}
        {items.length > SHOW && <li className="px-3.5 py-2 text-muted">…and {items.length - SHOW} more rows.</li>}
      </ul>
    </section>
  );
}

// Rows from a sheet (tasks or timesheet entries): the columns are matched to the form, every row is
// checked first, and only the good rows go in. Nothing is saved until the person presses the button.
//   fields: [{ key, label, required }]   build(rows, mapping, firstLine) → [{ line, body, problems }]
//   send(bodies) → [{ ok, error }] in the same order   nouns: { one, many }   saved: "created" / "submitted"
export default function RowUpload({ workbook, fields, build, send, nouns, saved: savedWord, controls, blocked, mustHave = [], note, onChanged, onAgain, onDone, onBusy }) {
  const tab = workbook.tabs[0];
  const headerIndex = useMemo(() => findHeader(tab.rows, fields), [tab, fields]);
  const headings = tab.rows[headerIndex] || [];
  const [mapping, setMapping] = useState(() => matchColumns(headings, fields));
  const [showColumns, setShowColumns] = useState(false);
  const [run, setRun] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { onBusy?.(Boolean(run) && !result); return () => onBusy?.(false); }, [run, result, onBusy]);

  const rows = useMemo(() => build(tab.rows.slice(headerIndex + 1), mapping, headerIndex + 2), [build, tab, headerIndex, mapping]);
  const good = rows.filter((r) => !r.problems.length);
  const bad = rows.filter((r) => r.problems.length).map((r) => ({ line: r.line, text: r.problems.join('; ') }));
  const matched = fields.filter((f) => mapping[f.key] !== undefined).length;
  const needed = fields.filter((f) => mapping[f.key] === undefined && (mustHave.includes(f.key) || f.required));
  const tooMany = rows.length > MAX_ROWS;
  const columnsOpen = showColumns || needed.length > 0;

  const start = async () => {
    setError(''); setRun({ done: 0, total: good.length });
    let saved = 0;
    const failed = [];
    try {
      for (let i = 0; i < good.length; i += CHUNK) {
        const chunk = good.slice(i, i + CHUNK);
        const results = await send(chunk.map((r) => r.body));
        saved += results.filter((r) => r.ok).length;
        failed.push(...results.map((r, k) => ({ ok: r.ok, line: chunk[k].line, text: r.error })).filter((r) => !r.ok));
        setRun({ done: Math.min(i + CHUNK, good.length), total: good.length });
      }
      setResult({ saved, failed });
      onDone?.();
    } catch (err) {
      setError(`${errorOf(err)}${saved ? ` ${saved} ${saved === 1 ? nouns.one : nouns.many} were saved before it stopped; do not upload those rows again.` : ''}`);
      setRun(null);
    }
    if (saved) onChanged?.();
  };

  if (result) {
    const left = bad.length + result.failed.length;
    return (
      <>
        <Banner tone={result.saved ? 'ok' : 'warn'}><strong>{result.saved} {result.saved === 1 ? nouns.one : nouns.many} {savedWord}.</strong>{left > 0 && ` ${left} ${left === 1 ? 'row was' : 'rows were'} not uploaded. Fix ${left === 1 ? 'it' : 'them'} in the sheet and upload only ${left === 1 ? 'that row' : 'those rows'}.`}</Banner>
        <Problems title="Rows that were not uploaded" items={[...result.failed, ...bad].sort((a, b) => a.line - b.line)} />
        <div className="flex gap-2"><Button variant="primary" onClick={onAgain}>Upload another sheet</Button></div>
      </>
    );
  }
  if (!rows.length && !needed.length) return <><Banner tone="warn">We found the headings but no rows under them. Fill the sheet from the second line down.</Banner><div><Button onClick={onAgain}>Choose another file</Button></div></>;

  return (
    <>
      <p className="text-sm text-muted">
        Reading <strong className="text-ink">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</strong> from “{tab.name}”{workbook.tabs.length > 1 ? ' (the first tab)' : ''}.{note ? ` ${note}` : ''}
      </p>
      <section className={`rounded-lg border bg-surface p-3.5 ${needed.length ? 'border-warn' : 'border-line'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm font-semibold">{needed.length ? 'Tell us which column is which' : `${matched} of ${fields.length} columns matched by their headings`}</p>
          {!needed.length && <button type="button" className="text-xs font-semibold text-accent hover:underline" aria-expanded={columnsOpen} onClick={() => setShowColumns((v) => !v)}>{columnsOpen ? 'Hide' : 'Change'}</button>}
        </div>
        {needed.length > 0 && <p className="mt-1 text-sm text-warn">We could not find {needed.map((f) => f.label).join(', ')} in your sheet. Pick the right column below.</p>}
        {columnsOpen && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {fields.map((field) => {
              const missing = needed.includes(field);
              return (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className={`text-xs font-medium ${missing ? 'text-warn' : 'text-muted'}`}>{field.label}{field.required || mustHave.includes(field.key) ? ' *' : ''}</span>
                  <Select aria-label={`Column for ${field.label}`} disabled={Boolean(run)} value={mapping[field.key] ?? ''} className={missing ? '!border-warn' : ''}
                    onChange={(e) => setMapping((prev) => { const next = { ...prev }; if (e.target.value === '') delete next[field.key]; else next[field.key] = Number(e.target.value); return next; })}>
                    <option value="">Not in the sheet</option>
                    {headings.map((heading, i) => (heading ? <option key={i} value={i}>{heading}</option> : null))}
                  </Select>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {controls}
      {tooMany && <Banner tone="danger">This sheet has {rows.length} rows. Upload at most {MAX_ROWS} at a time: split it into smaller sheets.</Banner>}
      {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Ready to upload" value={good.length} />
        <StatTile label="Need fixing" value={bad.length} />
      </div>
      <Problems title="These rows will be left out. Fix them in the sheet, or upload the rest now." items={bad} />

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        {run && <Progress done={run.done} total={run.total} label={`Uploading ${nouns.many}`} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={Boolean(run) || !good.length || tooMany || Boolean(blocked)} onClick={start}>{run ? 'Uploading…' : `Upload ${good.length} ${good.length === 1 ? nouns.one : nouns.many}`}</Button>
          <Button disabled={Boolean(run)} onClick={onAgain}>Choose another file</Button>
          {blocked && <span className="text-xs font-semibold text-warn">{blocked}</span>}
        </div>
      </div>
    </>
  );
}
