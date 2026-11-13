import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clients as clientsApi, taskForm, teams as teamsApi, timesheet } from '../../services/api';
import { notify } from '../../services/feedback';
import { Banner, Button, Card, Chip, EmptyState, Loading, PageHeader } from '../../ui';
import { UploadIcon } from '../../components/LayoutParts';
import { readWorkbook } from './sheetFile';
import { downloadSample } from './sampleSheet';
import { uploadFields } from './entrySheet';
import { taskFields } from './taskSheet';
import { KINDS, columnGuide } from './guide';
import ClientUpload from './ClientUpload';
import EntryUpload from './EntryUpload';
import TaskUpload from './TaskUpload';

const STEPS = ['Choose what to upload', 'Get the sheet ready', 'Upload the sheet', 'Check and confirm'];
const settle = (promise, fallback) => promise.then((r) => r.data).catch(() => fallback);
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Everything the checks need, loaded once: teams and their people, clients and agents, both forms.
async function loadContext() {
  const [clientData, teamList, form, status] = await Promise.all([
    settle(clientsApi.list(), null), settle(teamsApi.getAll(), []), settle(taskForm.get(), null), settle(timesheet.status(), null),
  ]);
  const teams = Array.isArray(teamList) ? teamList : [];
  const [ts, memberLists] = await Promise.all([
    status?.enabled ? settle(timesheet.config(), null) : null,
    Promise.all(teams.map((team) => settle(teamsApi.getMembers(team.id), []))),
  ]);
  return {
    today: ts?.today || localToday(), teams, ts,
    members: Object.fromEntries(teams.map((team, i) => [team.id, Array.isArray(memberLists[i]) ? memberLists[i] : []])),
    clients: clientData?.clients || [], agents: (clientData?.agents || []).filter((a) => a.is_active !== false),
    pickOnly: Boolean(clientData?.pick_only), canManageClients: Boolean(clientData?.can_manage), taskLayout: form?.layout || null,
  };
}

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7" /></svg>
);
const Download = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12" /><polyline points="7 11 12 16 17 11" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
);

function StepNumber({ n, state }) {
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${state === 'done' ? 'bg-accent text-accent-fg' : state === 'now' ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>
      {state === 'done' ? <Check /> : n}
    </span>
  );
}

// One step: the same card and heading as the rest of the app.
function Step({ n, title, state, summary, children }) {
  return (
    <Card className={`${state === 'now' ? 'border-accent/50' : ''} ${state === 'later' ? 'opacity-60' : ''}`}>
      <div aria-label={`Step ${n}: ${title}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${children ? 'border-b border-line' : ''}`}>
        <StepNumber n={n} state={state} />
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold"><span className="font-normal text-muted">Step {n}.</span> {title}</h3>
        {summary && <div className="text-sm text-muted">{summary}</div>}
      </div>
      {children && <div className="flex flex-col gap-3 p-4">{children}</div>}
    </Card>
  );
}

