import React from 'react';
import { Button } from '../../../ui';
import { ComposerSection } from './fields';

const ReferenceSection = ({ taskForm, updateTaskFormField, handleReferenceImageChange }) => (
  <ComposerSection step={4} title="Reference & Attachments" hint="Add a screenshot or mockup so the assignee understands quickly.">
    <label className="group flex cursor-pointer items-center gap-4 rounded-md border border-dashed border-line bg-subtle px-4 py-4 hover:border-accent/60">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </span>
      <span>
        <span className="block text-sm font-semibold group-hover:text-accent">Upload Image</span>
        <small className="text-xs text-muted">PNG, JPG or WEBP · Max 450KB</small>
      </span>
      <input className="hidden" type="file" accept="image/*" onChange={handleReferenceImageChange} />
    </label>
    {taskForm.reference_image && (
      <div className="flex flex-col gap-2 rounded-md border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Preview</span>
          <Button size="sm" variant="danger" onClick={() => updateTaskFormField('reference_image', '')}>Remove</Button>
        </div>
        <img src={taskForm.reference_image} alt="Task reference preview" className="max-h-[260px] w-full rounded-md border border-line object-cover" />
      </div>
    )}
  </ComposerSection>
);

export default ReferenceSection;
