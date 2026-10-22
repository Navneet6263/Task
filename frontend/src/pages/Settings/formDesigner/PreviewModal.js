import React, { useEffect, useState } from 'react';
import CustomComposer, { missingFields } from '../../Dashboard/TaskComposer/CustomComposer';
import { tasks } from '../../../services/api';
import { Banner, Button, Modal, Segmented } from '../../../ui';
import { blankPreviewForm } from './previewData';
import useClients from '../../../components/clients/useClients';

// Exactly what people see when they click "Create task", with a try-it-out submit check.
export default function PreviewModal({ layout, onClose }) {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [form, setForm] = useState(blankPreviewForm);
  const [viewAs, setViewAs] = useState('person');
  const [errors, setErrors] = useState({});
  const [checked, setChecked] = useState(false);
  const [options, setOptions] = useState({ task_types: [], products: [], categories: [] });
  const clientList = useClients();
  useEffect(() => { tasks.getFormOptions().then((r) => setOptions(r.data)).catch(() => {}); }, []);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value, ...(key === 'task_type' ? { category: '' } : {}) }));
  const ctx = {
    idPrefix: 'preview', me: user.id || 1, taskOptions: options,
    members: [{ id: user.id || 1, name: user.name || 'You' }, { id: -2, name: 'Asha Rao' }, { id: -3, name: 'Rahul Verma' }],
    clientPreview: { ...clientList, can_manage: viewAs === 'manager', clients: clientList.clients.length ? clientList.clients : [{ name: 'Riverside Motors' }, { name: 'Acme Pvt Ltd' }] },
  };
  const tryIt = () => { const missing = missingFields(layout, form); setErrors(missing); setChecked(true); };

  return (
    <Modal title={`Preview · ${layout.name}`} subtitle="Fill it in to try it. Nothing is saved." size="md" onClose={onClose}
      footer={<>
        <Segmented label="View as" value={viewAs} onChange={setViewAs} options={[['person', 'Employee'], ['manager', 'Manager / admin']]} />
        <span className="flex-1" />
        <Button onClick={() => { setForm(blankPreviewForm()); setErrors({}); setChecked(false); }}>Clear</Button>
        <Button variant="primary" onClick={tryIt}>{layout.settings.submit_label || 'Create task'}</Button>
      </>}>
      {checked && (Object.keys(errors).length
        ? <Banner tone="warn">{Object.keys(errors).length} required {Object.keys(errors).length === 1 ? 'field is' : 'fields are'} empty — the real form would stop here.</Banner>
        : <Banner tone="ok">All set — the real form would create the task now.</Banner>)}
      <CustomComposer key={viewAs} layout={layout} form={form} update={update} ctx={ctx} errors={errors} />
    </Modal>
  );
}
