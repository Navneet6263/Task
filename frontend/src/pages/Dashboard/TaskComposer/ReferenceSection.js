import React from 'react';

const ReferenceSection = ({ taskForm, updateTaskFormField, handleReferenceImageChange }) => (
  <section className="rounded-2xl border border-[#dbe7ff] bg-white shadow-[0_8px_24px_rgba(148,163,184,0.10)] px-5 py-5 flex flex-col gap-4">
    <div>
      <h4 className="text-[15px] font-bold text-gray-900 tracking-tight">Reference & Attachments</h4>
      <p className="mt-0.5 text-xs text-gray-500">Add a screenshot or mockup so the assignee understands quickly.</p>
    </div>

    <label className="rounded-xl border-2 border-dashed border-blue-200 bg-gradient-to-b from-blue-50/60 to-indigo-50/40
      px-4 py-5 flex items-center gap-4 cursor-pointer hover:border-[#2f5dff] hover:from-blue-50 transition-all group">
      <div className="w-11 h-11 rounded-xl bg-white border border-blue-100 shadow-sm flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2f5dff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div>
        <span className="text-sm font-bold text-gray-800 block group-hover:text-[#2f5dff] transition-colors">Upload Image</span>
        <small className="text-xs text-gray-500">PNG, JPG or WEBP · Max 450KB</small>
      </div>
      <input className="hidden" type="file" accept="image/*" onChange={handleReferenceImageChange} />
    </label>

    {taskForm.reference_image && (
      <div className="rounded-xl border-2 border-blue-100 bg-white p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600">Preview</span>
          <button type="button" onClick={() => updateTaskFormField('reference_image', '')}
            className="text-xs font-bold text-red-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-all">
            Remove
          </button>
        </div>
        <img src={taskForm.reference_image} alt="Task reference preview"
          className="w-full rounded-xl border border-blue-100 object-cover max-h-[260px]" />
      </div>
    )}
  </section>
);

export default ReferenceSection;
