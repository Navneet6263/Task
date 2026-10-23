import React from 'react';
import { Button, Input, Select, Textarea } from '../../../ui';
import { BugFields, EnhancementFields, FeatureFields, StoryFields } from './TypeFields';
import ClientPicker from '../../../components/clients/ClientPicker';

const ISSUE_TYPES = [['task', 'Task'], ['bug', 'Bug'], ['story', 'Story'], ['feature', 'Feature'], ['enhancement', 'Enhancement']];
const PRIORITIES = [['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High']];
export const WIDE_TYPES = ['long_text', 'image', 'type_details', 'issue_type'];

// Label, help and error around one form control.
export function FieldShell({ field, id, error, children }) {
  if (field.type === 'checkbox') {
    return (
      <div className="flex flex-col gap-1">
        {children}
        {field.help && <p className="pl-6 text-xs text-muted">{field.help}</p>}
        {error && <p className="pl-6 text-xs text-danger">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">{field.label}{field.required && <span className="text-danger"> *</span>}</label>
      {children}
      {field.help && <p className="text-xs text-muted">{field.help}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

// The control for one field of a designed form. `ctx` carries members, clients, task options and helpers.
export default function LayoutField({ field, value, onChange, ctx, disabled = false }) {
  const id = `${ctx.idPrefix || 'tf'}-${field.key}`;
  const v = value ?? '';
  const set = (event) => onChange(event.target.value);
  switch (field.type) {
    case 'issue_type':
      return (
        <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-1.5">
          {ISSUE_TYPES.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={(v || 'task') === key} disabled={disabled} onClick={() => onChange(key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${(v || 'task') === key ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:border-accent hover:text-accent'}`}>{label}</button>
          ))}
        </div>
      );
    case 'long_text':
      return <Textarea id={id} rows={3} maxLength={5000} disabled={disabled} value={v} onChange={set} />;
    case 'priority':
      return <Select id={id} disabled={disabled} value={v || 'MEDIUM'} onChange={set}>{PRIORITIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>;
    case 'person':
      return (
        <Select id={id} disabled={disabled} value={v} onChange={set}>
          <option value="">{field.required ? 'Select a person' : 'Unassigned'}</option>
          {(ctx.members || []).map((m) => <option key={m.id} value={m.id}>{m.name}{Number(m.id) === Number(ctx.me) ? ' (you)' : ''}</option>)}
        </Select>
      );
    case 'client':
      return <ClientPicker id={id} value={v} onChange={onChange} disabled={disabled} preview={ctx.clientPreview || null} />;
    case 'task':
      return <Select id={id} disabled value="" onChange={() => {}}><option value="">Search and pick a task…</option></Select>;
    case 'date':
      return <Input id={id} type="date" disabled={disabled} value={v ? String(v).slice(0, 10) : ''} onChange={set} />;
    case 'task_option': {
      const opts = ctx.taskOptions || {};
      const list = field.key === 'task_type' ? opts.task_types : field.key === 'product' ? opts.products
        : (opts.categories || []).filter((o) => !o.parent_value || o.parent_value === ctx.form?.task_type);
      return (
        <Select id={id} disabled={disabled} value={v} onChange={set}>
          <option value="">Select</option>
          {(list || []).map((o) => <option key={o.id || o.label} value={o.label}>{o.label}</option>)}
        </Select>
      );
    }
    case 'type_details': {
      const type = ctx.form?.issue_type || 'task';
      const Fields = { bug: BugFields, feature: FeatureFields, enhancement: EnhancementFields, story: StoryFields }[type];
      if (!Fields || !ctx.update) return <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted">Extra fields appear here when the type is Bug, Feature, Story or Enhancement.</p>;
      return <fieldset disabled={disabled} className="grid grid-cols-1 gap-3 md:grid-cols-3"><Fields f={ctx.form} u={ctx.update} /></fieldset>;
    }
    case 'image':
      return v ? (
        <div className="flex items-start gap-3 rounded-md border border-line p-2">
          <img src={v} alt="Reference preview" className="max-h-32 rounded border border-line object-cover" />
          <Button size="sm" variant="danger" disabled={disabled} onClick={() => onChange('')}>Remove</Button>
        </div>
      ) : (
        <label className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line bg-subtle px-3 py-3 text-sm hover:border-accent ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
          <span className="font-semibold text-accent">Upload image</span><span className="text-xs text-muted">PNG, JPG or WEBP · max 450KB</span>
          <input id={id} type="file" accept="image/*" className="hidden" onChange={ctx.onImage} />
        </label>
      );
    case 'hours':
    case 'number':
      return <Input id={id} type="number" inputMode="decimal" disabled={disabled} min={field.type === 'hours' ? '0.25' : undefined} max={field.type === 'hours' ? '24' : undefined}
        step={field.type === 'hours' ? '0.25' : 'any'} placeholder={field.type === 'hours' ? 'e.g. 2.5' : ''} value={v} onChange={set} />;
    case 'dropdown':
      return (
        <Select id={id} disabled={disabled} value={v} onChange={set}>
          <option value="">Select</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      );
    case 'checkbox':
      return (
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
          <input id={id} type="checkbox" disabled={disabled} className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={v === true || v === 'true'} onChange={(e) => onChange(e.target.checked)} />
          {field.label}{field.required && <span className="text-danger">*</span>}
        </label>
      );
    default:
      return <Input id={id} maxLength={field.key === 'title' ? 255 : 500} disabled={disabled} value={v} onChange={set} />;
  }
}
