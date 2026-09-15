export const actorKey = (actor) => {
  if (actor.user_id) return `u-${actor.user_id}`;
  if (actor.user_name) return `n-${String(actor.user_name).toLowerCase()}`;
  return `a-${String(actor.automated_by || 'system').toLowerCase()}`;
};

export const buildActorOptions = (actors = []) => {
  const options = new Map();
  for (const actor of actors) {
    const key = actorKey(actor);
    if (!options.has(key)) {
      options.set(key, { key, name: actor.user_name || 'System', sources: new Set() });
    }
    options.get(key).sources.add(actor.automated_by || 'Automation');
  }
  return [...options.values()].map(({ sources, ...option }) => ({
    ...option,
    subtitle: [...sources].join(' · '),
  }));
};