// Sidebar → Bulk upload: tasks, clients and timesheet entries from a sheet, in four plain steps.
export default function BulkUpload() {
  const [ctx, setCtx] = useState(null);
  const [params, setParams] = useSearchParams();
  const [workbook, setWorkbook] = useState(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [round, setRound] = useState(0);

  const reload = useCallback(() => loadContext().then(setCtx).catch(() => setCtx((prev) => prev || { failed: true })), []);
  useEffect(() => { reload(); }, [reload]);
  // Leaving the page half way through an upload would lose track of what went in.
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const kinds = useMemo(() => (!ctx || ctx.failed ? [] : [
    ...(ctx.teams.length ? ['tasks'] : []), ...(ctx.canManageClients ? ['clients'] : []), ...(ctx.ts ? ['entries'] : []),
  ]), [ctx]);
  const asked = params.get('type');
  const kind = kinds.includes(asked) ? asked : kinds.length === 1 ? kinds[0] : null;
  const fields = useMemo(() => {
    if (!ctx || !kind || kind === 'clients') return [];
    return kind === 'tasks' ? taskFields(ctx) : uploadFields(ctx.ts.form).filter((f) => f.key !== 'agent_id' || ctx.ts.permissions?.log_for_others);
  }, [ctx, kind]);
  const guide = useMemo(() => (kind ? columnGuide(kind, fields, kind === 'entries' ? { ...ctx, pickOnly: true } : ctx) : []), [kind, fields, ctx]);

  if (!ctx) return <Loading>Getting bulk upload ready…</Loading>;
  if (ctx.failed) return <><PageHeader title="Bulk upload" /><Banner tone="danger">Could not load this page. <button type="button" className="font-semibold underline" onClick={reload}>Try again</button></Banner></>;
  if (!kinds.length) return <><PageHeader title="Bulk upload" /><EmptyState title="Nothing to upload yet">You need to be in a team to upload tasks. Ask your admin to add you to one.</EmptyState></>;

  const again = () => { setWorkbook(null); setFileName(''); setError(''); setFinished(false); setRound((r) => r + 1); };
  const choose = (next) => { if (busy || next === kind) return; again(); setShowGuide(false); setParams({ type: next }, { replace: true }); };
  const take = async (file) => {
    if (!file || reading) return;
    setError(''); setReading(true);
    try { setWorkbook(await readWorkbook(file)); setFileName(file.name); setFinished(false); setRound((r) => r + 1); }
    catch (err) { setError(err.message || 'This file could not be read.'); }
    finally { setReading(false); }
  };
  const sample = () => downloadSample(kind, ctx).catch(() => notify('Could not make the template. Try again.'));
  const info = kind ? KINDS[kind] : null;
  const current = !kind ? 1 : !workbook ? 2 : 4;
  const stateOf = (n) => (finished || n < current || (n === 3 && workbook) ? 'done' : n === current || (n === 3 && current === 2) ? 'now' : 'later');
  const guideOpen = !workbook || showGuide;
  const flow = { workbook, onAgain: again, onBusy: setBusy, onDone: () => setFinished(true) };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader title="Bulk upload" subtitle="Add many tasks, clients or timesheet entries at once from an Excel sheet. Follow the steps below. Nothing is saved until you press the button in the last step." />

      <ol aria-label="Steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((title, i) => {
          const state = stateOf(i + 1);
          return (
            <li key={title} aria-current={state === 'now' ? 'step' : undefined} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${state === 'now' ? 'border-accent/50 bg-accent-soft font-semibold text-accent' : state === 'done' ? 'border-line bg-surface font-medium text-ink' : 'border-line bg-surface text-muted'}`}>
              <StepNumber n={i + 1} state={state} />{title}
            </li>
          );
        })}
      </ol>

      <Step n={1} title={STEPS[0]} state={stateOf(1)}>
        <div role="radiogroup" aria-label="What to upload" className={`grid grid-cols-1 gap-3 ${kinds.length > 1 ? 'sm:grid-cols-2' : ''} ${kinds.length > 2 ? 'lg:grid-cols-3' : ''}`}>
          {kinds.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={busy} onClick={() => choose(k)}
              className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition disabled:cursor-not-allowed ${kind === k ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/50 hover:bg-subtle'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">{KINDS[k].title}</span>
                {kind === k && <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg"><Check /></span>}
              </span>
              <span className="text-sm text-muted">{KINDS[k].text}</span>
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{KINDS[k].limit ? `Up to ${KINDS[k].limit} at a time` : 'Any number at a time'}</span>
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title={STEPS[1]} state={stateOf(2)}
        summary={kind && workbook && <button type="button" className="text-xs font-semibold text-accent hover:underline" aria-expanded={guideOpen} onClick={() => setShowGuide((v) => !v)}>{guideOpen ? 'Hide the guide' : 'Show the guide'}</button>}>
        {kind && guideOpen && (
          <>
            <ol className="flex flex-col gap-3 text-sm">
              {[
                ['Download the template.', <>It is an Excel file with the right headings for your {info.title.toLowerCase()}.
                  <span className="mt-2 block"><Button variant="primary" size="sm" onClick={sample}><Download />Download the {info.title.toLowerCase()} template</Button></span></>],
                ['Open it in Excel and fill it from the second line down.', `${info.line} The first line is an example. You can leave it there; it is skipped.`],
                ['Keep the headings in the first row as they are.', `The “How to fill” tab inside the file explains every column${kind === 'clients' ? '.' : ', and the “Lists” tab has the exact names to copy.'}`],
                ['Save the file.', 'Then upload it in step 3 below.'],
              ].map(([lead, rest], i) => (
                <li key={lead} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-subtle text-xs font-semibold text-muted">{i + 1}</span>
                  <span className="min-w-0 pt-0.5"><span className="font-semibold">{lead}</span> <span className="text-muted">{rest}</span></span>
                </li>
              ))}
            </ol>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="border-b border-line px-3 py-2.5 text-left text-[15px] font-semibold">What to write in each column</caption>
                <thead className="bg-subtle"><tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted"><th className="px-3 py-2 font-semibold">Column</th><th className="px-3 py-2 font-semibold">What to write</th><th className="px-3 py-2 font-semibold">Required</th></tr></thead>
                <tbody>
                  {guide.map((column) => (
                    <tr key={column.label} className="border-b border-line last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{column.label}</td>
                      <td className="px-3 py-2 text-muted">{column.help}</td>
                      <td className="px-3 py-2">{column.required ? <Chip tone="warn">Yes</Chip> : <span className="text-muted">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-md bg-subtle px-3.5 py-2.5 text-sm text-muted"><span className="font-semibold text-ink">Already have your own sheet?</span> Upload it as it is. The columns are matched by their headings, and you are asked about any that cannot be placed.</p>
          </>
        )}
      </Step>

      <Step n={3} title={STEPS[2]} state={stateOf(3)}
        summary={workbook && <span className="flex items-center gap-2 text-xs"><span className="max-w-[200px] truncate font-semibold">{fileName}</span>{!finished && <button type="button" disabled={busy} className="font-semibold text-accent hover:underline disabled:opacity-50" onClick={again}>Change file</button>}</span>}>
        {kind && !workbook && (
          <>
            <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center transition ${over ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50 hover:bg-subtle'}`}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent"><UploadIcon /></span>
              <span className="text-sm font-semibold">{reading ? 'Reading the sheet…' : 'Drop your filled sheet here, or click to choose it'}</span>
              <span className="text-xs text-muted">Excel (.xlsx) or CSV, up to 5 MB. Nothing is saved yet: you check every row in step 4 first.</span>
              <input type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Choose a sheet" disabled={reading} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
          </>
        )}
      </Step>

      <Step n={4} title={finished ? 'Done' : STEPS[3]} state={stateOf(4)}>
        {kind && workbook && (
          <React.Fragment key={`${kind}-${round}`}>
            {kind === 'tasks' && <TaskUpload {...flow} ctx={ctx} />}
            {kind === 'clients' && <ClientUpload {...flow} config={ctx} onChanged={reload} />}
            {kind === 'entries' && <EntryUpload {...flow} config={ctx.ts} />}
          </React.Fragment>
        )}
      </Step>
    </div>
  );
}
