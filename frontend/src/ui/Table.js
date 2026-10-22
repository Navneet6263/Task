import React from 'react';

export function TableWrap({ className = '', children }) {
  return <div className={`overflow-x-auto rounded-lg border border-line bg-surface ${className}`}>{children}</div>;
}

export function Table({ children }) {
  return <table className="w-full border-collapse text-sm">{children}</table>;
}

export function Th({ align = 'left', className = '', children, ...props }) {
  return (
    <th className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} {...props}>
      {children}
    </th>
  );
}

export function Td({ align = 'left', mono = false, className = '', children, ...props }) {
  return (
    <td className={`border-b border-line px-3 py-2.5 align-top ${align === 'right' ? 'text-right' : ''} ${mono ? 'font-mono tabular-nums' : ''} ${className}`} {...props}>
      {children}
    </td>
  );
}

// A whole row that opens something: clickable and keyboard reachable.
export function ClickRow({ onOpen, children }) {
  return (
    <tr tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}
      className="cursor-pointer last:[&>td]:border-b-0 hover:bg-subtle focus:bg-subtle focus:outline-none">
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, children }) {
  return <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-muted">{children}</td></tr>;
}
