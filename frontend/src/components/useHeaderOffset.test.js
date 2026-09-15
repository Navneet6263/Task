import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useHeaderOffset from './useHeaderOffset';

test('sidebar offset follows layout height, not zoomed visual height, and updates on resize', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const originalObserver = global.ResizeObserver;
  let onResize;
  const disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { onResize = callback; }
    observe() {} disconnect = disconnect;
  };
  const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(88);
  const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 79.2 });
  function Harness() {
    const ref = useHeaderOffset();
    return <div className="shell-root"><header ref={ref}>GreenTask</header></div>;
  }
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    const shell = container.querySelector('.shell-root');
    expect(shell.style.getPropertyValue('--shell-header-height')).toBe('88px');
    height.mockReturnValue(144);
    act(() => onResize());
    expect(shell.style.getPropertyValue('--shell-header-height')).toBe('144px');
  } finally {
    act(() => root.unmount()); container.remove();
    height.mockRestore(); rect.mockRestore(); global.ResizeObserver = originalObserver;
  }
  expect(disconnect).toHaveBeenCalledTimes(1);
});
