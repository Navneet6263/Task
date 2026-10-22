import React from 'react';
import { Input, Select, Textarea } from '../../../ui';

// Small wrappers shared by the composer sections so every field looks the same.
export const Fld = ({ label, req, children }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium text-muted">{label}{req && <span className="text-danger"> *</span>}</span>
    {children}
  </label>
);

export const Sel = ({ opts = [], placeholder, ...props }) => (
  <Select {...props}>
    {placeholder && <option value="">{placeholder}</option>}
    {opts.map((option) => <option key={option.v} value={option.v}>{option.l}</option>)}
  </Select>
);

export const Inp = (props) => <Input {...props} />;
export const Txt = (props) => <Textarea className="min-h-[88px] leading-relaxed" {...props} />;

// One numbered step of the composer form; the number reflects the real fill-in order.
export function ComposerSection({ step, title, hint, aside, children, className = '' }) {
  return (
    <section className={`flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5 ${className}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Step {step}</p>
          <h4 className="mt-0.5 text-[15px] font-semibold">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
