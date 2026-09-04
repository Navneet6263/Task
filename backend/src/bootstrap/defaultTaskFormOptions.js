const DEFAULT_TASK_FORM_OPTIONS = {
  task_type: [
    { label: 'Feature', parent_value: '' },
    { label: 'Improvement', parent_value: '' },
    { label: 'Testing', parent_value: '' },
    { label: 'Research', parent_value: '' },
  ],
  product: [
    { label: 'Dashboard', parent_value: '' },
    { label: 'UI/UX', parent_value: '' },
    { label: 'Backend API', parent_value: '' },
    { label: 'Mobile App', parent_value: '' },
    { label: 'Authentication', parent_value: '' },
    { label: 'Reports', parent_value: '' },
  ],
  category: [
    { label: 'New Feature', parent_value: 'Feature' },
    { label: 'Workflow', parent_value: 'Feature' },
    { label: 'Optimization', parent_value: 'Improvement' },
    { label: 'Refactor', parent_value: 'Improvement' },
    { label: 'Regression', parent_value: 'Testing' },
    { label: 'UAT', parent_value: 'Testing' },
    { label: 'Discovery', parent_value: 'Research' },
    { label: 'Documentation', parent_value: 'Research' },
  ],
};

module.exports = { DEFAULT_TASK_FORM_OPTIONS };
