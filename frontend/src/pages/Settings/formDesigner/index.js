import React, { useEffect, useMemo, useState } from 'react';
import { taskForm as taskFormApi } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { announceTaskFormChange } from '../../../components/taskForm/useTaskFormLayout';
import { Banner, Button, EmptyState, Loading, Modal } from '../../../ui';
import Section from '../Section';
import TemplateGallery from './TemplateGallery';
import FieldCard from './FieldCard';
import AddFieldBar from './AddFieldBar';
import FormSettingsCard from './FormSettingsCard';
import PreviewModal from './PreviewModal';
import { addField, clone, duplicateField, layoutProblems, moveStep, moveTo, patchField, removeField, sameLayout, setTimeTracking, strip } from './designerUtils';

const PREVIEW_CTX = { idPrefix: 'designer', members: [{ id: 1, name: 'Asha Rao' }], taskOptions: {}, clientPreview: { clients: [{ name: 'Riverside Motors' }], pick_only: false, can_manage: false } };

// Settings → Task form designer. Admins and managers shape the organization's Create task form.
export default function FormDesignerSection() {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [conflict, setConflict] = useState('');

  const load = () => taskFormApi.get().then((r) => { setState(r.data); setDraft(r.data.layout ? clone(strip(r.data.layout)) : null); setConflict(''); })
    .catch(() => setState({ failed: true }));
  useEffect(() => { load(); }, []);

  const dirty = Boolean(draft) && !sameLayout(draft, state?.layout);
  const problems = useMemo(() => (draft ? layoutProblems(draft) : []), [draft]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!state) return <Loading>Loading the form designer…</Loading>;
  if (state.failed) return <Banner tone="danger">Could not load the form designer. <button type="button" className="font-semibold underline" onClick={load}>Retry</button></Banner>;

  const canEdit = state.can_edit;
  const applyTemplate = (t) => { const next = clone(t.layout); setDraft(next); setActive(next.fields.find((f) => !f.hidden)?.key || null); setConfirm(null); };
  const chooseTemplate = (t) => (draft ? setConfirm({ kind: 'template', template: t }) : applyTemplate(t));
  const change = (next) => setDraft(next);

  const save = async () => {
    if (problems.length) { notify(problems[0]); return; }
    setSaving(true);
    try {
      const payload = { ...draft, settings: { ...draft.settings, edit_window_days: draft.settings.edit_window_days === '' ? null : draft.settings.edit_window_days } };
      const { data } = await taskFormApi.save(payload, state.version);
      const next = { ...state, layout: { ...data.layout, version: data.version }, version: data.version };
      setState(next); setDraft(clone(data.layout)); announceTaskFormChange(next);
      notify('Form saved. Everyone in this organization now sees it when they create a task.', 'success');
    } catch (err) {
      if (err.response?.status === 409) setConflict(err.response.data.error);
      notify(err.response?.data?.error || 'Could not save the form.');
    } finally { setSaving(false); }
  };
  const backToClassic = async () => {
    setSaving(true);
    try {
      await taskFormApi.reset();
      const next = { ...state, layout: null, version: 0 };
      setState(next); setDraft(null); setConfirm(null); announceTaskFormChange(next);
      notify('Back to the classic task form.', 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not switch back.'); }
    finally { setSaving(false); }
  };

  const visible = draft ? draft.fields.filter((f) => !f.hidden) : [];
  const hidden = draft ? draft.fields.filter((f) => f.hidden) : [];

  return (
    <Section title="Task form designer" description="Choose exactly what people fill in when they create a task — like building a Google Form. Start from a template, then rename, add, hide or reorder fields."
      actions={draft && <Button onClick={() => setPreview(draft)}>Preview form</Button>}>
      {!canEdit && <Banner tone="warn">Only admins and managers can change the task form. You can look around and preview.</Banner>}
      {conflict && <Banner tone="danger" action={<Button size="sm" onClick={load}>Reload latest</Button>}>{conflict}</Banner>}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${state.layout ? 'border-accent/30 bg-accent-soft' : 'border-line bg-subtle'}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${state.layout ? 'bg-accent' : 'bg-muted'}`} />
        <span className="flex-1">{state.layout
          ? <><strong>Live:</strong> “{state.layout.name}” is the Create task form for everyone in this organization.</>
          : <><strong>Classic form in use.</strong> Pick a template below to customise it. Nothing changes for your team until you save.</>}</span>
        {state.layout && canEdit && <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'classic' })}>Back to classic form</Button>}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">1. Start from a template</h3>
        <TemplateGallery templates={state.templates || []} liveTemplate={state.layout?.template} onUse={chooseTemplate} onPreview={setPreview} disabled={!canEdit} />
      </div>

      {draft ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">2. Make it yours <span className="font-normal text-muted">· click a question to edit it, drag ⠿ to reorder</span></h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-3">
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="h-2 bg-accent" />
                <div className="p-4"><p className="text-xl font-bold">{draft.name || 'Untitled form'}</p><p className="text-sm text-muted">Fields marked * are required.</p></div>
              </div>
              {visible.map((field, i) => (
                <FieldCard key={field.key} field={field} active={active === field.key} first={i === 0} last={i === visible.length - 1} dragging={dragging === field.key} previewCtx={PREVIEW_CTX}
                  onActivate={() => setActive(field.key)}
                  onChange={(patch) => change(patchField(draft, field.key, patch))}
                  onMove={(dir) => change(moveStep(draft, field.key, dir))}
                  onDuplicate={() => { const r = duplicateField(draft, field.key); change(r.layout); setActive(r.key); }}
                  onHide={() => { change(field.key === 'hours' ? setTimeTracking(draft, false) : patchField(draft, field.key, { hidden: true, required: false })); setActive(null); }}
                  onDelete={() => setConfirm({ kind: 'delete', field })}
                  dragProps={{
                    draggable: canEdit,
                    onDragStart: (e) => { setDragging(field.key); e.dataTransfer.effectAllowed = 'move'; },
                    onDragOver: (e) => {
                      e.preventDefault();
                      if (!dragging || dragging === field.key) return;
                      const from = draft.fields.findIndex((f) => f.key === dragging), to = draft.fields.findIndex((f) => f.key === field.key);
                      change(moveTo(draft, dragging, field.key, from < to ? 'after' : 'before'));
                    },
                    onDragEnd: () => setDragging(null), onDrop: (e) => e.preventDefault(),
                  }} />
              ))}
              <AddFieldBar hidden={hidden}
                onAdd={(type) => { const r = addField(draft, type, active); change(r.layout); setActive(r.key); }}
                onShow={(key) => { change(key === 'hours' ? setTimeTracking(draft, true) : patchField(draft, key, { hidden: false })); setActive(key); }} />
            </fieldset>
            <fieldset disabled={!canEdit} className="min-w-0"><FormSettingsCard layout={draft} onChange={change} /></fieldset>
          </div>
        </div>
      ) : <EmptyState title="Pick a template to start">Your team keeps the classic form until you choose a template and save.</EmptyState>}

      {draft && canEdit && (dirty || !state.layout) && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur motion-safe:animate-fade-up">
          <span className="h-2 w-2 rounded-full bg-warn" />
          <span className="flex-1 text-sm">{problems.length ? <span className="text-danger">{problems[0]}</span> : state.layout ? 'You have unsaved changes.' : 'Not live yet — save to use this form.'}</span>
          {state.layout && <Button variant="ghost" onClick={() => { setDraft(clone(strip(state.layout))); setActive(null); }}>Discard</Button>}
          <Button onClick={() => setPreview(draft)}>Preview</Button>
          <Button variant="primary" disabled={saving || problems.length > 0} onClick={save}>{saving ? 'Saving…' : state.layout ? 'Save changes' : 'Save and use this form'}</Button>
        </div>
      )}

      {preview && <PreviewModal layout={preview} onClose={() => setPreview(null)} />}
      {confirm && (
        <Modal title={{ template: `Start from “${confirm.template?.name}”?`, classic: 'Go back to the classic form?', delete: `Delete “${confirm.field?.label}”?` }[confirm.kind]}
          onClose={() => setConfirm(null)}
          footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><span className="flex-1" />
            <Button variant="primary" className={confirm.kind === 'template' ? '' : '!border-danger !bg-danger'} disabled={saving}
              onClick={() => {
                if (confirm.kind === 'template') applyTemplate(confirm.template);
                if (confirm.kind === 'classic') backToClassic();
                if (confirm.kind === 'delete') { change(removeField(draft, confirm.field.key)); setActive(null); setConfirm(null); }
              }}>{{ template: 'Use template', classic: 'Use classic form', delete: 'Delete question' }[confirm.kind]}</Button></>}>
          <p className="text-sm text-muted">{{
            template: 'Your current edits are replaced by the template. Nothing changes for your team until you save.',
            classic: 'Everyone gets the original Create task form again. Answers already saved on tasks are kept.',
            delete: 'It disappears from the form. Answers already saved on older tasks stay in the database but are no longer shown. To keep showing them, hide the question instead.',
          }[confirm.kind]}</p>
        </Modal>
      )}
    </Section>
  );
}
