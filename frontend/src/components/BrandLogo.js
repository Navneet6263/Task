import React from 'react';

// The GreenTask logo (public/brand). Light pages show the navy "Task"; dark mode swaps in the copy with a
// light-blue "Task" so it stays readable. `inverse` is for surfaces that are always dark.
const BRAND = `${process.env.PUBLIC_URL || ''}/brand/`;
const LIGHT = `${BRAND}greentask-logo.png?v=3`;
const DARK = `${BRAND}greentask-logo-dark.png?v=3`;

export default function BrandLogo({ compact = false, inverse = false, iconOnly = false, large = false, subtitle }) {
  if (iconOnly) {
    return <img src={`${BRAND}favicon-48.png?v=3`} alt="GreenTask" className="greentask-brand h-8 w-8 rounded-md" />;
  }
  const height = large ? 'h-16' : compact ? 'h-8' : 'h-9';
  return (
    <div className={`greentask-brand inline-flex min-w-0 flex-col items-start leading-none${compact ? ' greentask-brand--compact' : ''}${inverse ? ' greentask-brand--inverse' : ''}`}>
      {inverse
        ? <img src={DARK} alt="GreenTask" className={`${height} w-auto`} />
        : <>
          <img src={LIGHT} alt="GreenTask" className={`${height} w-auto dark:hidden`} />
          <img src={DARK} alt="GreenTask" className={`hidden ${height} w-auto dark:block`} />
        </>}
      {subtitle && (
        <small className={`greentask-brand__subtitle mt-1 text-[11px] font-medium ${inverse ? 'text-white/70' : 'text-muted'}`}>{subtitle}</small>
      )}
    </div>
  );
}
