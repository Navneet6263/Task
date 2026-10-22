import React from 'react';

// Text-only wordmark. Colors follow the theme tokens, so it works in light and dark mode;
// `inverse` is for permanently dark surfaces.
export default function BrandLogo({ compact = false, inverse = false, iconOnly = false, large = false, subtitle }) {
  const size = large ? 'text-[32px]' : compact || iconOnly ? 'text-[22px]' : 'text-[27px]';
  return (
    <div className={`greentask-brand inline-flex min-w-0 flex-col leading-none${compact ? ' greentask-brand--compact' : ''}${inverse ? ' greentask-brand--inverse' : ''}`}
      {...(iconOnly ? { role: 'img', 'aria-label': 'GreenTask' } : {})}>
      <strong className={`greentask-brand__name whitespace-nowrap font-extrabold tracking-[-0.04em] ${size} ${inverse ? 'text-white' : 'text-ink'}`}>
        Green<b className={`font-extrabold ${inverse ? 'text-[#7fd8b0]' : 'text-accent'}`}>Task</b>
      </strong>
      {subtitle && !iconOnly && (
        <small className={`greentask-brand__subtitle mt-1 text-[11px] font-medium ${inverse ? 'text-white/70' : 'text-muted'}`}>{subtitle}</small>
      )}
    </div>
  );
}
