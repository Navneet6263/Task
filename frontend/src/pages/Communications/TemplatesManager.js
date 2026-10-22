import React, { useState } from 'react';
import { communications } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, EmptyState } from '../../ui';
import TemplateFormModal from './TemplateFormModal';

// The company's shared templates: create, edit, delete and use.
export default function TemplatesManager({ templates, onChanged, onUse }) {
  const [form, setForm] = useState(null); // 'new' or a template
  const remove = async (template) => {
    if (!window.confirm(`Delete the template "${template.name}" for everyone?`)) return;
    try { await communications.deleteTemplate(template.id); notify('Template deleted.', 'success'); onChanged(); }
    catch (err) { notify(err.response?.data?.error || 'Could not delete the template.'); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Shared with everyone in your company. The author and managers can edit them.</p>
        <Button variant="primary" onClick={() => setForm('new')}>+ New template</Button>
      </div>
      {!templates.length && <EmptyState title="No company templates yet" action={<Button onClick={() => setForm('new')}>Create the first one</Button>}>Save the emails your team sends often, like monthly reports or payment reminders.</EmptyState>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} className="flex flex-col p-4">
            <p className="font-semibold">{t.name}</p>
            <p className="truncate text-sm text-muted">{t.subject}</p>
            <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-wrap text-xs text-muted">{t.body}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="truncate text-[11px] text-muted">by {t.created_by_name || '—'}</span>
              <span className="flex gap-1">
                {t.can_edit && <><Button size="sm" variant="ghost" onClick={() => setForm(t)}>Edit</Button><Button size="sm" variant="danger" onClick={() => remove(t)}>Delete</Button></>}
                <Button size="sm" onClick={() => onUse(t)}>Use</Button>
              </span>
            </div>
          </Card>
        ))}
      </div>
      {form && <TemplateFormModal template={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); onChanged(); }} />}
    </div>
  );
}
