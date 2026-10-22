import React, { useCallback, useEffect, useState } from 'react';
import { communications } from '../../services/api';
import { PageHeader, Tabs } from '../../ui';
import TemplateRail from './TemplateRail';
import EmailComposer from './EmailComposer';
import SentHistory from './SentHistory';
import TemplatesManager from './TemplatesManager';
import TemplateFormModal from './TemplateFormModal';
import { taskTemplate } from './templates';

export default function Communications() {
  const [tab, setTab] = useState('compose');
  const [active, setActive] = useState(null);
  const [taskContext, setTaskContext] = useState(null);
  const [taskDraft, setTaskDraft] = useState(null);
  const [orgTemplates, setOrgTemplates] = useState([]);
  const [saveDraft, setSaveDraft] = useState(null);

  // A task's "send email" button leaves its details here; read them once.
  useEffect(() => {
    const raw = localStorage.getItem('comm_task_context');
    if (!raw) return;
    try {
      const task = JSON.parse(raw);
      const draft = taskTemplate(task);
      setTaskContext(task); setTaskDraft(draft); setActive(draft);
    } catch { /* ignore a broken hand-off */ }
    localStorage.removeItem('comm_task_context');
  }, []);

  const loadTemplates = useCallback(() => { communications.templates().then((r) => setOrgTemplates(r.data)).catch(() => setOrgTemplates([])); }, []);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const use = (template) => { setActive({ ...template, id: `use-${template.id}-${Date.now()}` }); setTab('compose'); };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col">
      <PageHeader title="Client communications" subtitle={taskContext ? `Draft ready for "${taskContext.title}". Add the client's email and send.` : 'Email clients from shared templates. Every email is logged, so the team knows what was sent.'} />
      <Tabs value={tab} onChange={setTab} label="Communications" tabs={[['compose', 'Compose'], ['sent', 'Sent history'], ['templates', 'Templates', <span key="n" className="font-mono text-[10px] text-muted">{orgTemplates.length}</span>]]} />
      {tab === 'compose' && (
        <div className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-line md:flex-row">
          <TemplateRail active={active} onSelect={setActive} orgTemplates={orgTemplates} taskDraft={taskDraft} />
          <EmailComposer template={active} taskContext={taskContext} onSent={() => setTaskContext(null)} onSaveTemplate={setSaveDraft} />
        </div>
      )}
      {tab === 'sent' && <SentHistory onReuse={(mail) => use({ name: 'Previous email', subject: mail.subject, body: mail.body })} />}
      {tab === 'templates' && <TemplatesManager templates={orgTemplates} onChanged={loadTemplates} onUse={use} />}
      {saveDraft && <TemplateFormModal initial={saveDraft} onClose={() => setSaveDraft(null)} onSaved={() => { setSaveDraft(null); loadTemplates(); }} />}
    </div>
  );
}
