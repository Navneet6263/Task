import React, { useEffect } from 'react';
import { localToday } from '../../../components/taskForm/useTaskFormLayout';
import useClients from '../../../components/clients/useClients';
import LayoutField, { FieldShell, WIDE_TYPES } from './LayoutField';

// Where each field's value lives in the task form state.
export const readValue = (form, field) => (field.kind === 'custom' ? form.custom_fields?.[field.key] : form[field.key]);
export const writeValue = (form, update, field, value) => {
  if (field.kind === 'custom') update('custom_fields', { ...(form.custom_fields || {}), [field.key]: value });
  else update(field.key, value);
};

const isEmpty = (field, value) => (field.type === 'checkbox' ? !(value === true || value === 'true') : value === undefined || value === null || String(value).trim() === '');

// Required visible fields that are still empty: { key: message }.
export function missingFields(layout, form) {
  const errors = {};
  layout.fields.forEach((field) => {
    if (field.hidden || !field.required || ['type_details', 'issue_type', 'priority'].includes(field.type)) return;
    if (isEmpty(field, readValue(form, field))) errors[field.key] = `${field.label} is required`;
  });
  return errors;
}

// The "Create task" form built from the organization's layout.
export default function CustomComposer({ layout, form, update, ctx, errors = {}, applyDefaults = true }) {
  const visible = layout.fields.filter((f) => !f.hidden);
  const { clients } = useClients();
  // A client that sits under an agent fills the agent in.
  const change = (field, value) => {
    writeValue(form, update, field, value);
    if (field.key === 'client_name') { const agent = clients.find((c) => c.name === value)?.agent_id; if (agent) update('agent_firm_id', String(agent)); }
  };

  // Fill "Today" and "Me" defaults once, only where nothing has been entered yet.
  useEffect(() => {
    if (!applyDefaults) return;
    const custom = {};
    layout.fields.forEach((field) => {
      if (field.hidden || readValue(form, field)) return;
      let value = null;
      if (field.default === 'today') value = localToday();
      if (field.default === 'me' && ctx.me && (ctx.members || []).some((m) => Number(m.id) === Number(ctx.me))) value = String(ctx.me);
      if (value === null) return;
      if (field.kind === 'custom') custom[field.key] = value;
      else update(field.key, value);
    });
    if (Object.keys(custom).length) update('custom_fields', { ...(form.custom_fields || {}), ...custom });
  }, [layout, ctx.members?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
      {visible.map((field, index) => {
        const wide = field.width === 'full' || WIDE_TYPES.includes(field.type);
        return (
          <div key={field.key} className={`motion-safe:animate-fade-up ${wide ? 'sm:col-span-2' : ''}`} style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
            <FieldShell field={field} id={`${ctx.idPrefix || 'tf'}-${field.key}`} error={errors[field.key]}>
              <LayoutField field={field} value={readValue(form, field)} onChange={(value) => change(field, value)} ctx={{ ...ctx, form, update }} />
            </FieldShell>
          </div>
        );
      })}
    </div>
  );
}
