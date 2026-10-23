import React, { useState } from 'react';
import LayoutField, { FieldShell } from '../../Dashboard/TaskComposer/LayoutField';
import { Banner, Button, FormRow, Modal } from '../../../ui';

const SAMPLE_CTX = {
  idPrefix: 'tspreview', me: 1, taskOptions: {},
  members: [{ id: 1, name: 'You' }, { id: 2, name: 'Asha Rao' }],
  clientPreview: { clients: [{ name: 'Riverside Motors' }, { name: 'Acme Pvt Ltd' }], pick_only: true, can_manage: false },
};
// What people see when they click "+ Add Timesheet". Nothing is saved.
export default function TimesheetPreview({ layout, onClose }) {
  const [values, setValues] = useState({});
  const [checked, setChecked] = useState(null);
  const visible = layout.fields.filter((f) => !f.hidden);
  const tryIt = () => setChecked(visible.filter((f) => f.required && f.type !== 'task' && (values[f.key] === undefined || values[f.key] === '' || values[f.key] === false)).length);

  return (
    <Modal title={`Preview · Add ${layout.name || 'Timesheet'}`} subtitle="Fill it in to try it. Nothing is saved." size="lg" onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={() => { setValues({}); setChecked(null); }}>Clear</Button><Button variant="primary" onClick={tryIt}>Submit</Button></>}>
      {checked !== null && (checked
        ? <Banner tone="warn">{checked} required {checked === 1 ? 'field is' : 'fields are'} empty — the real form would stop here.</Banner>
        : <Banner tone="ok">All set — the real form would save this timesheet.</Banner>)}
      <p className="mb-4 border-b border-line pb-3 text-sm font-semibold">Job Configuration Details</p>
      {visible.map((field) => {
        const shown = field;
        return (
          <FormRow key={field.key} label={field.type === 'checkbox' ? '' : field.label} htmlFor={`tspreview-${field.key}`} required={field.required} hint={field.help}>
            {field.type === 'checkbox'
              ? <FieldShell field={field} id={`tspreview-${field.key}`}><LayoutField field={shown} value={values[field.key]} onChange={(v) => setValues({ ...values, [field.key]: v })} ctx={SAMPLE_CTX} /></FieldShell>
              : <LayoutField field={shown} value={values[field.key]} onChange={(v) => setValues({ ...values, [field.key]: v })} ctx={SAMPLE_CTX} />}
          </FormRow>
        );
      })}
    </Modal>
  );
}
