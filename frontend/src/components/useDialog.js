import { useEffect, useRef } from 'react';

export default function useDialog(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => [...(ref.current?.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]') || [])]
      .filter(node => !node.disabled && node.getClientRects().length);
    const timer = setTimeout(() => (focusables()[0] || ref.current)?.focus(), 0);
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [open]);
  return ref;
}
