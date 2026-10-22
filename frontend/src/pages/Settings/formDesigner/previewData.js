// Sample answers used for previews in the designer.
const SAMPLE = { text: 'Sample answer', number: '12', date: new Date().toISOString().slice(0, 10), client: 'Riverside Motors', priority: 'Medium' };

export function sampleValue(field) {
  if (field.type === 'dropdown') return field.options?.[0] || '';
  if (field.type === 'person') return 'Asha';
  return SAMPLE[field.type] ?? SAMPLE.text;
}

export function buildTitlePreview(pattern, layout) {
  const values = Object.fromEntries(layout.fields.map((f) => [f.key, sampleValue(f)]));
  return String(pattern || '')
    .replace(/\{([a-z][a-z0-9_]*)\}/g, (_, key) => values[key] ?? '')
    .replace(/(\s*·\s*){2,}/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
}

export const blankPreviewForm = () => ({
  title: '', description: '', priority: 'MEDIUM', assigned_to: '', assigned_date: '', start_date: '', due_date: '',
  issue_type: 'task', task_type: '', product: '', category: '', reference_image: '', client_name: '', custom_fields: {}, hours: '',
});
