import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timesheet } from '../../services/api';
import { Button } from '../../ui';

// "Log timesheet" on a task: opens the Timesheet with this task already picked.
// Shown only when the organization has the Timesheet module.
export default function TimesheetLink({ taskId }) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => timesheet.status()).then((r) => { if (active) setEnabled(Boolean(r.data?.enabled)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!enabled) return null;
  return <Button size="sm" variant="primary" onClick={() => navigate(`/timesheet?task=${taskId}`)}>Log timesheet</Button>;
}
