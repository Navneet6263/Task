import React from 'react';

// The bar that moves forward while a sheet goes in.
export default function Progress({ done, total, label }) {
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{label}… {done} of {total}</span><span className="font-semibold tabular-nums text-accent">{percent}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
