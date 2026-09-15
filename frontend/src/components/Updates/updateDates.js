export function groupUpdatesByDate(rows) {
  const groups = new Map();
  [...rows].sort((a, b) => new Date(b.published_at) - new Date(a.published_at) || b.id - a.id).forEach(row => {
    const date = new Date(row.published_at);
    const label = Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  });
  return [...groups].map(([label, updates]) => ({ label, updates }));
}
