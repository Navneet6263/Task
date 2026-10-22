import { useLayoutEffect, useRef } from 'react';

// FLIP animation: when the order of keyed items changes, each item slides from its old
// position to the new one instead of jumping. Reduced-motion users get no transition
// (the global prefers-reduced-motion rule disables transitions).
export default function useFlip(orderKey, axis = 'y') {
  const nodes = useRef(new Map());
  const rects = useRef(new Map());

  useLayoutEffect(() => {
    nodes.current.forEach((node, key) => {
      const next = node.getBoundingClientRect();
      const prev = rects.current.get(key);
      rects.current.set(key, next);
      if (!prev) return;
      const delta = axis === 'y' ? prev.top - next.top : prev.left - next.left;
      if (!delta) return;
      node.style.transition = 'none';
      node.style.transform = axis === 'y' ? `translateY(${delta}px)` : `translateX(${delta}px)`;
      requestAnimationFrame(() => {
        node.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
        node.style.transform = '';
      });
    });
  }, [orderKey, axis]);

  return (key) => (node) => {
    if (node) nodes.current.set(key, node);
    else { nodes.current.delete(key); rects.current.delete(key); }
  };
}
