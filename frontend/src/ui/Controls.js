import React from 'react';

// Underlined tab row. `tabs` is [[key, label, badge?], ...].
export function Tabs({ tabs, value, onChange, label, aside }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto">
        {tabs.map(([key, text, badge]) => (
          <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${value === key ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}>
            {text}{badge}
          </button>
        ))}
      </div>
      {aside && <div className="flex flex-wrap gap-2 pb-1.5">{aside}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line'}`}>
      <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
    </button>
  );
}

// Compact button group for switching views. `options` is [[value, label], ...].
export function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div role="group" aria-label={label} className={`inline-flex rounded-md border border-line bg-subtle p-0.5 ${className}`}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
          className={`rounded px-3 py-1 text-xs font-semibold capitalize ${value === key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

// Thin horizontal meter. `tone` is one of accent, info, warn, danger.
export function Meter({ value, max = 100, tone = 'accent', label }) {
  const tones = { accent: 'bg-accent', info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger' };
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-subtle" role="meter" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

// Small pill used to mark new menu items or features.
export function NewTag() {
  return <span className="rounded border border-current px-1 text-[10px] font-bold uppercase tracking-wide text-accent">New</span>;
}
