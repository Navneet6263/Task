import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Shows `content` in a floating card while the pointer (or keyboard focus) is on the child.
// Rendered in a portal so calendar cells that clip their overflow never cut it off.
export default function HoverCard({ content, children, className = '', style }) {
  const anchor = useRef(null);
  const timer = useRef(null);
  const [pos, setPos] = useState(null);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = 288;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const below = r.bottom + 8 + 220 < window.innerHeight;
      setPos({ left, width, ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
    }, 220);
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pos) return undefined;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [pos]);

  return (
    <span ref={anchor} className={className} style={style} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && createPortal(
        <div role="tooltip" className="pointer-events-none fixed z-[120] rounded-xl border border-line bg-surface p-3.5 text-ink shadow-pop motion-safe:animate-fade-in" style={pos}>
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
