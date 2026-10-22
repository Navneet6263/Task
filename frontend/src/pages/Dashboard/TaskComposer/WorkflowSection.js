import React from 'react';
import { Input, Textarea } from '../../../ui';
import { ComposerSection } from './fields';

const PLACEHOLDERS = {
  bug: 'e.g. Fix login button on mobile',
  feature: 'e.g. Add dark mode support',
  enhancement: 'e.g. Improve dashboard loading speed',
  story: 'e.g. Let users filter tasks by client',
  task: 'Write a clear, result-focused title',
};

const DESCRIPTION_HINTS = {
  bug: 'Include what happened, what you expected, and how to reproduce it.',
  story: 'Explain the user, their goal, and why the outcome matters.',
  task: 'Explain the expected output, dependencies, and delivery details.',
};

const WorkflowSection = ({ taskForm, updateTaskFormField }) => (
  <ComposerSection step={1} title="What needs to be done?" aside={<span className="hidden text-xs text-muted sm:block">Keep it clear and actionable</span>}>
    <div className="flex flex-col gap-1">
      <label htmlFor="composer-title" className="text-xs font-medium text-muted">Task title <span className="text-danger">*</span></label>
      <Input id="composer-title" autoFocus maxLength={255} required placeholder={PLACEHOLDERS[taskForm.issue_type] || PLACEHOLDERS.task}
        value={taskForm.title} onChange={(event) => updateTaskFormField('title', event.target.value)} />
      <small className="text-right font-mono text-[10px] text-muted">{taskForm.title.length}/255</small>
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor="composer-description" className="text-xs font-medium text-muted">Description</label>
      <Textarea id="composer-description" className="min-h-[100px] leading-relaxed" placeholder={DESCRIPTION_HINTS[taskForm.issue_type] || DESCRIPTION_HINTS.task}
        value={taskForm.description} onChange={(event) => updateTaskFormField('description', event.target.value)} />
    </div>
  </ComposerSection>
);

export default WorkflowSection;
