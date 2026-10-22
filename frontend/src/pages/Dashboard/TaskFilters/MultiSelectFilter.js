import React, { useEffect, useRef, useState } from 'react';

const MultiSelectFilter = ({ label, values, onChange, options, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const toggleValue = (value) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const selectedLabel = values.length === 1
    ? options.find((option) => option.value === values[0])?.label || values[0] || label
    : values.length > 1 ? `${values.length} selected` : label;
  const emptyLabel = `No ${label.replace(/^All\s+/i, '').toLowerCase()}`;

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" onClick={() => !disabled && setOpen((current) => !current)} aria-expanded={open} aria-haspopup="listbox" disabled={disabled}
        className={`flex h-9 min-w-[132px] max-w-[190px] items-center justify-between gap-2 rounded-md border bg-surface px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-55
          ${values.length > 0 ? 'border-accent/60 text-accent' : 'border-line text-ink hover:border-muted'}`}>
        <span className="truncate">{disabled ? emptyLabel : selectedLabel}</span>
        <span className="flex shrink-0 items-center gap-1">
          {values.length > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-fg">{values.length}</span>}
          <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-[42px] z-50 w-[220px] overflow-hidden rounded-md border border-line bg-surface shadow-pop" role="listbox" aria-multiselectable="true">
          <div className="max-h-[260px] overflow-y-auto p-1">
            {options.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-xs hover:bg-subtle">
                <input type="checkbox" checked={values.includes(option.value)} onChange={() => toggleValue(option.value)} className="h-3.5 w-3.5 accent-accent" />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
          {values.length > 0 && (
            <button type="button" className="w-full border-t border-line px-3 py-2 text-left text-xs font-semibold text-danger hover:bg-danger-soft" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelectFilter;
