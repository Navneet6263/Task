import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../ui';
import LockSettingsCard from './LockSettingsCard';

const LINKS = [
  ['/settings#form-designer', 'Timesheet form', 'Rename fields, make them required or optional, hide them, reorder them, edit dropdown options and add your own questions. Open Form designer → Timesheet form.'],
  ['/settings#clients', 'Clients', 'One client list for tasks and the timesheet. Add, rename or turn clients off in Settings → Clients.'],
];

// Admin setup: the edit lock lives here; the form itself and the client list live in Settings.
export default function SetupTab({ config, onChanged }) {
  return (
    <div className="flex flex-col gap-4">
      <LockSettingsCard settings={config.settings} onSaved={onChanged} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {LINKS.map(([to, title, text]) => (
          <Card key={to} className="p-4">
            <h3 className="text-[15px] font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{text}</p>
            <Link to={to} className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Open {title} →</Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
