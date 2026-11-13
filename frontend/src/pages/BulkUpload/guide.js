// What to write in each column, in plain words. Shown on the page (step 2) and inside the template's
// "How to fill" tab, so the person filling the sheet never has to guess.
const listOf = (options) => (options.length > 8 ? `${options.slice(0, 8).join(', ')}… (all of them are in the “Lists” tab)` : options.join(', '));

function help(field, kind, ctx) {
  const options = field.options || [];
  switch (field.type) {
    case 'team': return 'The team the task is for, exactly as it is named in GreenTask. Leave it empty to use the team you choose on the upload page.';
    case 'client': return kind === 'entries' || ctx.pickOnly
      ? 'The client’s name, as it is in your client list. Ltd or Limited does not matter.'
      : 'The client’s name. A name that is not in your list yet is added to it.';
    case 'agent': return 'The agent (accounting firm) the client comes through. Leave it empty when the client already sits under an agent.';
    case 'person': return kind === 'entries'
      ? 'The full name of the person who did the work. Leave it empty for yourself.'
      : 'The full name of the person who will do the task, as in GreenTask. They must be in the team. Leave it empty for no one yet.';
    case 'priority': return 'High, Medium or Low. Empty means Medium.';
    case 'issue_type': return 'Task, Bug, Story, Feature or Improvement. Empty means Task.';
    case 'date': return field.key === 'date_worked' ? 'The day the work was done, like 31/12/2026. It cannot be a future date.' : 'A date like 31/12/2026.';
    case 'hours': return 'The time spent, as a number: 2.5 means two and a half hours. At most 24.';
    case 'dropdown': return options.length ? `One of: ${listOf(options)}.` : 'One of the options in your form.';
    case 'checkbox': return 'Yes or No.';
    case 'number': return 'A number.';
    case 'long_text': return 'Any details. Can be left empty.';
    default: return field.key === 'title' ? 'What needs to be done, in a few words.' : field.key === 'count_number' ? 'A whole number.' : 'Text.';
  }
}

// fields: the columns of this kind. Returns [{ label, required, help }].
export function columnGuide(kind, fields, ctx) {
  if (kind === 'clients') {
    return [
      { label: 'Client Name', required: true, help: 'One client on each line.' },
      { label: 'Agent', required: false, help: 'The agent (accounting firm) the client comes through. You can also leave this column out and keep one tab per agent, named after the agent.' },
    ];
  }
  return fields.map((field) => ({
    label: field.label, help: field.help ? `${help(field, kind, ctx)} ${field.help}` : help(field, kind, ctx),
    required: field.type === 'client' && kind === 'entries' ? true : Boolean(field.required) && !['team', 'priority', 'issue_type'].includes(field.type),
  }));
}

export const KINDS = {
  tasks: {
    title: 'Tasks', one: 'task', many: 'tasks', limit: 200,
    text: 'Create many tasks in one go, each with its team, assignee, due date and client.',
    line: 'Each line in the sheet becomes one task.',
  },
  clients: {
    title: 'Clients', one: 'client', many: 'clients', limit: null,
    text: 'Add your client list, each client under its agent. Clients already in your list are left as they are.',
    line: 'Each line in the sheet is one client.',
  },
  entries: {
    title: 'Timesheet entries', one: 'entry', many: 'entries', limit: 200,
    text: 'Log many timesheet entries at once: client, date, hours and the rest of your timesheet form.',
    line: 'Each line in the sheet becomes one timesheet entry.',
  },
};
