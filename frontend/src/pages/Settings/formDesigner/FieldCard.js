import React, { useRef } from 'react';
import LayoutField from '../../Dashboard/TaskComposer/LayoutField';
import { Chip, Input, Segmented, Select, Switch } from '../../../ui';
import { CUSTOM_TYPES, TYPE_META } from './designerUtils';

const NO_REQUIRED = ['issue_type', 'priority', 'type_details'];

function OptionsEditor({ options, onChange }) {
  const refs = useRef([]);
  const set = (i, value) => onChange(options.map((o, k) => (k === i ? value : o)));
  const add = (after) => {
    const next = [...options]; next.splice(after + 1, 0, `Option ${options.length + 1}`); onChange(next);
    setTimeout(() => { refs.current[after + 1]?.focus(); refs.current[after + 1]?.select(); }, 0);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs text-muted">{i + 1}.</span>
          <Input ref={(el) => { refs.current[i] = el; }} aria-label={`Option ${i + 1}`} maxLength={80} value={option} className="!py-1.5"
            onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(i); } }} />
          <button type="button" aria-label={`Remove option ${i + 1}`} disabled={options.length === 1} onClick={() => onChange(options.filter((_, k) => k !== i))}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-danger disabled:opacity-30">×</button>
        </div>
      ))}
      <button type="button" onClick={() => add(options.length - 1)} className="ml-7 w-fit text-xs font-semibold text-accent hover:underline">+ Add option</button>
    </div>
  );
}

const IconBtn = ({ label, onClick, disabled, danger, children }) => (
  <button type="button" title={label} aria-label={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`grid h-8 w-8 place-items-center rounded-md text-sm text-muted transition hover:bg-subtle disabled:opacity-30 ${danger ? 'hover:text-danger' : 'hover:text-ink'}`}>{children}</button>
);

// One question card, Google Forms style: a preview when idle, full editing when selected.
export default function FieldCard({ field, active, first, last, dragging, previewCtx, onActivate, onChange, onMove, onDuplicate, onHide, onDelete, dragProps }) {
  const [typeName, glyph] = TYPE_META[field.type] || [field.type, '?'];
  const custom = field.kind === 'custom';
  return (
    <div {...(active ? {} : { role: 'button', tabIndex: 0, 'aria-label': `Edit ${field.label}` })} onClick={onActivate} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onActivate(); }} {...dragProps}
      className={`relative rounded-xl border bg-surface p-4 text-left transition-all duration-200 ${active ? 'border-accent shadow-md ring-1 ring-accent/20' : 'border-line hover:border-muted'} ${dragging ? 'scale-[0.99] opacity-50' : ''}`}>
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full bg-accent transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
      <div className="flex items-center gap-2">
        <span className="cursor-grab select-none text-muted active:cursor-grabbing" title="Drag to reorder" aria-hidden="true">⠿</span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-subtle font-mono text-[11px] text-muted">{glyph}</span>
        {!active && <p className="min-w-0 flex-1 truncate text-sm font-semibold">{field.label}{field.required && <span className="text-danger"> *</span>}</p>}
        {active && <span className="flex-1" />}
        <Chip tone={custom ? 'info' : 'neutral'}>{custom ? typeName : `Built-in · ${typeName}`}</Chip>
      </div>

      {!active && (
        <div className="pointer-events-none mt-3 opacity-80" aria-hidden="true">
          <LayoutField field={field} value={field.type === 'issue_type' ? 'task' : ''} onChange={() => {}} ctx={previewCtx} disabled />
          {field.help && <p className="mt-1 text-xs text-muted">{field.help}</p>}
        </div>
      )}

      {active && (
        <div className="mt-3 flex flex-col gap-3 motion-safe:animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
            <Input aria-label="Question" autoFocus maxLength={80} placeholder="Question" className="!text-base font-semibold" value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
            {custom ? (
              <Select aria-label="Answer type" value={field.type} onChange={(e) => onChange({ type: e.target.value, ...(e.target.value === 'dropdown' && !field.options?.length ? { options: ['Option 1'] } : {}) })}>
                {CUSTOM_TYPES.map(([type]) => <option key={type} value={type}>{TYPE_META[type][0]}</option>)}
              </Select>
            ) : field.types?.length > 1 ? (
              <Select aria-label="Answer type" value={field.type} onChange={(e) => onChange({ type: e.target.value, ...(e.target.value === 'dropdown' && !field.options?.length ? { options: ['Option 1'] } : {}) })}>
                {field.types.map((type) => <option key={type} value={type}>{type === 'text' ? 'Short answer (type anything)' : TYPE_META[type][0]}</option>)}
              </Select>
            ) : <p className="self-center text-xs text-muted">{field.locked ? 'Always on the form and required — reports are built from it. You can rename it.' : 'Built-in field: saved in its own column. Its type can\'t change.'}</p>}
          </div>
          <Input aria-label="Help text" maxLength={200} placeholder="Help text shown under the field (optional)" value={field.help || ''} onChange={(e) => onChange({ help: e.target.value })} />
          {field.type === 'dropdown' && <OptionsEditor options={field.options || ['Option 1']} onChange={(options) => onChange({ options })} />}
          {field.type === 'date' && (
            <label className="flex items-center gap-2 text-sm text-muted">Starts as
              <Select className="!w-auto !py-1.5" value={field.default || ''} onChange={(e) => onChange({ default: e.target.value || undefined })}><option value="">Empty</option><option value="today">Today</option></Select></label>
          )}
          {field.type === 'person' && (
            <label className="flex items-center gap-2 text-sm text-muted">Starts as
              <Select className="!w-auto !py-1.5" value={field.default || ''} onChange={(e) => onChange({ default: e.target.value || undefined })}><option value="">Nobody</option><option value="me">The person filling the form</option></Select></label>
          )}
          {field.type === 'client' && (
            <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">The client list, and whether people may only pick from it, is set in <strong className="text-ink">Settings → Clients</strong>.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Segmented label="Width" value={field.width} onChange={(width) => onChange({ width })} options={[['half', 'Half width'], ['full', 'Full width']]} />
            <span className="flex-1" />
            <IconBtn label="Move up" disabled={first} onClick={() => onMove(-1)}>↑</IconBtn>
            <IconBtn label="Move down" disabled={last} onClick={() => onMove(1)}>↓</IconBtn>
            {custom && <IconBtn label="Duplicate" onClick={onDuplicate}>⧉</IconBtn>}
            {!field.locked && <IconBtn label="Hide from the form" onClick={onHide}>◌</IconBtn>}
            {custom && <IconBtn label="Delete question" danger onClick={onDelete}>✕</IconBtn>}
            {!NO_REQUIRED.includes(field.type) && !field.locked && (
              <label className="ml-1 flex items-center gap-2 border-l border-line pl-3 text-sm font-medium">Required
                <Switch checked={Boolean(field.required)} onChange={(v) => onChange({ required: v })} label="Required" /></label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
