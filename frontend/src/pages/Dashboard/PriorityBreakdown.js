import React from 'react';
import { Card, CardHeader, Meter } from '../../ui';

const ITEMS = [
  { key: 'HIGH', label: 'High', tone: 'danger' },
  { key: 'MEDIUM', label: 'Medium', tone: 'warn' },
  { key: 'LOW', label: 'Low', tone: 'accent' },
];

const PriorityBreakdown = ({ priorityStats, stats }) => (
  <Card>
    <CardHeader title="Priority split" aside={`${stats.total || 0} tasks`} />
    <div className="flex flex-col gap-3 p-4">
      {ITEMS.map((item) => {
        const count = priorityStats[item.key] || 0;
        const ratio = stats.total ? Math.round((count / stats.total) * 100) : 0;
        return (
          <div key={item.key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="font-mono text-xs text-muted"><b className="text-ink">{ratio}%</b> ({count})</span>
            </div>
            <Meter value={ratio} tone={item.tone} label={`${item.label} priority share`} />
          </div>
        );
      })}
    </div>
  </Card>
);

export default PriorityBreakdown;
