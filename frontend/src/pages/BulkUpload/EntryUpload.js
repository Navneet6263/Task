import React, { useCallback, useMemo, useState } from 'react';
import { timesheet } from '../../services/api';
import { Segmented } from '../../ui';
import { buildRows, uploadFields } from './entrySheet';
import RowUpload from './RowUpload';

const MUST = ['client_id'];
const NOUNS = { one: 'entry', many: 'entries' };

// Timesheet entries from a sheet. Members always upload under their own name.
export default function EntryUpload({ workbook, config, ...rest }) {
  const [mode, setMode] = useState('submit');
  const canPickPerson = Boolean(config.permissions?.log_for_others);
  // Done by and Agent can be left out: an empty Done by is the person uploading, and the client brings its agent.
  const fields = useMemo(() => uploadFields(config.form).filter((f) => f.key !== 'agent_id' || canPickPerson)
    .map((f) => ({ ...f, required: mode === 'submit' && Boolean(f.required) && !['agent_id', 'agent_firm_id'].includes(f.key) })), [config.form, canPickPerson, mode]);
  const build = useCallback((rows, mapping, firstLine) => buildRows(rows, mapping, { layout: config.form, config, mode, firstLine }), [config, mode]);
  const send = useCallback(async (bodies) => (await timesheet.bulk(bodies, mode)).data.results, [mode]);
  return (
    <RowUpload {...rest} workbook={workbook} fields={fields} build={build} send={send} nouns={NOUNS} mustHave={MUST}
      saved={mode === 'draft' ? 'saved as drafts' : 'submitted'} note={canPickPerson ? '' : 'Every entry goes under your own name.'}
      controls={(
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Save as" value={mode} onChange={setMode} options={[['submit', 'Submit them'], ['draft', 'Save as drafts']]} />
          <span className="text-xs text-muted">{mode === 'draft' ? 'Drafts are not in reports until each one is submitted.' : 'Submitted entries count in reports straight away.'}</span>
        </div>
      )} />
  );
}
