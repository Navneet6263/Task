import React from 'react';
import { parseCustom } from '../../components/taskForm/useTaskFormLayout';
import LayoutField, { FieldShell } from './TaskComposer/LayoutField';
import { Row, Sec, dateLabel } from './TaskDetailFields';

const show = (field, value) => {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'checkbox') return value === true || value === 'true' ? 'Yes' : 'No';
  if (field.type === 'date') return dateLabel(value);
  return String(value);
};

// Answers to the organization's own questions, shown on the task.
export function CustomFieldsDetail({ layout, task }) {
  const values = parseCustom(task.custom_fields);
  const fields = layout.fields.filter((f) => f.kind === 'custom' && (!f.hidden || values[f.key] !== undefined));
  if (!fields.length) return null;
  return (
    <Sec title={layout.name || 'Form answers'}>
      {fields.map((field) => <Row key={field.key} label={field.label}>{show(field, values[field.key])}</Row>)}
    </Sec>
  );
}

// Editable answers on the task's Edit tab. Sends the full answer set; the server checks it.
export function CustomFieldsEdit({ layout, task, up }) {
  const values = parseCustom(task.custom_fields);
  const fields = layout.fields.filter((f) => f.kind === 'custom' && !f.hidden);
  if (!fields.length) return null;
  return (
    <div className="rounded-lg border border-line bg-subtle/50 p-3">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{layout.name || 'Form answers'}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className={field.width === 'full' || field.type === 'long_text' ? 'sm:col-span-2' : ''}>
            <FieldShell field={field} id={`edit-${field.key}`}>
              <LayoutField field={field} value={values[field.key]} ctx={{ idPrefix: 'edit' }} onChange={(value) => up('custom_fields', { ...values, [field.key]: value })} />
            </FieldShell>
          </div>
        ))}
      </div>
    </div>
  );
}
