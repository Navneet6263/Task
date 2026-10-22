import React from 'react';
import useDialog from '../components/useDialog';

const WIDTHS = { sm: 'max-w-lg', md: 'max-w-2xl', lg: 'max-w-4xl' };

export default function Modal({ title, subtitle, onClose, children, footer, size = 'sm' }) {
  const ref = useDialog(true, onClose);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className={`my-4 flex w-full flex-col rounded-xl border border-line bg-surface text-ink shadow-pop ${WIDTHS[size]}`}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
