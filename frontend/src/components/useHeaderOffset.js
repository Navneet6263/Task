import { useLayoutEffect, useRef } from 'react';

// The sidebar follows the real header height, including wrapped mobile controls.
export default function useHeaderOffset() {
  const headerRef = useRef(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const root = header.closest('.shell-root');
    // offsetHeight uses layout pixels, so the app's existing CSS zoom isn't applied twice.
    const measure = () => root?.style.setProperty('--shell-header-height', `${header.offsetHeight}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return headerRef;
}
