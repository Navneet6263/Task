// Smooth mouse-wheel scrolling on every page, modal and scrolling panel.
// A mouse wheel moves the page in big jumps; here each notch glides a little shorter distance instead.
// Left alone: touchpads (small steps, already smooth), Ctrl/Shift + wheel (zoom, sideways), number inputs,
// anything marked data-native-scroll, and everyone who asked their computer for less motion.

const SPEED = 0.85;      // share of the browser's own step: a little calmer than before
const EASE = 0.16;       // share of the remaining distance covered each frame (about 300 ms to settle)
const MIN_WHEEL = 40;    // smaller steps come from touchpads, which already scroll smoothly

const motion = new WeakMap();

const isDocument = (el, doc) => el === doc.scrollingElement || el === doc.documentElement || el === doc.body;
const topOf = (el, win) => (isDocument(el, win.document) ? win.scrollY : el.scrollTop);
const maxOf = (el, win) => (isDocument(el, win.document)
  ? win.document.scrollingElement.scrollHeight - win.innerHeight
  : el.scrollHeight - el.clientHeight);
function moveTo(el, top, win) {
  // "instant": the page's CSS smooth scrolling must not fight the frame-by-frame motion.
  if (isDocument(el, win.document)) win.scrollTo({ top, behavior: 'instant' });
  else if (el.scrollTo) el.scrollTo({ top, behavior: 'instant' });
  else el.scrollTop = top;
}

// The nearest element under the pointer that can still move in this direction; null if none.
export function findScroller(target, direction, win = window) {
  const doc = win.document;
  for (let el = target; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.nodeType !== 1) continue;
    if (el.closest && el.closest('[data-native-scroll]')) return null;
    const style = win.getComputedStyle(el);
    const scrolls = /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    if (scrolls) {
      const top = el.scrollTop;
      const room = direction > 0 ? top < el.scrollHeight - el.clientHeight - 1 : top > 0;
      if (room) return el;
      // A panel that keeps its scroll to itself (overscroll-behavior: contain) does not hand it to the page.
      if (style.overscrollBehaviorY === 'contain') return null;
    }
  }
  const page = doc.scrollingElement || doc.documentElement;
  const top = win.scrollY;
  const room = direction > 0 ? top < page.scrollHeight - win.innerHeight - 1 : top > 0;
  return room ? page : null;
}

// Whether this wheel event should be smoothed at all.
export function shouldSmooth(event, win = window) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return false;
  const pixels = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? win.innerHeight : 1);
  if (pixels < MIN_WHEEL) return false;
  const t = event.target;
  if (t && t.tagName === 'INPUT' && t.type === 'number' && t === win.document.activeElement) return false;
  return true;
}

export function installSmoothWheel(win = window) {
  if (!win || !win.addEventListener || !win.requestAnimationFrame) return () => {};
  if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const onWheel = (event) => {
    if (!shouldSmooth(event, win)) return;
    const step = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? win.innerHeight : 1);
    const el = findScroller(event.target, Math.sign(step), win);
    if (!el) return;
    event.preventDefault();
    let m = motion.get(el);
    if (!m) { m = { target: topOf(el, win), frame: 0 }; motion.set(el, m); }
    if (!m.frame) m.target = topOf(el, win); // start from where it really is (scrollbar, keys, links may have moved it)
    m.target = Math.max(0, Math.min(maxOf(el, win), m.target + step * SPEED));
    if (m.frame) return;
    const tick = () => {
      const now = topOf(el, win);
      const left = m.target - now;
      if (Math.abs(left) < 1) { moveTo(el, m.target, win); m.frame = 0; return; }
      // At least a pixel a frame, so rounding never leaves it a few pixels short.
      moveTo(el, now + Math.sign(left) * Math.max(1, Math.abs(left) * EASE), win);
      // Stuck (the page changed size under it): stop instead of pushing forever.
      if (Math.abs(topOf(el, win) - now) < 0.5) { m.frame = 0; return; }
      m.frame = win.requestAnimationFrame(tick);
    };
    m.frame = win.requestAnimationFrame(tick);
  };

  win.addEventListener('wheel', onWheel, { passive: false });
  return () => win.removeEventListener('wheel', onWheel, { passive: false });
}
