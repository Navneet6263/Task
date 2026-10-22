import React from 'react';
import { Card, CardHeader } from '../../ui';

const DOTS = { info: 'bg-info', warning: 'bg-warn', danger: 'bg-danger', success: 'bg-accent' };

const Reminders = ({ reminders }) => (
  <Card>
    <CardHeader title="Reminders" />
    <div className="flex flex-col gap-1 p-3">
      {reminders.map((item) => (
        <div key={item.title} className="flex items-start gap-3 rounded-md px-2 py-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOTS[item.tone] || DOTS.info}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-muted">{item.note}</p>
          </div>
        </div>
      ))}
      {!reminders.length && <p className="px-2 py-4 text-center text-sm text-muted">Nothing needs attention right now.</p>}
    </div>
  </Card>
);

export default Reminders;
