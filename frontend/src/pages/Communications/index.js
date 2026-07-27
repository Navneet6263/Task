import React, { useState, useEffect } from 'react';
import TemplateSelector from './TemplateSelector';
import EmailComposer from './EmailComposer';

/** Build email template based on task type and data */
const buildTaskTemplate = (task) => {
  const client = task.client_name || '[Client Name]';
  const title  = task.title || '[Task Title]';
  const desc   = task.description ? `\n\nDetails:\n${task.description}` : '';
  const assignee = task.assigned_to_name || '[Team Member]';

  const templates = {
    bug: {
      id: 'task_bug',
      name: `🐛 Bug Update`,
      subject: `Bug Report Update: ${title}`,
      body:
`Hi ${client},

We wanted to update you regarding the bug you reported — "${title}".${desc}

Current Status: ${task.status || 'In Progress'}
Priority: ${task.priority || 'MEDIUM'}

Our team is actively working on this. We will notify you as soon as it is resolved.

Best regards,
${assignee}`,
    },
    feature: {
      id: 'task_feature',
      name: `✨ Feature Update`,
      subject: `Feature Request Update: ${title}`,
      body:
`Hi ${client},

We are reaching out with an update on the feature request — "${title}".${desc}

Current Status: ${task.status || 'In Progress'}
Priority: ${task.priority || 'MEDIUM'}

We appreciate your patience and will keep you informed on progress.

Best regards,
${assignee}`,
    },
    enhancement: {
      id: 'task_enhancement',
      name: `🚀 Enhancement Update`,
      subject: `Enhancement Update: ${title}`,
      body:
`Hi ${client},

Here is an update on the enhancement — "${title}".${desc}

Current Status: ${task.status || 'In Progress'}

We will notify you once the improvement is live.

Best regards,
${assignee}`,
    },
    story: {
      id: 'task_story',
      name: `📖 Story Update`,
      subject: `User Story Update: ${title}`,
      body:
`Hi ${client},

We are updating you on the user story — "${title}".${desc}

Current Status: ${task.status || 'In Progress'}

Please let us know if you have any feedback or questions.

Best regards,
${assignee}`,
    },
    task: {
      id: 'task_general',
      name: `📌 Task Update`,
      subject: `Task Update: ${title}`,
      body:
`Hi ${client},

We wanted to give you a quick update on the task — "${title}".${desc}

Current Status: ${task.status || 'In Progress'}
Priority: ${task.priority || 'MEDIUM'}

Feel free to reach out if you need any clarification.

Best regards,
${assignee}`,
    },
  };

  return templates[task.issue_type] || templates.task;
};

const Communications = () => {
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [taskContext, setTaskContext] = useState(null);

  useEffect(() => {
    // Check if we were redirected from a task mail button
    const raw = localStorage.getItem('comm_task_context');
    if (raw) {
      try {
        const task = JSON.parse(raw);
        const tpl = buildTaskTemplate(task);
        setTaskContext(task);
        setActiveTemplate(tpl);
      } catch (_) {}
      localStorage.removeItem('comm_task_context'); // consume once
    }
  }, []);

  return (
    <div className="min-h-full flex flex-col p-6 max-w-[1600px] mx-auto gap-5">
      <header className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Client Communications</h1>
            <p className="text-sm font-medium text-slate-500 mt-0.5">
              {taskContext
                ? `📋 Draft ready: "${taskContext.title}"`
                : 'Compose and send emails to clients with ready-made templates.'}
            </p>
          </div>
        </div>
        {taskContext && (
          <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold px-4 py-2 rounded-xl shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            Task Template Auto-Applied
          </span>
        )}
      </header>

      <section className="flex-1 bg-white rounded-[28px] border border-slate-200/60 shadow-xl shadow-slate-200/40 flex overflow-hidden min-h-[600px]">
        <TemplateSelector activeTemplate={activeTemplate} onSelect={setActiveTemplate} />
        <EmailComposer template={activeTemplate} taskContext={taskContext} />
      </section>
    </div>
  );
};

export default Communications;

