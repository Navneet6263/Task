import { findScroller, installSmoothWheel, shouldSmooth } from './smoothWheel';

// jsdom has no layout: give elements the sizes a browser would.
function box({ height, content, top = 0, overflow = 'auto' } = {}) {
  const el = document.createElement('div');
  el.style.overflowY = overflow;
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => height });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => content });
  el.scrollTop = top;
  let current = top;
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => current, set: (v) => { current = Math.max(0, Math.min(content - height, v)); } });
  el.scrollTo = ({ top: next }) => { el.scrollTop = next; };
  return el;
}
const wheel = (target, deltaY, extra = {}) => {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => { document.body.innerHTML = ''; });

test('touchpads, Ctrl or Shift + wheel and sideways scrolling are left to the browser', () => {
  const t = document.createElement('div');
  expect(shouldSmooth({ deltaY: 100, deltaX: 0, deltaMode: 0, target: t })).toBe(true);
  expect(shouldSmooth({ deltaY: 4, deltaX: 0, deltaMode: 0, target: t })).toBe(false);
  expect(shouldSmooth({ deltaY: 100, deltaX: 0, deltaMode: 0, ctrlKey: true, target: t })).toBe(false);
  expect(shouldSmooth({ deltaY: 100, deltaX: 0, deltaMode: 0, shiftKey: true, target: t })).toBe(false);
  expect(shouldSmooth({ deltaY: 10, deltaX: 80, deltaMode: 0, target: t })).toBe(false);
  expect(shouldSmooth({ deltaY: 3, deltaX: 0, deltaMode: 1, target: t })).toBe(true, 'three lines is a mouse notch');
});

test('the panel under the pointer scrolls first, then the page once it reaches its end', () => {
  const panel = box({ height: 100, content: 300 });
  const inner = document.createElement('p');
  panel.appendChild(inner);
  document.body.appendChild(panel);
  expect(findScroller(inner, 1)).toBe(panel);
  panel.scrollTop = 200; // at the bottom
  expect(findScroller(inner, 1)).not.toBe(panel);
  expect(findScroller(inner, -1)).toBe(panel);
  const contained = box({ height: 100, content: 300, top: 200 });
  contained.style.overscrollBehaviorY = 'contain';
  document.body.appendChild(contained);
  expect(findScroller(contained, 1)).toBeNull();
  const native = box({ height: 100, content: 300 });
  native.setAttribute('data-native-scroll', '');
  document.body.appendChild(native);
  expect(findScroller(native, 1)).toBeNull();
});

test('a wheel notch glides the panel a calm distance instead of jumping', () => {
  const frames = [];
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { frames.push(fn); return frames.length; });
  const uninstall = installSmoothWheel(window);
  const panel = box({ height: 100, content: 1000 });
  document.body.appendChild(panel);
  const event = wheel(panel, 100);
  expect(event.defaultPrevented).toBe(true);
  expect(panel.scrollTop).toBe(0); // nothing yet: it moves frame by frame
  frames.shift()();
  expect(panel.scrollTop).toBeGreaterThan(0);
  expect(panel.scrollTop).toBeLessThan(85);
  while (frames.length) frames.shift()();
  expect(panel.scrollTop).toBe(85);
  // A touchpad step is not touched.
  expect(wheel(panel, 3).defaultPrevented).toBe(false);
  uninstall(); raf.mockRestore();
});
