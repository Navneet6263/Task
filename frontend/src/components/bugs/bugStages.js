// Bug tracking module: the names people see for each stage and team role.
export const STAGE_NAMES = { new: 'New', ready: 'Ready to pick', fixing: 'Fixing', qa: 'Ready for QA', done: 'Done' };
export const STAGE_TONES = { new: 'neutral', ready: 'warn', fixing: 'info', qa: 'warn', done: 'ok' };
export const ROLE_NAMES = { developer: 'Developer', qa: 'QA', both: 'Developer and QA' };

// Same rule as the server for bugs made before the module was turned on.
export const stageOf = (task) => {
  if (STAGE_NAMES[task?.bug_stage]) return task.bug_stage;
  if (task?.status === 'DONE') return 'done';
  return task?.assigned_to ? 'fixing' : 'ready';
};
