// Built-in starting points. Square-bracket words are placeholders filled in before sending.
export const BUILT_IN = [
  { id: 'blank', name: 'Blank email', desc: 'Start from scratch', subject: '', body: '' },
  { id: 'resolved', name: 'Issue resolved', desc: 'Tell a client their issue is fixed', subject: 'Update: your issue has been resolved',
    body: 'Hi [Client Name],\n\nGood news: the issue you reported has been resolved.\n\nPlease let us know if you need anything else.\n\nBest regards,\n[Your Name]' },
  { id: 'update', name: 'Project update', desc: 'Share progress', subject: 'Project status update',
    body: 'Hi [Client Name],\n\nHere is a quick update on the project:\n\n- [Point 1]\n- [Point 2]\n\nHappy to jump on a call if useful.\n\nBest regards,\n[Your Name]' },
  { id: 'invoice', name: 'Invoice', desc: 'Send billing details', subject: 'Invoice for recent services',
    body: 'Hi [Client Name],\n\nPlease find the invoice for our recent services attached.\n\nReach out if you have any questions.\n\nBest regards,\n[Your Name]' },
  { id: 'followup', name: 'Follow up', desc: 'A friendly nudge', subject: 'Following up on our discussion',
    body: 'Hi [Client Name],\n\nI wanted to follow up on our conversation about [Topic].\n\nDo you have any updates or questions?\n\nBest regards,\n[Your Name]' },
  { id: 'delay', name: 'Delay notice', desc: 'Explain a timeline change', subject: 'Update on the project timeline',
    body: 'Hi [Client Name],\n\nThere will be a short delay in delivering [Task or feature].\n\nWe are sorry for the inconvenience and are working to keep the impact small.\n\nNew expected delivery: [Date]\n\nBest regards,\n[Your Name]' },
];

const TASK_INTRO = {
  bug: ['Bug report update', 'regarding the bug you reported'],
  feature: ['Feature request update', 'on the feature request'],
  enhancement: ['Enhancement update', 'on the enhancement'],
  story: ['User story update', 'on the user story'],
  task: ['Task update', 'on the task'],
};

// Template pre-filled from a task opened with the "send email" button.
export function taskTemplate(task) {
  const [label, phrase] = TASK_INTRO[task.issue_type] || TASK_INTRO.task;
  const details = task.description ? `\n\nDetails:\n${task.description}` : '';
  return {
    id: `task-${task.id}`, name: label, desc: 'From the task you opened',
    subject: `${label}: ${task.title}`,
    body: `Hi ${task.client_name || '[Client Name]'},\n\nA quick update ${phrase} "${task.title}".${details}\n\nCurrent status: ${String(task.status || 'IN_PROGRESS').replaceAll('_', ' ').toLowerCase()}\nPriority: ${String(task.priority || 'MEDIUM').toLowerCase()}\n\nWe will keep you posted.\n\nBest regards,\n${task.assigned_to_name || '[Your Name]'}`,
  };
}

export const placeholdersIn = (...texts) => [...new Set(texts.join('\n').match(/\[[^\]\n]{1,40}\]/g) || [])];

export function fillPlaceholders(text, values) {
  return Object.entries(values).reduce((out, [key, value]) => (value ? out.split(key).join(value) : out), text);
}
