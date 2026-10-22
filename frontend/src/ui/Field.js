import React from 'react';

export const inputClass = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 disabled:bg-subtle disabled:text-muted';

export const Input = React.forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`${inputClass} ${className}`} {...props} />;
});

export function Select({ className = '', children, ...props }) {
  return <select className={`${inputClass} ${className}`} {...props}>{children}</select>;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${inputClass} min-h-[72px] resize-y ${className}`} {...props} />;
}

export function FieldError({ text }) {
  return text ? <p className="mt-1 text-xs text-danger">{text}</p> : null;
}

export function Hint({ children }) {
  return children ? <p className="mt-1 text-xs text-muted">{children}</p> : null;
}

// Stacked label above control, for filters and compact forms.
export function Field({ label, htmlFor, error, hint, className = '', children }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
      <Hint>{hint}</Hint>
      <FieldError text={error} />
    </div>
  );
}

// Label on the left, control on the right (stacks on phones). Matches long business forms.
export function FormRow({ label, htmlFor, required = false, error, hint, children }) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-1 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
      <label htmlFor={htmlFor} className="text-sm text-ink sm:pt-2">
        {label}{required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <div className="min-w-0">{children}<Hint>{hint}</Hint><FieldError text={error} /></div>
    </div>
  );
}
