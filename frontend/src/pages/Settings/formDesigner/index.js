import React, { useEffect, useState } from 'react';
import { timesheet } from '../../../services/api';
import { Tabs } from '../../../ui';
import Section from '../Section';
import TaskFormDesigner from './TaskFormDesigner';
import TimesheetFormDesigner from './TimesheetFormDesigner';

// Settings → Form designer: one place to shape both forms, like building a Google Form.
// The Timesheet tab appears only for organizations with the Timesheet module.
export default function FormDesignerSection() {
  const [tab, setTab] = useState('task');
  const [timesheetOn, setTimesheetOn] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => timesheet.status()).then((r) => { if (active) setTimesheetOn(Boolean(r.data?.enabled)); }).catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <Section title="Form designer" description="Choose exactly what people fill in — rename fields, make them required or optional, hide them, reorder them and add your own questions.">
      {timesheetOn && (
        <Tabs label="Which form" value={tab} onChange={setTab} tabs={[['task', 'Create task form'], ['timesheet', 'Timesheet form']]} />
      )}
      {tab === 'timesheet' && timesheetOn ? <TimesheetFormDesigner /> : <TaskFormDesigner />}
    </Section>
  );
}
