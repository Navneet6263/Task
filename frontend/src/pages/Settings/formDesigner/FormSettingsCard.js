import React, { useRef } from 'react';
import { Input, Switch } from '../../../ui';
import { buildTitlePreview } from './previewData';
import { patchField, setTimeTracking } from './designerUtils';

function Row({ title, help, control, children }) {
  return (
    <div className="border-b border-line py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">{title}</p>{help && <p className="mt-0.5 text-xs text-muted">{help}</p>}</div>
        {control}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

// Form-wide rules: name, button text, hours per person, edit window and how titles are built.
export default function FormSettingsCard({ layout, onChange }) {
  const patternRef = useRef(null);
  const s = layout.settings;
  const set = (patch) => onChange({ ...layout, settings: { ...s, ...patch } });
  const title = layout.fields.find((f) => f.key === 'title');
  const titleHidden = !title || title.hidden;
  const hours = layout.fields.find((f) => f.key === 'hours');
  const timeOn = Boolean(hours && !hours.hidden);
  const windowOn = s.edit_window_days !== null && s.edit_window_days !== undefined && s.edit_window_days !== '';
  const tokens = layout.fields.filter((f) => !f.hidden && !['title', 'description', 'image', 'type_details', 'issue_type', 'hours', 'long_text', 'checkbox'].includes(f.key) && !['image', 'type_details', 'long_text', 'checkbox'].includes(f.type));

  const insert = (key) => {
    const el = patternRef.current;
    const value = s.title_pattern || '';
    const at = el ? el.selectionStart : value.length;
    const piece = `${value && at > 0 && !value.slice(0, at).endsWith(' ') ? ' · ' : ''}{${key}}`;
    set({ title_pattern: (value.slice(0, at) + piece + value.slice(at)).slice(0, 200) });
  };

  return (
    <aside className="h-fit rounded-xl border border-line bg-surface px-4 py-1 xl:sticky xl:top-[calc(var(--shell-header-height,57px)+20px)]">
      <Row title="Form name" help="Shown at the top of the Create task window.">
        <Input maxLength={80} value={layout.name} onChange={(e) => onChange({ ...layout, name: e.target.value })} />
      </Row>
      <Row title="Submit button text">
        <Input maxLength={30} placeholder="Create task" value={s.submit_label} onChange={(e) => set({ submit_label: e.target.value })} />
      </Row>
      <Row title="Track hours per person" help={'Adds "Hours worked". Each person can then log their own time on the task, and reports show who spent how long.'}
        control={<Switch checked={timeOn} onChange={(on) => onChange(setTimeTracking(layout, on))} label="Track hours per person" />} />
      <Row title="Edit window" help="After this many days only admins can change a task. Moving it through statuses stays open."
        control={<Switch checked={windowOn} onChange={(on) => set({ edit_window_days: on ? 7 : null })} label="Edit window" />}>
        {windowOn && (
          <label className="flex items-center gap-2 text-sm">Lock after
            <Input type="number" min="1" max="365" className="!w-20 text-center font-mono" value={s.edit_window_days}
              onChange={(e) => set({ edit_window_days: e.target.value === '' ? '' : Number(e.target.value) })} /> days</label>
        )}
      </Row>
      <Row title="Task title" help={titleHidden ? 'There is no title question, so the title is built from the answers.' : 'People type the title themselves.'}
        control={<Switch checked={titleHidden} label="Build the title automatically"
          onChange={(auto) => onChange({ ...patchField(layout, 'title', { hidden: auto, required: !auto }), settings: { ...s, title_pattern: auto && !s.title_pattern ? tokens.slice(0, 3).map((f) => `{${f.key}}`).join(' · ') : s.title_pattern } })} />}>
        {titleHidden && (
          <div className="flex flex-col gap-2">
            <Input ref={patternRef} maxLength={200} placeholder="{client_name} · {job_type}" className="font-mono text-xs" value={s.title_pattern} onChange={(e) => set({ title_pattern: e.target.value })} />
            <div className="flex flex-wrap gap-1">
              {tokens.map((f) => (
                <button key={f.key} type="button" onClick={() => insert(f.key)} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:border-accent hover:text-accent">+ {f.label}</button>
              ))}
            </div>
            <p className="text-xs text-muted">Example: <span className="font-medium text-ink">{buildTitlePreview(s.title_pattern, layout) || '—'}</span></p>
          </div>
        )}
      </Row>
    </aside>
  );
}
