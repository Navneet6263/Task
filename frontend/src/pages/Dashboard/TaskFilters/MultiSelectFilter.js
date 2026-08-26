import React, { useEffect, useRef, useState } from 'react';

const MultiSelectFilter = ({ label, values, onChange, options, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const toggleValue = (value) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };
  const selectedLabel = values.length === 1
    ? options.find((option) => option.value === values[0])?.label || values[0] || label
    : values.length > 1 ? `${values.length} selected` : label;
  const emptyLabel = `No ${label.replace(/^All\s+/i, '').toLowerCase()}`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`h-[34px] min-w-[132px] max-w-[190px] rounded-lg border bg-white/80 px-2.5 text-[11px] font-medium shadow-sm transition-all outline-none flex items-center justify-between gap-2 ${
          values.length > 0
            ? 'border-blue-300 text-blue-700 ring-2 ring-blue-500/10'
            : 'border-slate-200 text-slate-700 hover:border-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        <span className="truncate">{disabled ? emptyLabel : selectedLabel}</span>
        <span className="flex items-center gap-1 shrink-0">
          {values.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-extrabold grid place-items-center">
              {values.length}
            </span>
          )}
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[39px] z-50 w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]" role="listbox" aria-multiselectable="true">
          <div className="max-h-[260px] overflow-y-auto p-1.5">
            {options.map((option) => (
              <label key={option.value} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-slate-700 cursor-pointer hover:bg-blue-50">
                <input
                  type="checkbox"
                  checked={values.includes(option.value)}
                  onChange={() => toggleValue(option.value)}
                  className="h-3.5 w-3.5 rounded accent-blue-600"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
          {values.length > 0 && (
            <button type="button" className="w-full border-t border-slate-100 px-3 py-2 text-left text-[11px] font-bold text-red-600 hover:bg-red-50" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelectFilter;
