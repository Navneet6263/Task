import React from 'react';

const ISSUE_TYPES = [
  {
    type: 'task',
    label: 'Task',
    desc: 'General work items',
    color: 'blue',
    activeClasses: 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-blue-100',
    dotColor: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    type: 'bug',
    label: 'Bug',
    desc: 'Issues & defects',
    color: 'red',
    activeClasses: 'border-red-500 bg-gradient-to-br from-red-50 to-orange-50 shadow-red-100',
    dotColor: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/><path d="M9 7.13v-1a3.003 3.003 0 116 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>
      </svg>
    ),
  },
  {
    type: 'story',
    label: 'Story',
    desc: 'User stories & content',
    color: 'purple',
    activeClasses: 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-purple-100',
    dotColor: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
      </svg>
    ),
  },
  {
    type: 'feature',
    label: 'Feature',
    desc: 'New feature request',
    color: 'green',
    activeClasses: 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-emerald-100',
    dotColor: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
  {
    type: 'enhancement',
    label: 'Enhancement',
    desc: 'Improve existing work',
    color: 'amber',
    activeClasses: 'border-amber-500 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-amber-100',
    dotColor: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
  },
];

const WorkflowSection = ({ taskForm, updateTaskFormField }) => {
  const current = ISSUE_TYPES.find((t) => t.type === taskForm.issue_type) || ISSUE_TYPES[0];

  return (
    <section className="rounded-2xl border border-[#dbe7ff] bg-white shadow-[0_8px_24px_rgba(148,163,184,0.10)] px-5 py-5 flex flex-col gap-4">
      {/* Header */}
      <div>
        <h4 className="text-[15px] font-bold text-gray-900 tracking-tight">Issue Type</h4>
        <p className="mt-0.5 text-xs text-gray-500">Select what kind of work this is — fields will adapt below.</p>
      </div>

      {/* Issue type selector — 5 cards */}
      <div className="grid grid-cols-5 gap-2">
        {ISSUE_TYPES.map(({ type, label, desc, activeClasses, dotColor, badge, icon }) => {
          const isActive = taskForm.issue_type === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => updateTaskFormField('issue_type', type)}
              className={`
                relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center cursor-pointer
                transition-all duration-200 focus:outline-none
                ${isActive
                  ? `${activeClasses} shadow-md scale-[1.03]`
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}
              `}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${dotColor}`} />
              )}
              {/* Icon */}
              <span className={`${isActive ? badge.split(' ')[1] : 'text-gray-400'} transition-colors`}>
                {icon}
              </span>
              {/* Label */}
              <span className={`text-[11px] font-bold leading-tight ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active type badge */}
      <div className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-bold ${current.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor}`} />
        {current.desc}
      </div>

      {/* Divider */}
      <hr className="border-gray-100" />

      {/* Title */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-gray-700">
          Task Title <span className="text-red-400">*</span>
        </span>
        <input
          className="h-[42px] rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm px-3.5
            placeholder-gray-400 focus:border-[#2f5dff] focus:ring-3 focus:ring-blue-50
            transition-all duration-150 outline-none"
          placeholder={
            taskForm.issue_type === 'bug' ? 'e.g. Login button not working on mobile'
            : taskForm.issue_type === 'feature' ? 'e.g. Add dark mode support'
            : taskForm.issue_type === 'enhancement' ? 'e.g. Speed up search results'
            : taskForm.issue_type === 'story' ? 'e.g. As a user I want to filter tasks'
            : 'Write a clear and descriptive title'
          }
          value={taskForm.title}
          onChange={(e) => updateTaskFormField('title', e.target.value)}
          required
        />
      </label>

      {/* Description */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-gray-700">Description</span>
        <textarea
          className="min-h-[96px] resize-y rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm px-3.5 py-3
            placeholder-gray-400 focus:border-[#2f5dff] focus:ring-3 focus:ring-blue-50
            transition-all duration-150 outline-none leading-relaxed"
          placeholder={
            taskForm.issue_type === 'bug'
              ? 'Steps to reproduce:\n1. Go to...\n2. Click on...\n\nExpected: ...\nActual: ...'
              : taskForm.issue_type === 'story'
              ? 'As a [user role], I want [goal], so that [reason]...'
              : 'Explain expected output, dependencies, and delivery details...'
          }
          value={taskForm.description}
          onChange={(e) => updateTaskFormField('description', e.target.value)}
        />
      </label>
    </section>
  );
};

export default WorkflowSection;
