import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Banner, Button, Input, Loading, Modal } from '../../../ui';
import FieldCard from './FieldCard';
import AddFieldBar from './AddFieldBar';
import TimesheetPreview from './TimesheetPreview';
import { addField, clone, duplicateField, layoutProblems, moveStep, moveTo, patchField, removeField, sameLayout } from './designerUtils';

const PREVIEW_CTX = { idPrefix: 'tsdesigner', members: [{ id: 1, name: 'Asha Rao' }], taskOptions: {}, clientPreview: { clients: [{ name: 'Riverside Motors' }], pick_only: true, can_manage: false } };
const strip = (layout) => (layout ? (({ version, is_default, ...rest }) => rest)(layout) : null);

// Form designer → Timesheet form. The starting point is the form as it works today.
export default function TimesheetFormDesigner() {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [conflict, setConflict] = useState('');

  const load = () => timesheet.form().then((r) => { setState(r.data); setDraft(clone(strip(r.data.layout))); setConflict(''); }).catch(() => setState({ failed: true }));
  useEffect(() => { load(); }, []);
  const dirty = Boolean(draft) && !sameLayout(draft, strip(state?.layout));
  const problems = useMemo(() => (draft ? layoutProblems(draft) : []), [draft]);

  if (!state) return <Loading>Loading the timesheet form…</Loading>;
  if (state.failed) return <Banner tone="danger">Could not load the timesheet form. <button type="button" className="font-semibold underline" onClick={load}>Retry</button></Banner>;
  const canEdit = state.can_edit;

  const save = async () => {
    if (problems.length) { notify(problems[0]); return; }
    setSaving(true);
    try {
      const { data } = await timesheet.saveForm(draft, state.version);
      setState({ ...state, ...data }); setDraft(clone(strip(data.layout)));
      notify('Timesheet form saved. Everyone sees it the next time they add a timesheet.', 'success');
    } catch (err) {
      if (err.response?.status === 409) setConflict(err.response.data.error);
      notify(err.response?.data?.error || 'Could not save the form.');
    } finally { setSaving(false); }
  };
  const backToOriginal = async () => {
    setSaving(true);
    try { const { data } = await timesheet.resetForm(); setState({ ...state, ...data }); setDraft(clone(strip(data.layout))); setConfirm(null); notify('Back to the original timesheet form.', 'success'); }
    catch (err) { notify(err.response?.data?.error || 'Could not switch back.'); }
    finally { setSaving(false); }
  };

  const visible = draft.fields.filter((f) => !f.hidden);
  const hidden = draft.fields.filter((f) => f.hidden);
  const dragProps = (field) => ({
    draggable: canEdit,
    onDragStart: (e) => { setDragging(field.key); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e) => {
      e.preventDefault();
      if (!dragging || dragging === field.key) return;
      const from = draft.fields.findIndex((f) => f.key === dragging), to = draft.fields.findIndex((f) => f.key === field.key);
      setDraft(moveTo(draft, dragging, field.key, from < to ? 'after' : 'before'));
    },
    onDragEnd: () => setDragging(null), onDrop: (e) => e.preventDefault(),
  });

  return (
    <div className="flex flex-col gap-4">
      {!canEdit && <Banner tone="warn">Only admins and managers can change the timesheet form.</Banner>}
      {conflict && <Banner tone="danger" action={<Button size="sm" onClick={load}>Reload latest</Button>}>{conflict}</Banner>}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${state.saved ? 'border-accent/30 bg-accent-soft' : 'border-line bg-subtle'}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${state.saved ? 'bg-accent' : 'bg-muted'}`} />
        <span className="flex-1">{state.saved ? <><strong>Customised form in use.</strong> Changes apply the next time someone adds a timesheet.</> : <><strong>Original form in use.</strong> Edit anything below and save to customise it.</>}</span>
        <Button size="sm" onClick={() => setPreview(true)}>Preview</Button>
        {state.saved && canEdit && <Button size="sm" variant="ghost" onClick={() => setConfirm('reset')}>Back to original</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="h-2 bg-accent" />
            <div className="flex flex-col gap-1 p-4">
              <label htmlFor="ts-form-name" className="text-xs font-medium text-muted">Form name (shown as “Add …” on the button and window)</label>
              <Input id="ts-form-name" maxLength={80} className="!text-lg font-bold" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
          </div>
          {visible.map((field, i) => (
            <FieldCard key={field.key} field={field} active={active === field.key} first={i === 0} last={i === visible.length - 1} dragging={dragging === field.key} previewCtx={PREVIEW_CTX}
              onActivate={() => setActive(field.key)}
              onChange={(patch) => setDraft(patchField(draft, field.key, patch))}
              onMove={(dir) => setDraft(moveStep(draft, field.key, dir))}
              onDuplicate={() => { const r = duplicateField(draft, field.key); setDraft(r.layout); setActive(r.key); }}
              onHide={() => { setDraft(patchField(draft, field.key, { hidden: true, required: false })); setActive(null); }}
              onDelete={() => setConfirm({ field })}
              dragProps={dragProps(field)} />
          ))}
          <AddFieldBar hidden={hidden}
            onAdd={(type) => { const r = addField(draft, type, active); setDraft(r.layout); setActive(r.key); }}
            onShow={(key) => { setDraft(patchField(draft, key, { hidden: false })); setActive(key); }} />
        </fieldset>
        <aside className="h-fit rounded-xl border border-line bg-surface p-4 text-sm xl:sticky xl:top-[calc(var(--shell-header-height,57px)+20px)]">
          <p className="font-semibold">How it works</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-muted">
            <li>Click a field to rename it, make it required or optional, or change its dropdown options.</li>
            <li>Drag ⠿ to reorder. Hide what you don’t need — older entries keep their answers.</li>
            <li><strong className="text-ink">Client, Date worked and Hours</strong> always stay and are required, because reports are built from them. You can rename them.</li>
            <li>Extra questions show up in the timesheet report as new columns.</li>
            <li>Clients come from <strong className="text-ink">Settings → Clients</strong>.</li>
          </ul>
        </aside>
      </div>

      {canEdit && (dirty || !state.saved) && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur motion-safe:animate-fade-up">
          <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-warn' : 'bg-muted'}`} />
          <span className="flex-1 text-sm">{problems.length ? <span className="text-danger">{problems[0]}</span> : dirty ? 'You have unsaved changes.' : 'This is the original form. Change something to customise it.'}</span>
          {dirty && <Button variant="ghost" onClick={() => { setDraft(clone(strip(state.layout))); setActive(null); }}>Discard</Button>}
          <Button variant="primary" disabled={saving || !dirty || problems.length > 0} onClick={save}>{saving ? 'Saving…' : 'Save timesheet form'}</Button>
        </div>
      )}

      {preview && <TimesheetPreview layout={draft} onClose={() => setPreview(false)} />}
      {confirm && (
        <Modal title={confirm === 'reset' ? 'Go back to the original timesheet form?' : `Delete “${confirm.field.label}”?`} onClose={() => setConfirm(null)}
          footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><span className="flex-1" />
            <Button variant="primary" className="!border-danger !bg-danger" disabled={saving}
              onClick={() => { if (confirm === 'reset') backToOriginal(); else { setDraft(removeField(draft, confirm.field.key)); setActive(null); setConfirm(null); } }}>
              {confirm === 'reset' ? 'Use original form' : 'Delete question'}</Button></>}>
          <p className="text-sm text-muted">{confirm === 'reset'
            ? 'Everyone gets the original timesheet form again. Answers already saved on entries are kept.'
            : 'It disappears from the form. Answers already saved on older entries stay in the database but are no longer shown. To keep showing them, hide the question instead.'}</p>
        </Modal>
      )}
    </div>
  );
}
