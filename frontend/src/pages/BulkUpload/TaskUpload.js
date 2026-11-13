import React, { useCallback, useMemo, useState } from 'react';
import { tasks } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { Select } from '../../ui';
import { buildTaskRows, taskFields } from './taskSheet';
import RowUpload from './RowUpload';

const NOUNS = { one: 'task', many: 'tasks' };

// Tasks from a sheet. With more than one team the page asks where the tasks go,
// unless the sheet has a Team column that says it line by line.
export default function TaskUpload({ workbook, ctx, ...rest }) {
  const fields = useMemo(() => taskFields(ctx), [ctx]);
  const many = ctx.teams.length > 1;
  const [teamId, setTeamId] = useState(() => {
    const last = String(readPreference('bulk-upload-team', '') || '');
    return ctx.teams.some((t) => String(t.id) === last) ? last : '';
  });
  const build = useCallback((rows, mapping, firstLine) => buildTaskRows(rows, mapping, { fields, ctx, teamId, firstLine }), [fields, ctx, teamId]);
  const send = useCallback(async (bodies) => (await tasks.bulk(bodies)).data.results, []);
  const choose = (value) => { setTeamId(value); writePreference('bulk-upload-team', value); };
  return (
    <RowUpload {...rest} workbook={workbook} fields={fields} build={build} send={send} nouns={NOUNS} saved="created"
      controls={many && (
        <label className={`flex flex-col gap-1.5 rounded-lg border bg-surface p-3.5 ${teamId ? 'border-line' : 'border-warn'}`}>
          <span className={`text-sm font-semibold ${teamId ? '' : 'text-warn'}`}>Which team are these tasks for?</span>
          <Select aria-label="Team for these tasks" value={teamId} onChange={(e) => choose(e.target.value)}>
            <option value="">Choose a team…</option>
            {ctx.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <span className="text-xs text-muted">Used for every line that has no team written in a Team column.</span>
        </label>
      )} />
  );
}
