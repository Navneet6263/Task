import React from 'react';

const VARIANTS = {
  primary: 'border-accent bg-accent text-accent-fg hover:brightness-110',
  secondary: 'border-line bg-surface text-ink hover:border-muted',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-subtle hover:text-ink',
  danger: 'border-transparent bg-transparent text-danger hover:bg-danger-soft',
};
const SIZES = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-sm',
  icon: 'h-9 w-9 p-0',
};

export const buttonClass = (variant = 'secondary', size = 'md', extra = '') =>
  `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

export default function Button({ variant, size, className = '', type = 'button', ...props }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function CountBadge({ count, max = 99, tone = 'danger' }) {
  if (!count) return null;
  const tones = { danger: 'bg-danger text-white', accent: 'bg-accent text-accent-fg' };
  return <span className={`min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] ${tones[tone]}`}>{count > max ? `${max}+` : count}</span>;
}
