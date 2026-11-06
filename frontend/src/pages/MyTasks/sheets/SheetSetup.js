import React, { useEffect, useMemo, useState } from 'react';
import { taskSheets, teams } from '../../../services/api';
import { Banner, Button, Input, Modal, Select, Switch, Table, TableWrap, Td, Th } from '../../../ui';

const errorOf = (err, fallback) => err?.response?.data?.error || fallback;

// A ready-made sheet: the column names Sheet to task recognises on its own.
export function downloadTemplate() {
  const csv = 'Task,Description,Due date,Start date,Priority,Client,Category\r\nPrepare October payroll,Salary sheet for 48 staff,05/11/2026,01/11/2026,High,Acme Ltd,Payroll\r\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'task-sheet-format.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

// Link a sheet in three steps (link → columns → team), or change the columns of one already linked.
export default function SheetSetup({ fields, link, onClose, onSaved }) {
  const editing = Boolean(link);
  const [step, setStep] = useState(editing ? 'columns' : 'link');
  const [url, setUrl] = useState(link?.source_url || '');
  const [name, setName] = useState(link?.name || '');
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(link?.mapping || {});
  const [required, setRequired] = useState(() => new Set(link?.required || []));
  const [teamId, setTeamId] = useState(link?.team_id ? String(link.team_id) : '');
  const [teamList, setTeamList] = useState([]);
  const [includeExisting, setIncludeExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { teams.getAll().then((r) => { setTeamList(r.data); if (!teamId && r.data[0]) setTeamId(String(r.data[0].id)); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const read = async (keepMapping) => {
    setBusy(true); setError('');
    try {
      const { data } = await taskSheets.preview(url.trim());
      setPreview(data);
      if (!keepMapping) setMapping(data.suggested);
      if (!name.trim()) setName('My task sheet');
      setStep('columns');
    } catch (err) { setError(errorOf(err, 'Could not read the sheet.')); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (editing) read(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const first = preview?.sample?.[0]?.values || {};
  const used = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const setColumn = (key, header) => {
    setMapping((prev) => ({ ...prev, [key]: header }));
    if (!header) setRequired((prev) => { const next = new Set(prev); next.delete(key); return next; });
  };
  const toggleRequired = (key) => setRequired((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const save = async () => {
    setBusy(true); setError('');
    const body = { name: name.trim(), url: url.trim(), team_id: Number(teamId), mapping, required: [...required] };
    try {
      if (editing) { await taskSheets.update(link.id, body); onSaved('Sheet settings saved.'); }
      else {
        const { data } = await taskSheets.create({ ...body, include_existing: includeExisting });
        onSaved(includeExisting ? `Sheet linked. ${data.result.created} task${data.result.created === 1 ? '' : 's'} created from it.` : 'Sheet linked. New rows will become tasks every evening at 7 pm.');
      }
    } catch (err) { setError(errorOf(err, 'Could not save the sheet.')); setBusy(false); }
  };

  const steps = [['link', 'Sheet link'], ['columns', 'Match columns'], ['team', 'Where tasks go']];
  const footer = (
    <>
      {step !== 'link' && !(editing && step === 'columns') && <Button variant="ghost" onClick={() => setStep(step === 'team' ? 'columns' : 'link')}>Back</Button>}
      <span className="flex-1" />
      <Button onClick={onClose}>Cancel</Button>
      {step === 'link' && <Button variant="primary" disabled={busy || !url.trim()} onClick={() => read(false)}>{busy ? 'Reading sheet…' : 'Read sheet'}</Button>}
      {step === 'columns' && <Button variant="primary" disabled={!mapping.title || !preview} onClick={() => setStep('team')}>Next</Button>}
      {step === 'team' && <Button variant="primary" disabled={busy || !teamId} onClick={save}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Link sheet'}</Button>}
    </>
  );

  return (
    <Modal size="lg" title={editing ? `Edit "${link.name}"` : 'Link a sheet'} subtitle="Rows you add to your sheet become your tasks." onClose={onClose} footer={footer}>
      <ol className="mb-4 flex flex-wrap gap-2 text-xs font-semibold">
        {steps.map(([key, label], i) => {
          const at = steps.findIndex(([k]) => k === step);
          return <li key={key} className={`rounded-full px-3 py-1 ${i === at ? 'bg-accent text-accent-fg' : i < at ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>{i + 1}. {label}</li>;
        })}
      </ol>
      {error && <Banner tone="danger">{error}</Banner>}

      {step === 'link' && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Google Sheet link</span>
            <Input autoFocus placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <span className="text-xs text-muted">In Google Sheets press Share → General access → "Anyone with the link" → Viewer, then copy the link. Open the tab with your tasks first; the link remembers it.</span>
          </label>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Name <span className="font-normal text-muted">(optional)</span></span>
            <Input maxLength={150} placeholder="e.g. Daily work sheet" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line p-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">No sheet yet?</p><p className="text-xs text-muted">Start from our format, or use your own columns. You match them in the next step.</p></div>
            <Button size="sm" onClick={downloadTemplate}>Download format</Button>
          </div>
        </div>
      )}

      {step === 'columns' && !preview && <p role="status" className="text-sm text-muted">{busy ? 'Reading the sheet…' : 'Could not read the sheet.'}</p>}
      {step === 'columns' && preview && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Found <strong className="text-ink">{preview.headers.length} columns</strong> and <strong className="text-ink">{preview.rows} rows</strong>. Pick the column for each field, and switch on <strong className="text-ink">Must be filled</strong> for anything a row cannot do without. A row missing one of those waits until it is filled in.</p>
          <TableWrap>
            <Table>
              <thead><tr><Th>Task field</Th><Th>Column in your sheet</Th><Th>First row</Th><Th align="right">Must be filled</Th></tr></thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.key} className="border-t border-line">
                    <Td className="align-middle font-medium">{field.label}{field.always && <span className="ml-1 text-danger">*</span>}</Td>
                    <Td className="align-middle">
                      <Select aria-label={`Column for ${field.label}`} className="!w-auto min-w-[180px] py-1 text-sm" value={mapping[field.key] || ''} onChange={(e) => setColumn(field.key, e.target.value)}>
                        <option value="">{field.always ? 'Choose a column' : 'Not in my sheet'}</option>
                        {preview.headers.map((h) => <option key={h} value={h} disabled={used.has(h) && mapping[field.key] !== h}>{h}</option>)}
                      </Select>
                    </Td>
                    <Td className="max-w-[220px] truncate align-middle text-muted">{mapping[field.key] ? first[mapping[field.key]] || '—' : ''}</Td>
                    <Td align="right" className="align-middle">
                      {field.always ? <span className="text-xs text-muted">Always</span>
                        : <Switch label={`${field.label} must be filled`} checked={required.has(field.key)} disabled={!mapping[field.key]} onChange={() => toggleRequired(field.key)} />}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <p className="text-xs text-muted">Every task is yours: it is assigned to you. Dates can be 05/11/2026, 2026-11-05 or 5 Nov 2026. Priority can be High, Medium or Low.</p>
        </div>
      )}

      {step === 'team' && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Add the tasks to</span>
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
          {!editing && (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <p className="text-sm font-medium">The {preview?.rows || 0} rows already in the sheet</p>
              {[[false, 'Leave them', 'Only rows added from now on become tasks.'], [true, 'Make tasks from them now', 'Every filled row becomes a task right away.']].map(([value, title, text]) => (
                <label key={title} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-subtle">
                  <input type="radio" name="existing-rows" className="mt-1 accent-[rgb(var(--c-accent))]" checked={includeExisting === value} onChange={() => setIncludeExisting(value)} />
                  <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{text}</span></span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">The sheet is read every evening at 7 pm. Use "Sync now" any time. Add new rows at the bottom; a row that already made a task never makes a second one, even if you edit it.</p>
        </div>
      )}
    </Modal>
  );
}
