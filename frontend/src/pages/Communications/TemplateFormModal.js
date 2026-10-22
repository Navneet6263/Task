import React, { useState } from 'react';
import { communications } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, FieldError, Input, Modal, Textarea } from '../../ui';

// Create or edit an organization template. Everyone in the company can use it.
export default function TemplateFormModal({ template, initial, onClose, onSaved }) {
  const [form, setForm] = useState({ name: template?.name || '', subject: template?.subject || initial?.subject || '', body: template?.body || initial?.body || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) { setError('Name, subject and message are all required.'); return; }
    setSaving(true);
    try {
      if (template) await communications.updateTemplate(template.id, form);
      else await communications.createTemplate(form);
      notify(template ? 'Template updated.' : `Template "${form.name.trim()}" saved for your company.`, 'success');
      onSaved();
    } catch (err) { setError(err.response?.data?.error || 'Could not save the template.'); }
    finally { setSaving(false); }
  };
  return (
    <Modal title={template ? 'Edit template' : 'Save as template'} subtitle="Shared with everyone in your company. Use [Square Brackets] for parts to fill in each time." size="md" onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save template'}</Button></>}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Template name</span>
          <Input autoFocus maxLength={120} placeholder="e.g. Monthly report sent" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Subject</span>
          <Input maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Message</span>
          <Textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
        <FieldError text={error} />
      </div>
    </Modal>
  );
}
